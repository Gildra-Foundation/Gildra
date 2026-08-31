package genshin

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidCursor = errors.New("invalid cursor")
	cursorValue      = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
)

type Service struct {
	postgres *pgxpool.Pool
}

type Status struct {
	Ready          bool       `json:"ready"`
	ReleaseID      string     `json:"releaseId,omitempty"`
	SourceRevision string     `json:"sourceRevision,omitempty"`
	GameVersion    string     `json:"gameVersion,omitempty"`
	PublishedAt    *time.Time `json:"publishedAt,omitempty"`
	Characters     int64      `json:"characters"`
	Weapons        int64      `json:"weapons"`
	ArtifactSets   int64      `json:"artifactSets"`
	Talents        int64      `json:"talents"`
	MediaAssets    int64      `json:"mediaAssets"`
	Locales        []string   `json:"locales"`
}

type ListParams struct {
	Locale     string
	Query      string
	Cursor     string
	Limit      int
	Rarity     int
	Element    string
	WeaponType string
}

type Pagination struct {
	NextCursor string `json:"nextCursor,omitempty"`
	HasMore    bool   `json:"hasMore"`
	Limit      int    `json:"limit"`
}

type CharacterSummary struct {
	ID             int64   `json:"id"`
	ExternalID     int32   `json:"externalId"`
	Slug           string  `json:"slug"`
	Name           string  `json:"name"`
	Title          string  `json:"title"`
	Rarity         int16   `json:"rarity"`
	Element        string  `json:"element"`
	WeaponType     string  `json:"weaponType"`
	Region         string  `json:"region"`
	IconURL        *string `json:"iconUrl"`
	PortraitURL    *string `json:"portraitUrl"`
	Locale         string  `json:"locale"`
	LocaleFallback bool    `json:"localeFallback"`
	TalentCount    int64   `json:"talentCount"`
}

type WeaponSummary struct {
	ID                 int64    `json:"id"`
	ExternalID         int32    `json:"externalId"`
	Slug               string   `json:"slug"`
	Name               string   `json:"name"`
	Rarity             int16    `json:"rarity"`
	WeaponType         string   `json:"weaponType"`
	BaseAttack         *float64 `json:"baseAttack"`
	SecondaryStat      string   `json:"secondaryStat"`
	SecondaryStatValue *float64 `json:"secondaryStatValue"`
	IconURL            *string  `json:"iconUrl"`
	Locale             string   `json:"locale"`
	LocaleFallback     bool     `json:"localeFallback"`
}

type ArtifactSetSummary struct {
	ID             int64   `json:"id"`
	ExternalID     int32   `json:"externalId"`
	Slug           string  `json:"slug"`
	Name           string  `json:"name"`
	MinRarity      int16   `json:"minRarity"`
	MaxRarity      int16   `json:"maxRarity"`
	TwoPieceBonus  string  `json:"twoPieceBonus"`
	FourPieceBonus string  `json:"fourPieceBonus"`
	IconURL        *string `json:"iconUrl"`
	Locale         string  `json:"locale"`
	LocaleFallback bool    `json:"localeFallback"`
	PieceCount     int64   `json:"pieceCount"`
}

type Page[T any] struct {
	Data       []T        `json:"data"`
	Pagination Pagination `json:"pagination"`
}

func NewService(postgres *pgxpool.Pool) *Service {
	return &Service{postgres: postgres}
}

func (s *Service) Status(ctx context.Context) (Status, error) {
	status := Status{Locales: []string{"en_US", "ru_RU"}}
	err := s.postgres.QueryRow(ctx, `
		SELECT release.id::text, release.source_revision, release.game_version, release.published_at,
		       (SELECT count(*) FROM genshin_characters WHERE release_id = release.id),
		       (SELECT count(*) FROM genshin_weapons WHERE release_id = release.id),
		       (SELECT count(*) FROM genshin_artifact_sets WHERE release_id = release.id),
		       (SELECT count(*) FROM genshin_character_talents talent
		          JOIN genshin_characters character ON character.id = talent.character_id
		         WHERE character.release_id = release.id),
		       (SELECT count(*) FROM genshin_media_assets)
		FROM genshin_current_release release`).Scan(
		&status.ReleaseID, &status.SourceRevision, &status.GameVersion, &status.PublishedAt,
		&status.Characters, &status.Weapons, &status.ArtifactSets, &status.Talents, &status.MediaAssets,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return status, nil
	}
	if err != nil {
		return Status{}, fmt.Errorf("read genshin catalog status: %w", err)
	}
	status.Ready = true
	return status, nil
}

