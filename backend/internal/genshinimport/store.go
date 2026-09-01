package genshinimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var sourceRevisionPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)

type PublishOptions struct {
	SourceRevision        string
	GameVersion           string
	SourceRepository      string
	MediaBaseURL          string
	AlternateMediaBaseURL string
}

type Release struct {
	ID          uuid.UUID `json:"id"`
	PublishedAt time.Time `json:"publishedAt"`
	Counts      Counts    `json:"counts"`
}

type Store struct {
	database *pgxpool.Pool
}

func NewStore(database *pgxpool.Pool) *Store {
	return &Store{database: database}
}

func (s *Store) Publish(ctx context.Context, dataset Dataset, assets map[string]MediaAsset, opts PublishOptions) (Release, error) {
	if !sourceRevisionPattern.MatchString(opts.SourceRevision) {
		return Release{}, errors.New("source revision must be a lowercase 40-character Git commit")
	}
	if opts.GameVersion == "" || opts.SourceRepository == "" || opts.MediaBaseURL == "" {
		return Release{}, errors.New("game version, source repository and media base URL are required")
	}
	if err := validateDataset(dataset); err != nil {
		return Release{}, err
	}
	for _, filename := range dataset.MediaFilenames() {
		if _, exists := assets[filename]; !exists {
			return Release{}, fmt.Errorf("media asset %q was not downloaded", filename)
		}
	}
	counts := dataset.Counts()
	counts.MediaAssets = uniqueAssetCount(assets)
	mediaFallbacks := make(map[string]string)
	for filename, asset := range assets {
		if asset.Fallback {
			mediaFallbacks[filename] = asset.FetchedAs
		}
	}
	manifestValues := map[string]any{
		"provider":       "genshin-db",
		"repository":     opts.SourceRepository,
		"revision":       opts.SourceRevision,
		"gameVersion":    opts.GameVersion,
		"mediaBaseURL":   opts.MediaBaseURL,
		"locales":        []string{LocaleEnglish, LocaleRussian},
		"counts":         counts,
		"mediaFallbacks": mediaFallbacks,
	}
	if opts.AlternateMediaBaseURL != "" {
		manifestValues["alternateMediaBaseURL"] = opts.AlternateMediaBaseURL
	}
	manifest, err := json.Marshal(manifestValues)
	if err != nil {
		return Release{}, fmt.Errorf("encode source manifest: %w", err)
	}
	entityCounts, err := json.Marshal(counts)
	if err != nil {
		return Release{}, fmt.Errorf("encode entity counts: %w", err)
	}

	transaction, err := s.database.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Release{}, fmt.Errorf("begin genshin import transaction: %w", err)
	}
	defer transaction.Rollback(ctx) //nolint:errcheck
	if _, err := transaction.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('gildra-genshin-import'))`); err != nil {
		return Release{}, fmt.Errorf("lock genshin import: %w", err)
	}
	var releaseID uuid.UUID
	if err := transaction.QueryRow(ctx, `
		INSERT INTO genshin_catalog_releases (source_revision, game_version, status, source_manifest, entity_counts)
		VALUES ($1, $2, 'staging', $3::jsonb, $4::jsonb)
		RETURNING id`, opts.SourceRevision, opts.GameVersion, string(manifest), string(entityCounts)).Scan(&releaseID); err != nil {
		return Release{}, fmt.Errorf("create genshin staging release: %w", err)
	}
	mediaIDs, err := upsertMedia(ctx, transaction, assets)
	if err != nil {
		return Release{}, err
	}
	if err := insertCharacters(ctx, transaction, releaseID, dataset.Characters, mediaIDs); err != nil {
		return Release{}, err
	}
	if err := insertWeapons(ctx, transaction, releaseID, dataset.Weapons, mediaIDs); err != nil {
		return Release{}, err
	}
	if err := insertArtifacts(ctx, transaction, releaseID, dataset.ArtifactSets, mediaIDs); err != nil {
		return Release{}, err
	}
	if err := insertContent(ctx, transaction, releaseID, dataset.Content, mediaIDs); err != nil {
		return Release{}, err
	}
	if _, err := transaction.Exec(ctx, `UPDATE genshin_catalog_releases SET status='validating' WHERE id=$1`, releaseID); err != nil {
		return Release{}, fmt.Errorf("mark genshin release validating: %w", err)
	}
	if err := validateRelease(ctx, transaction, releaseID, counts); err != nil {
		return Release{}, err
	}
	if _, err := transaction.Exec(ctx, `
		UPDATE genshin_catalog_releases
		SET status='superseded', published_at=NULL
		WHERE status='published' AND id<>$1`, releaseID); err != nil {
		return Release{}, fmt.Errorf("supersede previous genshin release: %w", err)
	}
	var publishedAt time.Time
	if err := transaction.QueryRow(ctx, `
		UPDATE genshin_catalog_releases
		SET status='published', validated_at=now(), published_at=now(), entity_counts=$2::jsonb
		WHERE id=$1
		RETURNING published_at`, releaseID, string(entityCounts)).Scan(&publishedAt); err != nil {
		return Release{}, fmt.Errorf("publish genshin release: %w", err)
	}
	if err := transaction.Commit(ctx); err != nil {
		return Release{}, fmt.Errorf("commit genshin release: %w", err)
	}
	return Release{ID: releaseID, PublishedAt: publishedAt, Counts: counts}, nil
}

func insertContent(ctx context.Context, transaction pgx.Tx, releaseID uuid.UUID, entries []ContentEntry, mediaIDs map[string]uuid.UUID) error {
	for _, entry := range entries {
		var iconID *uuid.UUID
		if entry.IconFilename != "" {
			if asset, exists := mediaIDs[entry.IconFilename]; exists && asset != uuid.Nil {
				iconID = &asset
			}
		}
		var entryID int64
		if err := transaction.QueryRow(ctx, `
			INSERT INTO genshin_content_entries
			    (release_id, category, slug, external_id, icon_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb)
			RETURNING id`, releaseID, entry.Category, entry.Slug, entry.ExternalID, iconID, string(entry.Payload)).Scan(&entryID); err != nil {
			return fmt.Errorf("insert genshin content %s/%s: %w", entry.Category, entry.Slug, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			localized := entry.Localizations[locale]
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_content_localizations
				    (entry_id, locale, name, description, source_payload)
				VALUES ($1,$2,$3,$4,$5::jsonb)`, entryID, locale, localized.Name,
				localized.Description, string(localized.Payload)); err != nil {
				return fmt.Errorf("insert genshin content localization %s/%s/%s: %w", entry.Category, entry.Slug, locale, err)
			}
		}
		for _, media := range entry.Media {
			assetID, exists := mediaIDs[media.Filename]
			if !exists || assetID == uuid.Nil {
				continue
			}
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_content_media (entry_id, media_role, source_filename, asset_id)
				VALUES ($1,$2,$3,$4)`, entryID, media.Role, media.Filename, assetID); err != nil {
				return fmt.Errorf("insert genshin content media %s/%s/%s: %w", entry.Category, entry.Slug, media.Role, err)
			}
		}
	}
	return nil
}

func upsertMedia(ctx context.Context, transaction pgx.Tx, assets map[string]MediaAsset) (map[string]uuid.UUID, error) {
	byFilename := make(map[string]uuid.UUID, len(assets))
	byStorageKey := make(map[string]uuid.UUID)
	for _, filename := range sortedKeys(assets) {
		asset := assets[filename]
		assetID, exists := byStorageKey[asset.StorageKey]
		if !exists {
			err := transaction.QueryRow(ctx, `
				INSERT INTO genshin_media_assets
				    (storage_key, sha256, mime_type, byte_size, width, height, source_url)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (sha256, mime_type) DO UPDATE
				SET source_url=EXCLUDED.source_url
				RETURNING id`, asset.StorageKey, asset.SHA256, asset.MIMEType, asset.ByteSize,
				asset.Width, asset.Height, asset.SourceURL).Scan(&assetID)
			if err != nil {
				return nil, fmt.Errorf("upsert genshin media %q: %w", filename, err)
			}
			byStorageKey[asset.StorageKey] = assetID
		}
		byFilename[filename] = assetID
	}
	return byFilename, nil
}

func insertCharacters(ctx context.Context, transaction pgx.Tx, releaseID uuid.UUID, characters []Character, mediaIDs map[string]uuid.UUID) error {
	for _, character := range characters {
		iconID, err := requiredMediaID(mediaIDs, character.IconFilename)
		if err != nil {
			return fieldError("character", character.Slug, err)
		}
		portraitID, err := requiredMediaID(mediaIDs, character.PortraitFilename)
		if err != nil {
			return fieldError("character", character.Slug, err)
		}
		var characterID int64
		if err := transaction.QueryRow(ctx, `
			INSERT INTO genshin_characters
			    (release_id, external_id, slug, rarity, element, weapon_type, region, body_type,
			     birthday_month, birthday_day, icon_asset_id, portrait_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
			RETURNING id`, releaseID, character.ExternalID, character.Slug, character.Rarity,
			character.Element, character.WeaponType, character.Region, character.BodyType,
			character.BirthdayMonth, character.BirthdayDay, iconID, portraitID, string(character.Payload)).Scan(&characterID); err != nil {
			return fmt.Errorf("insert character %q: %w", character.Slug, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			localized := character.Localizations[locale]
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_character_localizations (character_id, locale, name, title, description)
				VALUES ($1,$2,$3,$4,$5)`, characterID, locale, localized.Name, localized.Title, localized.Description); err != nil {
				return fmt.Errorf("insert character localization %q/%s: %w", character.Slug, locale, err)
			}
		}
		if err := insertTalents(ctx, transaction, characterID, character.Slug, character.Talents, mediaIDs); err != nil {
			return err
		}
		if err := insertConstellations(ctx, transaction, characterID, character.Slug, character.Constellations, mediaIDs); err != nil {
			return err
		}
	}
	return nil
}

