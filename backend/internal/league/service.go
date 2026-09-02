package league

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidCursor = errors.New("invalid cursor")
	ErrNotFound      = errors.New("League of Legends resource not found")
)

type Service struct{ postgres *pgxpool.Pool }

type Status struct {
	Ready             bool             `json:"ready"`
	ReleaseID         string           `json:"releaseId,omitempty"`
	DataDragonVersion string           `json:"ddragonVersion,omitempty"`
	PublishedAt       *time.Time       `json:"publishedAt,omitempty"`
	Champions         int64            `json:"champions"`
	Abilities         int64            `json:"abilities"`
	Skins             int64            `json:"skins"`
	ContentEntries    int64            `json:"contentEntries"`
	ContentByCategory map[string]int64 `json:"contentByCategory"`
	MediaAssets       int64            `json:"mediaAssets"`
	Locales           []string         `json:"locales"`
}

type ListParams struct {
	Locale string
	Query  string
	Cursor string
	Tag    string
	Limit  int
}

type Assets struct {
	Icon    *string `json:"icon"`
	Splash  *string `json:"splash"`
	Loading *string `json:"loading"`
	Tile    *string `json:"tile"`
}

type ChampionSummary struct {
	ID             int      `json:"id"`
	Slug           string   `json:"slug"`
	InternalName   string   `json:"internalName"`
	Name           string   `json:"name"`
	Title          string   `json:"title"`
	ResourceType   string   `json:"resourceType"`
	Tags           []string `json:"tags"`
	Assets         Assets   `json:"assets"`
	Locale         string   `json:"locale"`
	LocaleFallback bool     `json:"localeFallback"`
}

type Ability struct {
	Key          string          `json:"key"`
	Kind         string          `json:"kind"`
	Slot         string          `json:"slot"`
	DisplayOrder int             `json:"displayOrder"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Tooltip      string          `json:"tooltip"`
	IconURL      *string         `json:"iconUrl"`
	Cooldowns    json.RawMessage `json:"cooldowns"`
	Costs        json.RawMessage `json:"costs"`
	Ranges       json.RawMessage `json:"ranges"`
	Variables    json.RawMessage `json:"variables"`
	Effects      json.RawMessage `json:"effects"`
}

type Skin struct {
	ID         int64  `json:"id"`
	Number     int    `json:"number"`
	Name       string `json:"name"`
	HasChromas bool   `json:"hasChromas"`
	Assets     Assets `json:"assets"`
}

type ChampionDetail struct {
	ChampionSummary
	Blurb         string          `json:"blurb"`
	Lore          string          `json:"lore"`
	AllyTips      []string        `json:"allyTips"`
	EnemyTips     []string        `json:"enemyTips"`
	Info          json.RawMessage `json:"info"`
	Stats         json.RawMessage `json:"stats"`
	Abilities     []Ability       `json:"abilities"`
	Skins         []Skin          `json:"skins"`
	SourcePayload json.RawMessage `json:"sourcePayload"`
}

type ContentEntry struct {
	ID               int64           `json:"id"`
	Category         string          `json:"category"`
	ExternalKey      string          `json:"externalKey"`
	Slug             string          `json:"slug"`
	Name             string          `json:"name"`
	Description      string          `json:"description"`
	Tags             []string        `json:"tags"`
	IconURL          *string         `json:"iconUrl"`
	SourcePayload    json.RawMessage `json:"sourcePayload"`
	LocalizedPayload json.RawMessage `json:"localizedPayload"`
	Locale           string          `json:"locale"`
	LocaleFallback   bool            `json:"localeFallback"`
}

type Pagination struct {
	NextCursor string `json:"nextCursor,omitempty"`
	HasMore    bool   `json:"hasMore"`
	Limit      int    `json:"limit"`
}

type Page[T any] struct {
	Data       []T        `json:"data"`
	Pagination Pagination `json:"pagination"`
}

func NewService(postgres *pgxpool.Pool) *Service { return &Service{postgres: postgres} }

func (s *Service) Status(ctx context.Context) (Status, error) {
	status := Status{Locales: []string{"en_US", "ru_RU"}, ContentByCategory: make(map[string]int64)}
	err := s.postgres.QueryRow(ctx, `
		SELECT release.id::text, release.ddragon_version, release.published_at,
		 (SELECT count(*) FROM lol_champions WHERE release_id=release.id),
		 (SELECT count(*) FROM lol_champion_abilities a JOIN lol_champions c ON c.id=a.champion_id WHERE c.release_id=release.id),
		 (SELECT count(*) FROM lol_champion_skins s JOIN lol_champions c ON c.id=s.champion_id WHERE c.release_id=release.id),
		 (SELECT count(*) FROM lol_static_entries WHERE release_id=release.id),
		 (SELECT count(*) FROM lol_media_assets)
		FROM lol_current_release release`).Scan(&status.ReleaseID, &status.DataDragonVersion, &status.PublishedAt,
		&status.Champions, &status.Abilities, &status.Skins, &status.ContentEntries, &status.MediaAssets)
	if errors.Is(err, pgx.ErrNoRows) {
		return status, nil
	}
	if err != nil {
		return Status{}, fmt.Errorf("read League catalog status: %w", err)
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT category, count(*) FROM lol_static_entries entry
		JOIN lol_current_release release ON release.id=entry.release_id GROUP BY category ORDER BY category`)
	if err != nil {
		return Status{}, fmt.Errorf("read League category counts: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var category string
		var count int64
		if err := rows.Scan(&category, &count); err != nil {
			return Status{}, err
		}
		status.ContentByCategory[category] = count
	}
	if err := rows.Err(); err != nil {
		return Status{}, err
	}
	status.Ready = true
	return status, nil
}

