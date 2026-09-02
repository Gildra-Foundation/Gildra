package leagueimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Release struct {
	ID          uuid.UUID `json:"id"`
	Version     string    `json:"version"`
	PublishedAt time.Time `json:"publishedAt"`
	Counts      Counts    `json:"counts"`
}

type Store struct{ database *pgxpool.Pool }

func NewStore(database *pgxpool.Pool) *Store { return &Store{database: database} }

func (s *Store) Publish(ctx context.Context, dataset Dataset, assets map[string]MediaAsset) (Release, error) {
	if err := validateDataset(dataset); err != nil {
		return Release{}, err
	}
	for _, endpoint := range dataset.MediaURLs() {
		if _, exists := assets[endpoint]; !exists {
			return Release{}, fmt.Errorf("media asset %q was not downloaded", endpoint)
		}
	}
	counts := dataset.Counts()
	uniqueMedia := make(map[string]struct{}, len(assets))
	for _, asset := range assets {
		uniqueMedia[asset.StorageKey] = struct{}{}
	}
	counts.MediaAssets = len(uniqueMedia)
	manifest, err := json.Marshal(map[string]any{
		"provider": "Riot Data Dragon", "baseURL": dataDragonBase, "version": dataset.Version,
		"locales": []string{LocaleEnglish, LocaleRussian}, "sourceURLs": dataset.SourceURLs, "counts": counts,
	})
	if err != nil {
		return Release{}, fmt.Errorf("encode source manifest: %w", err)
	}
	entityCounts, err := json.Marshal(counts)
	if err != nil {
		return Release{}, fmt.Errorf("encode entity counts: %w", err)
	}

	tx, err := s.database.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Release{}, fmt.Errorf("begin League catalog transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('gildra-league-of-legends-import'))`); err != nil {
		return Release{}, fmt.Errorf("lock League catalog import: %w", err)
	}
	var releaseID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO lol_catalog_releases (ddragon_version, status, source_manifest, entity_counts)
		VALUES ($1, 'staging', $2, $3) RETURNING id`, dataset.Version, manifest, entityCounts).Scan(&releaseID); err != nil {
		return Release{}, fmt.Errorf("create League catalog release: %w", err)
	}
	assetIDs, err := insertAssets(ctx, tx, assets)
	if err != nil {
		return Release{}, err
	}
	for _, champion := range dataset.Champions {
		if err := insertChampion(ctx, tx, releaseID, champion, assetIDs); err != nil {
			return Release{}, err
		}
	}
	for _, entry := range dataset.Static {
		if err := insertStaticEntry(ctx, tx, releaseID, entry, assetIDs); err != nil {
			return Release{}, err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE lol_catalog_releases SET status = 'validating', validated_at = now() WHERE id = $1`, releaseID); err != nil {
		return Release{}, fmt.Errorf("mark League release validating: %w", err)
	}
	if err := validateStored(ctx, tx, releaseID, counts); err != nil {
		return Release{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE lol_catalog_releases SET status = 'superseded' WHERE status = 'published'`); err != nil {
		return Release{}, fmt.Errorf("supersede League release: %w", err)
	}
	var publishedAt time.Time
	if err := tx.QueryRow(ctx, `UPDATE lol_catalog_releases SET status = 'published', published_at = now() WHERE id = $1 RETURNING published_at`, releaseID).Scan(&publishedAt); err != nil {
		return Release{}, fmt.Errorf("publish League release: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Release{}, fmt.Errorf("commit League catalog release: %w", err)
	}
	return Release{ID: releaseID, Version: dataset.Version, PublishedAt: publishedAt, Counts: counts}, nil
}

func insertAssets(ctx context.Context, tx pgx.Tx, assets map[string]MediaAsset) (map[string]uuid.UUID, error) {
	ids := make(map[string]uuid.UUID, len(assets))
	for endpoint, asset := range assets {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `
			INSERT INTO lol_media_assets (storage_key, sha256, mime_type, byte_size, width, height, source_url)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (sha256, mime_type) DO UPDATE SET
				byte_size = EXCLUDED.byte_size, width = EXCLUDED.width, height = EXCLUDED.height
			RETURNING id`, asset.StorageKey, asset.SHA256, asset.MIMEType, asset.ByteSize, asset.Width, asset.Height, asset.SourceURL).Scan(&id)
		if err != nil {
			return nil, fmt.Errorf("store League media %s: %w", endpoint, err)
		}
		ids[endpoint] = id
	}
	return ids, nil
}

func assetID(ids map[string]uuid.UUID, endpoint string) any {
	if endpoint == "" {
		return nil
	}
	value, exists := ids[endpoint]
	if !exists {
		return nil
	}
	return value
}

func insertChampion(ctx context.Context, tx pgx.Tx, releaseID uuid.UUID, champion Champion, assets map[string]uuid.UUID) error {
	var championID int64
	err := tx.QueryRow(ctx, `
		INSERT INTO lol_champions
		(release_id, riot_key, slug, internal_name, resource_type, tags, info, stats,
		 icon_asset_id, splash_asset_id, loading_asset_id, tile_asset_id, source_payload)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		releaseID, champion.RiotKey, champion.Slug, champion.InternalName, champion.ResourceType, nonNilStrings(champion.Tags),
		champion.Info, champion.Stats, assetID(assets, champion.IconURL), assetID(assets, champion.SplashURL),
		assetID(assets, champion.LoadingURL), assetID(assets, champion.TileURL), champion.Payload).Scan(&championID)
	if err != nil {
		return fmt.Errorf("store champion %s: %w", champion.Slug, err)
	}
	for _, locale := range []string{LocaleEnglish, LocaleRussian} {
		value := champion.Localizations[locale]
		if _, err := tx.Exec(ctx, `
			INSERT INTO lol_champion_localizations
			(champion_id, locale, name, title, blurb, lore, ally_tips, enemy_tips)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, championID, locale, value.Name, value.Title, value.Blurb, value.Lore, nonNilStrings(value.AllyTips), nonNilStrings(value.EnemyTips)); err != nil {
			return fmt.Errorf("store champion %s %s localization: %w", champion.Slug, locale, err)
		}
	}
	for _, ability := range champion.Abilities {
		var abilityID int64
		if err := tx.QueryRow(ctx, `
			INSERT INTO lol_champion_abilities
			(champion_id, ability_key, kind, slot, display_order, cooldowns, costs, ranges, variables, effects, icon_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, championID, ability.Key, ability.Kind,
			ability.Slot, ability.DisplayOrder, ability.Cooldowns, ability.Costs, ability.Ranges, ability.Variables,
			ability.Effects, assetID(assets, ability.IconURL), ability.Payload).Scan(&abilityID); err != nil {
			return fmt.Errorf("store champion %s ability %s: %w", champion.Slug, ability.Key, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			value := ability.Localizations[locale]
			if _, err := tx.Exec(ctx, `INSERT INTO lol_champion_ability_localizations (ability_id, locale, name, description, tooltip) VALUES ($1,$2,$3,$4,$5)`, abilityID, locale, value.Name, value.Description, value.Tooltip); err != nil {
				return fmt.Errorf("store champion %s ability localization: %w", champion.Slug, err)
			}
		}
	}
	for _, skin := range champion.Skins {
		var skinID int64
		if err := tx.QueryRow(ctx, `
			INSERT INTO lol_champion_skins
			(champion_id, riot_skin_id, skin_number, has_chromas, splash_asset_id, loading_asset_id, tile_asset_id, source_payload)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, championID, skin.RiotID, skin.Number, skin.HasChromas,
			assetID(assets, skin.SplashURL), assetID(assets, skin.LoadingURL), assetID(assets, skin.TileURL), skin.Payload).Scan(&skinID); err != nil {
			return fmt.Errorf("store champion %s skin %d: %w", champion.Slug, skin.Number, err)
		}
		for _, locale := range []string{LocaleEnglish, LocaleRussian} {
			if _, err := tx.Exec(ctx, `INSERT INTO lol_champion_skin_localizations (skin_id, locale, name) VALUES ($1,$2,$3)`, skinID, locale, skin.Localizations[locale].Name); err != nil {
				return fmt.Errorf("store champion %s skin localization: %w", champion.Slug, err)
			}
		}
	}
	return nil
}

func insertStaticEntry(ctx context.Context, tx pgx.Tx, releaseID uuid.UUID, entry StaticEntry, assets map[string]uuid.UUID) error {
	var entryID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO lol_static_entries (release_id, category, external_key, slug, tags, icon_asset_id, source_payload)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, releaseID, entry.Category, entry.ExternalKey, entry.Slug,
		nonNilStrings(entry.Tags), assetID(assets, entry.IconURL), entry.Payload).Scan(&entryID); err != nil {
		return fmt.Errorf("store %s %s: %w", entry.Category, entry.ExternalKey, err)
	}
	for _, locale := range []string{LocaleEnglish, LocaleRussian} {
		value, exists := entry.Localizations[locale]
		if !exists {
			return fmt.Errorf("%s %s missing %s localization", entry.Category, entry.ExternalKey, locale)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO lol_static_entry_localizations (entry_id, locale, name, description, source_payload)
			VALUES ($1,$2,$3,$4,$5)`, entryID, locale, value.Name, value.Description, value.Payload); err != nil {
			return fmt.Errorf("store %s %s localization: %w", entry.Category, entry.ExternalKey, err)
		}
	}
	return nil
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func validateStored(ctx context.Context, tx pgx.Tx, releaseID uuid.UUID, expected Counts) error {
	var actual Counts
	err := tx.QueryRow(ctx, `
		SELECT
		 (SELECT count(*) FROM lol_champions WHERE release_id=$1),
		 (SELECT count(*) FROM lol_champion_abilities a JOIN lol_champions c ON c.id=a.champion_id WHERE c.release_id=$1),
		 (SELECT count(*) FROM lol_champion_skins s JOIN lol_champions c ON c.id=s.champion_id WHERE c.release_id=$1),
		 (SELECT count(*) FROM lol_static_entries WHERE release_id=$1)`, releaseID).Scan(&actual.Champions, &actual.Abilities, &actual.Skins, &actual.StaticEntries)
	if err != nil {
		return fmt.Errorf("validate stored League counts: %w", err)
	}
	if actual.Champions != expected.Champions || actual.Abilities != expected.Abilities || actual.Skins != expected.Skins || actual.StaticEntries != expected.StaticEntries {
		return fmt.Errorf("stored League counts mismatch: expected %+v, got %+v", expected, actual)
	}
	var missingLocalizations, missingAssets int
	if err := tx.QueryRow(ctx, `
		SELECT
		 (SELECT count(*) FROM lol_champions c WHERE c.release_id=$1 AND
		   ((SELECT count(*) FROM lol_champion_localizations l WHERE l.champion_id=c.id) <> 2)),
		 (SELECT count(*) FROM lol_champions c WHERE c.release_id=$1 AND
		   (c.icon_asset_id IS NULL OR c.splash_asset_id IS NULL OR c.loading_asset_id IS NULL OR c.tile_asset_id IS NULL))`, releaseID).Scan(&missingLocalizations, &missingAssets); err != nil {
		return fmt.Errorf("validate League coverage: %w", err)
	}
	if missingLocalizations != 0 || missingAssets != 0 {
		return errors.New("League release failed localization or required champion asset validation")
	}
	return nil
}