func insertTalents(ctx context.Context, transaction pgx.Tx, characterID int64, characterSlug string, talents []Talent, mediaIDs map[string]uuid.UUID) error {
	for _, talent := range talents {
		iconID, err := requiredMediaID(mediaIDs, talent.IconFilename)
		if err != nil {
			return fieldError("talent", characterSlug+"/"+talent.ExternalKey, err)
		}
		var talentID int64
		if err := transaction.QueryRow(ctx, `
			INSERT INTO genshin_character_talents
			    (character_id, external_key, kind, display_order, icon_asset_id, scaling, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
			RETURNING id`, characterID, talent.ExternalKey, talent.Kind, talent.DisplayOrder,
			iconID, string(talent.Scaling), string(talent.Payload)).Scan(&talentID); err != nil {
			return fmt.Errorf("insert talent %q/%s: %w", characterSlug, talent.ExternalKey, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			localized := talent.Localizations[locale]
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_character_talent_localizations (talent_id, locale, name, description)
				VALUES ($1,$2,$3,$4)`, talentID, locale, localized.Name, localized.Description); err != nil {
				return fmt.Errorf("insert talent localization %q/%s/%s: %w", characterSlug, talent.ExternalKey, locale, err)
			}
		}
	}
	return nil
}

func insertConstellations(ctx context.Context, transaction pgx.Tx, characterID int64, characterSlug string, constellations []Constellation, mediaIDs map[string]uuid.UUID) error {
	for _, constellation := range constellations {
		iconID, err := requiredMediaID(mediaIDs, constellation.IconFilename)
		if err != nil {
			return fieldError("constellation", characterSlug+"/"+constellation.ExternalKey, err)
		}
		var constellationID int64
		if err := transaction.QueryRow(ctx, `
			INSERT INTO genshin_character_constellations
			    (character_id, external_key, position, icon_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5::jsonb)
			RETURNING id`, characterID, constellation.ExternalKey, constellation.Position,
			iconID, string(constellation.Payload)).Scan(&constellationID); err != nil {
			return fmt.Errorf("insert constellation %q/%s: %w", characterSlug, constellation.ExternalKey, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			localized := constellation.Localizations[locale]
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_character_constellation_localizations
				    (constellation_id, locale, name, description)
				VALUES ($1,$2,$3,$4)`, constellationID, locale, localized.Name, localized.Description); err != nil {
				return fmt.Errorf("insert constellation localization %q/%s/%s: %w", characterSlug, constellation.ExternalKey, locale, err)
			}
		}
	}
	return nil
}