func (s *Service) ListChampions(ctx context.Context, params ListParams) (Page[ChampionSummary], error) {
	after, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page[ChampionSummary]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT c.riot_key, c.slug, c.internal_name,
		 COALESCE(NULLIF(l.name,''), e.name, c.slug), COALESCE(NULLIF(l.title,''), e.title, ''),
		 c.resource_type, c.tags,
		 CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||icon.storage_key END,
		 CASE WHEN splash.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||splash.storage_key END,
		 CASE WHEN loading.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||loading.storage_key END,
		 CASE WHEN tile.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||tile.storage_key END,
		 $1, l.champion_id IS NULL
		FROM lol_champions c JOIN lol_current_release release ON release.id=c.release_id
		LEFT JOIN lol_champion_localizations l ON l.champion_id=c.id AND l.locale=$1
		LEFT JOIN lol_champion_localizations e ON e.champion_id=c.id AND e.locale='en_US'
		LEFT JOIN lol_media_assets icon ON icon.id=c.icon_asset_id
		LEFT JOIN lol_media_assets splash ON splash.id=c.splash_asset_id
		LEFT JOIN lol_media_assets loading ON loading.id=c.loading_asset_id
		LEFT JOIN lol_media_assets tile ON tile.id=c.tile_asset_id
		WHERE ($2='' OR lower(COALESCE(NULLIF(l.name,''),e.name,c.slug)) LIKE '%'||lower($2)||'%' OR lower(c.slug) LIKE '%'||lower($2)||'%')
		 AND ($3='' OR $3=ANY(c.tags)) AND ($4='' OR c.slug>$4)
		ORDER BY c.slug LIMIT $5`, params.Locale, params.Query, params.Tag, after, params.Limit+1)
	if err != nil {
		return Page[ChampionSummary]{}, fmt.Errorf("list League champions: %w", err)
	}
	defer rows.Close()
	items := make([]ChampionSummary, 0, params.Limit+1)
	for rows.Next() {
		var item ChampionSummary
		if err := rows.Scan(&item.ID, &item.Slug, &item.InternalName, &item.Name, &item.Title, &item.ResourceType, &item.Tags,
			&item.Assets.Icon, &item.Assets.Splash, &item.Assets.Loading, &item.Assets.Tile, &item.Locale, &item.LocaleFallback); err != nil {
			return Page[ChampionSummary]{}, fmt.Errorf("scan League champion: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[ChampionSummary]{}, err
	}
	return makePage(items, params.Limit, func(value ChampionSummary) string { return value.Slug }), nil
}

func (s *Service) Champion(ctx context.Context, slug, locale string) (ChampionDetail, error) {
	var detail ChampionDetail
	var championID int64
	err := s.postgres.QueryRow(ctx, `
		SELECT c.id, c.riot_key, c.slug, c.internal_name,
		 COALESCE(NULLIF(l.name,''),e.name,c.slug), COALESCE(NULLIF(l.title,''),e.title,''), c.resource_type, c.tags,
		 CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||icon.storage_key END,
		 CASE WHEN splash.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||splash.storage_key END,
		 CASE WHEN loading.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||loading.storage_key END,
		 CASE WHEN tile.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||tile.storage_key END,
		 $2, l.champion_id IS NULL,
		 COALESCE(NULLIF(l.blurb,''),e.blurb,''), COALESCE(NULLIF(l.lore,''),e.lore,''),
		 COALESCE(l.ally_tips,e.ally_tips,'{}'), COALESCE(l.enemy_tips,e.enemy_tips,'{}'), c.info, c.stats, c.source_payload
		FROM lol_champions c JOIN lol_current_release release ON release.id=c.release_id
		LEFT JOIN lol_champion_localizations l ON l.champion_id=c.id AND l.locale=$2
		LEFT JOIN lol_champion_localizations e ON e.champion_id=c.id AND e.locale='en_US'
		LEFT JOIN lol_media_assets icon ON icon.id=c.icon_asset_id LEFT JOIN lol_media_assets splash ON splash.id=c.splash_asset_id
		LEFT JOIN lol_media_assets loading ON loading.id=c.loading_asset_id LEFT JOIN lol_media_assets tile ON tile.id=c.tile_asset_id
		WHERE c.slug=$1`, slug, locale).Scan(&championID, &detail.ID, &detail.Slug, &detail.InternalName, &detail.Name, &detail.Title,
		&detail.ResourceType, &detail.Tags, &detail.Assets.Icon, &detail.Assets.Splash, &detail.Assets.Loading, &detail.Assets.Tile,
		&detail.Locale, &detail.LocaleFallback, &detail.Blurb, &detail.Lore, &detail.AllyTips, &detail.EnemyTips, &detail.Info, &detail.Stats, &detail.SourcePayload)
	if errors.Is(err, pgx.ErrNoRows) {
		return ChampionDetail{}, ErrNotFound
	}
	if err != nil {
		return ChampionDetail{}, fmt.Errorf("read League champion: %w", err)
	}
	detail.Abilities, err = s.abilities(ctx, championID, locale)
	if err != nil {
		return ChampionDetail{}, err
	}
	detail.Skins, err = s.skins(ctx, championID, locale)
	if err != nil {
		return ChampionDetail{}, err
	}
	return detail, nil
}

func (s *Service) abilities(ctx context.Context, championID int64, locale string) ([]Ability, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT a.ability_key,a.kind,a.slot,a.display_order,COALESCE(NULLIF(l.name,''),e.name,''),
		 COALESCE(NULLIF(l.description,''),e.description,''),COALESCE(NULLIF(l.tooltip,''),e.tooltip,''),
		 CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||icon.storage_key END,
		 a.cooldowns,a.costs,a.ranges,a.variables,a.effects
		FROM lol_champion_abilities a
		LEFT JOIN lol_champion_ability_localizations l ON l.ability_id=a.id AND l.locale=$2
		LEFT JOIN lol_champion_ability_localizations e ON e.ability_id=a.id AND e.locale='en_US'
		LEFT JOIN lol_media_assets icon ON icon.id=a.icon_asset_id WHERE a.champion_id=$1 ORDER BY a.display_order,a.id`, championID, locale)
	if err != nil {
		return nil, fmt.Errorf("read League abilities: %w", err)
	}
	defer rows.Close()
	result := make([]Ability, 0, 6)
	for rows.Next() {
		var value Ability
		if err := rows.Scan(&value.Key, &value.Kind, &value.Slot, &value.DisplayOrder, &value.Name, &value.Description, &value.Tooltip, &value.IconURL, &value.Cooldowns, &value.Costs, &value.Ranges, &value.Variables, &value.Effects); err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	return result, rows.Err()
}