func (s *Service) ListCharacters(ctx context.Context, params ListParams) (Page[CharacterSummary], error) {
	after, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page[CharacterSummary]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT character.id, character.external_id, character.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), character.slug),
		       COALESCE(NULLIF(localized.title, ''), NULLIF(english.title, ''), ''),
		       character.rarity, character.element, character.weapon_type, character.region,
		       CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/genshin-impact/media/' || icon.storage_key END,
		       CASE WHEN portrait.storage_key IS NULL THEN NULL ELSE '/genshin-impact/media/' || portrait.storage_key END,
		       $1, localized.character_id IS NULL,
		       (SELECT count(*) FROM genshin_character_talents talent WHERE talent.character_id = character.id)
		FROM genshin_characters character
		JOIN genshin_current_release release ON release.id = character.release_id
		LEFT JOIN genshin_character_localizations localized
		       ON localized.character_id = character.id AND localized.locale = $1
		LEFT JOIN genshin_character_localizations english
		       ON english.character_id = character.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = character.icon_asset_id
		LEFT JOIN genshin_media_assets portrait ON portrait.id = character.portrait_asset_id
		WHERE ($2 = '' OR lower(COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), character.slug)) LIKE '%' || lower($2) || '%')
		  AND ($3 = 0 OR character.rarity = $3)
		  AND ($4 = '' OR character.element = $4)
		  AND ($5 = '' OR character.weapon_type = $5)
		  AND ($6 = '' OR character.slug > $6)
		ORDER BY character.slug
		LIMIT $7`, params.Locale, params.Query, params.Rarity, params.Element, params.WeaponType, after, params.Limit+1)
	if err != nil {
		return Page[CharacterSummary]{}, fmt.Errorf("list genshin characters: %w", err)
	}
	defer rows.Close()
	items := make([]CharacterSummary, 0, params.Limit+1)
	for rows.Next() {
		var item CharacterSummary
		if err := rows.Scan(&item.ID, &item.ExternalID, &item.Slug, &item.Name, &item.Title, &item.Rarity,
			&item.Element, &item.WeaponType, &item.Region, &item.IconURL, &item.PortraitURL, &item.Locale,
			&item.LocaleFallback, &item.TalentCount); err != nil {
			return Page[CharacterSummary]{}, fmt.Errorf("scan genshin character: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[CharacterSummary]{}, fmt.Errorf("iterate genshin characters: %w", err)
	}
	return makePage(items, params.Limit, func(item CharacterSummary) string { return item.Slug }), nil
}

func (s *Service) ListWeapons(ctx context.Context, params ListParams) (Page[WeaponSummary], error) {
	after, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page[WeaponSummary]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT weapon.id, weapon.external_id, weapon.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), weapon.slug),
		       weapon.rarity, weapon.weapon_type, weapon.base_attack::float8, weapon.secondary_stat,
		       weapon.secondary_stat_value::float8,
		       CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/genshin-impact/media/' || icon.storage_key END,
		       $1, localized.weapon_id IS NULL
		FROM genshin_weapons weapon
		JOIN genshin_current_release release ON release.id = weapon.release_id
		LEFT JOIN genshin_weapon_localizations localized
		       ON localized.weapon_id = weapon.id AND localized.locale = $1
		LEFT JOIN genshin_weapon_localizations english
		       ON english.weapon_id = weapon.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = weapon.icon_asset_id
		WHERE ($2 = '' OR lower(COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), weapon.slug)) LIKE '%' || lower($2) || '%')
		  AND ($3 = 0 OR weapon.rarity = $3)
		  AND ($4 = '' OR weapon.weapon_type = $4)
		  AND ($5 = '' OR weapon.slug > $5)
		ORDER BY weapon.slug
		LIMIT $6`, params.Locale, params.Query, params.Rarity, params.WeaponType, after, params.Limit+1)
	if err != nil {
		return Page[WeaponSummary]{}, fmt.Errorf("list genshin weapons: %w", err)
	}
	defer rows.Close()
	items := make([]WeaponSummary, 0, params.Limit+1)
	for rows.Next() {
		var item WeaponSummary
		if err := rows.Scan(&item.ID, &item.ExternalID, &item.Slug, &item.Name, &item.Rarity, &item.WeaponType,
			&item.BaseAttack, &item.SecondaryStat, &item.SecondaryStatValue, &item.IconURL, &item.Locale,
			&item.LocaleFallback); err != nil {
			return Page[WeaponSummary]{}, fmt.Errorf("scan genshin weapon: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[WeaponSummary]{}, fmt.Errorf("iterate genshin weapons: %w", err)
	}
	return makePage(items, params.Limit, func(item WeaponSummary) string { return item.Slug }), nil
}

func (s *Service) ListArtifactSets(ctx context.Context, params ListParams) (Page[ArtifactSetSummary], error) {
	after, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page[ArtifactSetSummary]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT artifact.id, artifact.external_id, artifact.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), artifact.slug),
		       artifact.min_rarity, artifact.max_rarity,
		       COALESCE(NULLIF(localized.two_piece_bonus, ''), NULLIF(english.two_piece_bonus, ''), ''),
		       COALESCE(NULLIF(localized.four_piece_bonus, ''), NULLIF(english.four_piece_bonus, ''), ''),
		       CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/genshin-impact/media/' || icon.storage_key END,
		       $1, localized.artifact_set_id IS NULL,
		       (SELECT count(*) FROM genshin_artifact_pieces piece WHERE piece.artifact_set_id = artifact.id)
		FROM genshin_artifact_sets artifact
		JOIN genshin_current_release release ON release.id = artifact.release_id
		LEFT JOIN genshin_artifact_set_localizations localized
		       ON localized.artifact_set_id = artifact.id AND localized.locale = $1
		LEFT JOIN genshin_artifact_set_localizations english
		       ON english.artifact_set_id = artifact.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = artifact.icon_asset_id
		WHERE ($2 = '' OR lower(COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), artifact.slug)) LIKE '%' || lower($2) || '%')
		  AND ($3 = 0 OR artifact.max_rarity = $3)
		  AND ($4 = '' OR artifact.slug > $4)
		ORDER BY artifact.slug
		LIMIT $5`, params.Locale, params.Query, params.Rarity, after, params.Limit+1)
	if err != nil {
		return Page[ArtifactSetSummary]{}, fmt.Errorf("list genshin artifact sets: %w", err)
	}
	defer rows.Close()
	items := make([]ArtifactSetSummary, 0, params.Limit+1)
	for rows.Next() {
		var item ArtifactSetSummary
		if err := rows.Scan(&item.ID, &item.ExternalID, &item.Slug, &item.Name, &item.MinRarity, &item.MaxRarity,
			&item.TwoPieceBonus, &item.FourPieceBonus, &item.IconURL, &item.Locale, &item.LocaleFallback,
			&item.PieceCount); err != nil {
			return Page[ArtifactSetSummary]{}, fmt.Errorf("scan genshin artifact set: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[ArtifactSetSummary]{}, fmt.Errorf("iterate genshin artifact sets: %w", err)
	}
	return makePage(items, params.Limit, func(item ArtifactSetSummary) string { return item.Slug }), nil
}

func makePage[T any](items []T, limit int, cursor func(T) string) Page[T] {
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	page := Page[T]{Data: items, Pagination: Pagination{HasMore: hasMore, Limit: limit}}
	if hasMore && len(items) > 0 {
		page.Pagination.NextCursor = encodeCursor(cursor(items[len(items)-1]))
	}
	return page
}

func encodeCursor(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodeCursor(cursor string) (string, error) {
	if cursor == "" {
		return "", nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil || len(decoded) > 160 || !cursorValue.Match(decoded) {
		return "", ErrInvalidCursor
	}
	return strings.ToLower(string(decoded)), nil
}