func insertWeapons(ctx context.Context, transaction pgx.Tx, releaseID uuid.UUID, weapons []Weapon, mediaIDs map[string]uuid.UUID) error {
	for _, weapon := range weapons {
		iconID, err := requiredMediaID(mediaIDs, weapon.IconFilename)
		if err != nil {
			return fieldError("weapon", weapon.Slug, err)
		}
		var weaponID int64
		if err := transaction.QueryRow(ctx, `
			INSERT INTO genshin_weapons
			    (release_id, external_id, slug, rarity, weapon_type, base_attack, secondary_stat,
			     secondary_stat_value, icon_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
			RETURNING id`, releaseID, weapon.ExternalID, weapon.Slug, weapon.Rarity, weapon.WeaponType,
			weapon.BaseAttack, weapon.SecondaryStat, weapon.SecondaryStatValue, iconID, string(weapon.Payload)).Scan(&weaponID); err != nil {
			return fmt.Errorf("insert weapon %q: %w", weapon.Slug, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			localized := weapon.Localizations[locale]
			refinements, err := json.Marshal(localized.RefinementDescriptions)
			if err != nil {
				return fmt.Errorf("encode weapon refinements %q/%s: %w", weapon.Slug, locale, err)
			}
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_weapon_localizations
				    (weapon_id, locale, name, description, passive_name, passive_description, refinement_descriptions)
				VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, weaponID, locale, localized.Name,
				localized.Description, localized.PassiveName, localized.PassiveDescription, string(refinements)); err != nil {
				return fmt.Errorf("insert weapon localization %q/%s: %w", weapon.Slug, locale, err)
			}
		}
	}
	return nil
}