func (s *Service) skins(ctx context.Context, championID int64, locale string) ([]Skin, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT s.riot_skin_id,s.skin_number,COALESCE(NULLIF(l.name,''),e.name,''),s.has_chromas,
		 NULL,CASE WHEN splash.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||splash.storage_key END,
		 CASE WHEN loading.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||loading.storage_key END,
		 CASE WHEN tile.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||tile.storage_key END
		FROM lol_champion_skins s LEFT JOIN lol_champion_skin_localizations l ON l.skin_id=s.id AND l.locale=$2
		LEFT JOIN lol_champion_skin_localizations e ON e.skin_id=s.id AND e.locale='en_US'
		LEFT JOIN lol_media_assets splash ON splash.id=s.splash_asset_id LEFT JOIN lol_media_assets loading ON loading.id=s.loading_asset_id
		LEFT JOIN lol_media_assets tile ON tile.id=s.tile_asset_id WHERE s.champion_id=$1 ORDER BY s.skin_number`, championID, locale)
	if err != nil {
		return nil, fmt.Errorf("read League skins: %w", err)
	}
	defer rows.Close()
	result := make([]Skin, 0)
	for rows.Next() {
		var value Skin
		if err := rows.Scan(&value.ID, &value.Number, &value.Name, &value.HasChromas, &value.Assets.Icon, &value.Assets.Splash, &value.Assets.Loading, &value.Assets.Tile); err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	return result, rows.Err()
}

func (s *Service) ListContent(ctx context.Context, category string, params ListParams) (Page[ContentEntry], error) {
	after, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page[ContentEntry]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT entry.id,entry.category,entry.external_key,entry.slug,COALESCE(NULLIF(l.name,''),e.name,''),
		 COALESCE(NULLIF(l.description,''),e.description,''),entry.tags,
		 CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/league-of-legends/media/'||icon.storage_key END,
		 entry.source_payload,COALESCE(l.source_payload,e.source_payload,'{}'),$2,l.entry_id IS NULL
		FROM lol_static_entries entry JOIN lol_current_release release ON release.id=entry.release_id
		LEFT JOIN lol_static_entry_localizations l ON l.entry_id=entry.id AND l.locale=$2
		LEFT JOIN lol_static_entry_localizations e ON e.entry_id=entry.id AND e.locale='en_US'
		LEFT JOIN lol_media_assets icon ON icon.id=entry.icon_asset_id
		WHERE entry.category=$1 AND ($3='' OR lower(COALESCE(NULLIF(l.name,''),e.name,'')) LIKE '%'||lower($3)||'%')
		 AND ($4='' OR entry.external_key>$4) ORDER BY entry.external_key LIMIT $5`, category, params.Locale, params.Query, after, params.Limit+1)
	if err != nil {
		return Page[ContentEntry]{}, fmt.Errorf("list League content: %w", err)
	}
	defer rows.Close()
	items := make([]ContentEntry, 0, params.Limit+1)
	for rows.Next() {
		var value ContentEntry
		if err := rows.Scan(&value.ID, &value.Category, &value.ExternalKey, &value.Slug, &value.Name, &value.Description, &value.Tags, &value.IconURL, &value.SourcePayload, &value.LocalizedPayload, &value.Locale, &value.LocaleFallback); err != nil {
			return Page[ContentEntry]{}, err
		}
		items = append(items, value)
	}
	if err := rows.Err(); err != nil {
		return Page[ContentEntry]{}, err
	}
	return makePage(items, params.Limit, func(value ContentEntry) string { return value.ExternalKey }), nil
}

func makePage[T any](items []T, limit int, key func(T) string) Page[T] {
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	page := Page[T]{Data: items, Pagination: Pagination{HasMore: hasMore, Limit: limit}}
	if hasMore && len(items) > 0 {
		page.Pagination.NextCursor = base64.RawURLEncoding.EncodeToString([]byte(key(items[len(items)-1])))
	}
	return page
}

func decodeCursor(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(decoded) == 0 || len(decoded) > 200 {
		return "", ErrInvalidCursor
	}
	result := string(decoded)
	if strings.ContainsAny(result, "\x00\r\n") {
		return "", ErrInvalidCursor
	}
	return result, nil
}