func insertArtifacts(ctx context.Context, transaction pgx.Tx, releaseID uuid.UUID, artifacts []ArtifactSet, mediaIDs map[string]uuid.UUID) error {
	for _, artifact := range artifacts {
		iconID, err := requiredMediaID(mediaIDs, artifact.IconFilename)
		if err != nil {
			return fieldError("artifact", artifact.Slug, err)
		}
		var artifactID int64
		if err := transaction.QueryRow(ctx, `
			INSERT INTO genshin_artifact_sets
			    (release_id, external_id, slug, min_rarity, max_rarity, icon_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
			RETURNING id`, releaseID, artifact.ExternalID, artifact.Slug, artifact.MinRarity,
			artifact.MaxRarity, iconID, string(artifact.Payload)).Scan(&artifactID); err != nil {
			return fmt.Errorf("insert artifact set %q: %w", artifact.Slug, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			localized := artifact.Localizations[locale]
			if _, err := transaction.Exec(ctx, `
				INSERT INTO genshin_artifact_set_localizations
				    (artifact_set_id, locale, name, two_piece_bonus, four_piece_bonus)
				VALUES ($1,$2,$3,$4,$5)`, artifactID, locale, localized.Name,
				localized.TwoPieceBonus, localized.FourPieceBonus); err != nil {
				return fmt.Errorf("insert artifact localization %q/%s: %w", artifact.Slug, locale, err)
			}
		}
		for _, piece := range artifact.Pieces {
			pieceIconID, err := requiredMediaID(mediaIDs, piece.IconFilename)
			if err != nil {
				return fieldError("artifact piece", artifact.Slug+"/"+piece.Slot, err)
			}
			var pieceID int64
			if err := transaction.QueryRow(ctx, `
				INSERT INTO genshin_artifact_pieces (artifact_set_id, slot, icon_asset_id, source_payload)
				VALUES ($1,$2,$3,$4::jsonb)
				RETURNING id`, artifactID, piece.Slot, pieceIconID, string(piece.Payload)).Scan(&pieceID); err != nil {
				return fmt.Errorf("insert artifact piece %q/%s: %w", artifact.Slug, piece.Slot, err)
			}
			for _, locale := range []string{LocaleEnglish, LocaleRussian} {
				localized := piece.Localizations[locale]
				if _, err := transaction.Exec(ctx, `
					INSERT INTO genshin_artifact_piece_localizations
					    (artifact_piece_id, locale, name, description)
					VALUES ($1,$2,$3,$4)`, pieceID, locale, localized.Name, localized.Description); err != nil {
					return fmt.Errorf("insert artifact piece localization %q/%s/%s: %w", artifact.Slug, piece.Slot, locale, err)
				}
			}
		}
	}
	return nil
}

func validateRelease(ctx context.Context, transaction pgx.Tx, releaseID uuid.UUID, expected Counts) error {
	var actual Counts
	if err := transaction.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM genshin_characters WHERE release_id=$1),
		  (SELECT count(*) FROM genshin_weapons WHERE release_id=$1),
		  (SELECT count(*) FROM genshin_artifact_sets WHERE release_id=$1),
		  (SELECT count(*) FROM genshin_artifact_pieces p JOIN genshin_artifact_sets s ON s.id=p.artifact_set_id WHERE s.release_id=$1),
		  (SELECT count(*) FROM genshin_character_talents t JOIN genshin_characters c ON c.id=t.character_id WHERE c.release_id=$1),
		  (SELECT count(*) FROM genshin_character_constellations n JOIN genshin_characters c ON c.id=n.character_id WHERE c.release_id=$1)`, releaseID).Scan(
		&actual.Characters, &actual.Weapons, &actual.ArtifactSets, &actual.ArtifactPieces,
		&actual.Talents, &actual.Constellations); err != nil {
		return fmt.Errorf("read genshin release counts: %w", err)
	}
	actual.MediaAssets = expected.MediaAssets
	if err := transaction.QueryRow(ctx, `SELECT count(*) FROM genshin_content_entries WHERE release_id=$1`, releaseID).Scan(&actual.ContentEntries); err != nil {
		return fmt.Errorf("read genshin generic content count: %w", err)
	}
	actual.ContentByCategory = make(map[string]int)
	categoryRows, err := transaction.Query(ctx, `SELECT category, count(*) FROM genshin_content_entries WHERE release_id=$1 GROUP BY category`, releaseID)
	if err != nil {
		return fmt.Errorf("read genshin generic content categories: %w", err)
	}
	for categoryRows.Next() {
		var category string
		var count int
		if err := categoryRows.Scan(&category, &count); err != nil {
			categoryRows.Close()
			return fmt.Errorf("scan genshin generic content category: %w", err)
		}
		actual.ContentByCategory[category] = count
	}
	if err := categoryRows.Err(); err != nil {
		categoryRows.Close()
		return fmt.Errorf("iterate genshin generic content categories: %w", err)
	}
	categoryRows.Close()
	if !reflect.DeepEqual(actual, expected) {
		return fmt.Errorf("genshin release counts %+v do not match expected %+v", actual, expected)
	}
	var missingLocalizations, missingMedia int
	if err := transaction.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM genshin_characters c WHERE c.release_id=$1 AND (SELECT count(*) FROM genshin_character_localizations l WHERE l.character_id=c.id)<>2) +
		  (SELECT count(*) FROM genshin_weapons w WHERE w.release_id=$1 AND (SELECT count(*) FROM genshin_weapon_localizations l WHERE l.weapon_id=w.id)<>2) +
		  (SELECT count(*) FROM genshin_artifact_sets s WHERE s.release_id=$1 AND (SELECT count(*) FROM genshin_artifact_set_localizations l WHERE l.artifact_set_id=s.id)<>2) +
		  (SELECT count(*) FROM genshin_character_talents t JOIN genshin_characters c ON c.id=t.character_id WHERE c.release_id=$1 AND (SELECT count(*) FROM genshin_character_talent_localizations l WHERE l.talent_id=t.id)<>2) +
			(SELECT count(*) FROM genshin_character_constellations n JOIN genshin_characters c ON c.id=n.character_id WHERE c.release_id=$1 AND (SELECT count(*) FROM genshin_character_constellation_localizations l WHERE l.constellation_id=n.id)<>2) +
		  (SELECT count(*) FROM genshin_artifact_pieces p JOIN genshin_artifact_sets s ON s.id=p.artifact_set_id WHERE s.release_id=$1 AND (SELECT count(*) FROM genshin_artifact_piece_localizations l WHERE l.artifact_piece_id=p.id)<>2) +
		  (SELECT count(*) FROM genshin_content_entries e WHERE e.release_id=$1 AND (SELECT count(*) FROM genshin_content_localizations l WHERE l.entry_id=e.id)<>2),
		  (SELECT count(*) FROM genshin_characters WHERE release_id=$1 AND (icon_asset_id IS NULL OR portrait_asset_id IS NULL)) +
		  (SELECT count(*) FROM genshin_weapons WHERE release_id=$1 AND icon_asset_id IS NULL) +
		  (SELECT count(*) FROM genshin_artifact_sets WHERE release_id=$1 AND icon_asset_id IS NULL) +
		  (SELECT count(*) FROM genshin_character_talents t JOIN genshin_characters c ON c.id=t.character_id WHERE c.release_id=$1 AND t.icon_asset_id IS NULL) +
		  (SELECT count(*) FROM genshin_character_constellations n JOIN genshin_characters c ON c.id=n.character_id WHERE c.release_id=$1 AND n.icon_asset_id IS NULL) +
		  (SELECT count(*) FROM genshin_artifact_pieces p JOIN genshin_artifact_sets s ON s.id=p.artifact_set_id WHERE s.release_id=$1 AND p.icon_asset_id IS NULL)`, releaseID).Scan(&missingLocalizations, &missingMedia); err != nil {
		return fmt.Errorf("validate genshin release completeness: %w", err)
	}
	if missingLocalizations != 0 || missingMedia != 0 {
		return fmt.Errorf("genshin release is incomplete: missing_localizations=%d missing_media=%d", missingLocalizations, missingMedia)
	}
	return nil
}

func requiredMediaID(mediaIDs map[string]uuid.UUID, filename string) (uuid.UUID, error) {
	assetID, exists := mediaIDs[filename]
	if !exists || assetID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("media ID for %q is missing", filename)
	}
	return assetID, nil
}

func uniqueAssetCount(assets map[string]MediaAsset) int {
	unique := make(map[string]struct{}, len(assets))
	for _, asset := range assets {
		unique[asset.StorageKey] = struct{}{}
	}
	return len(unique)
}
