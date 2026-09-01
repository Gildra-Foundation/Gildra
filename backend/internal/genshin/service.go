package genshin

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidCursor       = errors.New("invalid cursor")
	ErrCharacterNotFound   = errors.New("genshin character not found")
	ErrWeaponNotFound      = errors.New("genshin weapon not found")
	ErrArtifactSetNotFound = errors.New("genshin artifact set not found")
	cursorValue            = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	genshinColorTag        = regexp.MustCompile(`</?color(?:=[^>]*)?>`)
	genshinBreakTag        = regexp.MustCompile(`<br\s*/?>`)
)

type Service struct {
	postgres *pgxpool.Pool
}

type Status struct {
	Ready             bool             `json:"ready"`
	ReleaseID         string           `json:"releaseId,omitempty"`
	SourceRevision    string           `json:"sourceRevision,omitempty"`
	GameVersion       string           `json:"gameVersion,omitempty"`
	PublishedAt       *time.Time       `json:"publishedAt,omitempty"`
	Characters        int64            `json:"characters"`
	Weapons           int64            `json:"weapons"`
	ArtifactSets      int64            `json:"artifactSets"`
	Talents           int64            `json:"talents"`
	ContentEntries    int64            `json:"contentEntries"`
	ContentByCategory map[string]int64 `json:"contentByCategory"`
	MediaAssets       int64            `json:"mediaAssets"`
	Locales           []string         `json:"locales"`
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

// CharacterDetail keeps the compact list projection while adding the
// localized profile copy and the child records that make a character useful
// as a single browsable unit in clients.
type CharacterDetail struct {
	CharacterSummary
	Description    string                 `json:"description"`
	Stats          *CharacterStats        `json:"stats,omitempty"`
	AscensionCosts []UpgradeCostStage     `json:"ascensionCosts"`
	Talents        []TalentSummary        `json:"talents"`
	Constellations []ConstellationSummary `json:"constellations"`
}

type CharacterStats struct {
	Base        CharacterStatValues  `json:"base"`
	Curve       map[string]string    `json:"curve"`
	Promotion   []CharacterPromotion `json:"promotion"`
	Specialized string               `json:"specialized"`
}

type CharacterStatValues struct {
	HP         float64 `json:"hp"`
	Attack     float64 `json:"attack"`
	Defense    float64 `json:"defense"`
	CritRate   float64 `json:"critRate"`
	CritDamage float64 `json:"critDamage"`
}

type CharacterPromotion struct {
	HP          float64 `json:"hp"`
	Attack      float64 `json:"attack"`
	Defense     float64 `json:"defense"`
	MaxLevel    int16   `json:"maxLevel"`
	Specialized float64 `json:"specialized"`
}

type UpgradeCostStage struct {
	Key      string            `json:"key"`
	Stage    int16             `json:"stage"`
	MaxLevel int16             `json:"maxLevel,omitempty"`
	Items    []UpgradeCostItem `json:"items"`
}

type UpgradeCostItem struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	Count          int64   `json:"count"`
	IconURL        *string `json:"iconUrl,omitempty"`
	Locale         string  `json:"locale,omitempty"`
	LocaleFallback bool    `json:"localeFallback,omitempty"`
}

type ConstellationSummary struct {
	ID             int64   `json:"id"`
	CharacterSlug  string  `json:"characterSlug"`
	ExternalKey    string  `json:"externalKey"`
	Position       int16   `json:"position"`
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	IconURL        *string `json:"iconUrl"`
	Locale         string  `json:"locale"`
	LocaleFallback bool    `json:"localeFallback"`
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
	Description        string   `json:"description"`
	PassiveName        string   `json:"passiveName"`
	PassiveDescription string   `json:"passiveDescription"`
	Locale             string   `json:"locale"`
	LocaleFallback     bool     `json:"localeFallback"`
}

type WeaponDetail struct {
	WeaponSummary
	Description        string             `json:"description"`
	PassiveName        string             `json:"passiveName"`
	PassiveDescription string             `json:"passiveDescription"`
	Stats              *WeaponStats       `json:"stats,omitempty"`
	Refinements        []WeaponRefinement `json:"refinements"`
	AscensionCosts     []UpgradeCostStage `json:"ascensionCosts"`
}

// WeaponStats is the source-backed level and ascension projection for a
// weapon. The source stores the initial attack/special stat and the additive
// attack values unlocked at each ascension cap; keeping both makes the API
// useful for a profile without exposing the provider's raw JSON shape.
type WeaponStats struct {
	Base        WeaponStatValues  `json:"base"`
	Curve       map[string]string `json:"curve"`
	Promotion   []WeaponPromotion `json:"promotion"`
	Specialized string            `json:"specialized"`
}

type WeaponStatValues struct {
	Attack      float64 `json:"attack"`
	Specialized float64 `json:"specialized"`
}

type WeaponPromotion struct {
	Attack   float64 `json:"attack"`
	MaxLevel int16   `json:"maxLevel"`
}

type WeaponRefinement struct {
	Level       int16    `json:"level"`
	Values      []string `json:"values"`
	Description string   `json:"description"`
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

type ArtifactSetDetail struct {
	ArtifactSetSummary
	Pieces  []ArtifactPieceSummary  `json:"pieces"`
	Sources []ArtifactSourceSummary `json:"sources"`
}

type ArtifactPieceSummary struct {
	ID             int64   `json:"id"`
	Slot           string  `json:"slot"`
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	IconURL        *string `json:"iconUrl"`
	Locale         string  `json:"locale"`
	LocaleFallback bool    `json:"localeFallback"`
}

type ArtifactSourceSummary struct {
	Slug             string `json:"slug"`
	Name             string `json:"name"`
	Region           string `json:"region"`
	EntranceName     string `json:"entranceName"`
	UnlockRank       int16  `json:"unlockRank"`
	RecommendedLevel int16  `json:"recommendedLevel"`
}

type TalentSummary struct {
	ID             int64   `json:"id"`
	CharacterSlug  string  `json:"characterSlug"`
	CharacterName  string  `json:"characterName"`
	ExternalKey    string  `json:"externalKey"`
	Kind           string  `json:"kind"`
	DisplayOrder   int16   `json:"displayOrder"`
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	IconURL        *string `json:"iconUrl"`
	Locale         string  `json:"locale"`
	LocaleFallback bool    `json:"localeFallback"`
}

type ContentMediaSummary struct {
	Role     string `json:"role"`
	Filename string `json:"filename"`
	URL      string `json:"url"`
}

type ContentSummary struct {
	ID               int64                 `json:"id"`
	ExternalID       *int64                `json:"externalId,omitempty"`
	Category         string                `json:"category"`
	Slug             string                `json:"slug"`
	Name             string                `json:"name"`
	Description      string                `json:"description"`
	IconURL          *string               `json:"iconUrl"`
	Media            []ContentMediaSummary `json:"media"`
	SourcePayload    json.RawMessage       `json:"sourcePayload"`
	LocalizedPayload json.RawMessage       `json:"localizedPayload"`
	Locale           string                `json:"locale"`
	LocaleFallback   bool                  `json:"localeFallback"`
}

type Page[T any] struct {
	Data       []T        `json:"data"`
	Pagination Pagination `json:"pagination"`
}

func NewService(postgres *pgxpool.Pool) *Service {
	return &Service{postgres: postgres}
}

func (s *Service) Status(ctx context.Context) (Status, error) {
	status := Status{Locales: []string{"en_US", "ru_RU"}, ContentByCategory: make(map[string]int64)}
	err := s.postgres.QueryRow(ctx, `
		SELECT release.id::text, release.source_revision, release.game_version, release.published_at,
		       (SELECT count(*) FROM genshin_characters WHERE release_id = release.id),
		       (SELECT count(*) FROM genshin_weapons WHERE release_id = release.id),
		       (SELECT count(*) FROM genshin_artifact_sets WHERE release_id = release.id),
		       (SELECT count(*) FROM genshin_character_talents talent
		          JOIN genshin_characters character ON character.id = talent.character_id
		         WHERE character.release_id = release.id),
		       (SELECT count(*) FROM genshin_content_entries entry WHERE entry.release_id = release.id),
		       (SELECT count(*) FROM genshin_media_assets)
		FROM genshin_current_release release`).Scan(
		&status.ReleaseID, &status.SourceRevision, &status.GameVersion, &status.PublishedAt,
		&status.Characters, &status.Weapons, &status.ArtifactSets, &status.Talents, &status.ContentEntries, &status.MediaAssets,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return status, nil
	}
	if err != nil {
		return Status{}, fmt.Errorf("read genshin catalog status: %w", err)
	}
	categoryRows, err := s.postgres.Query(ctx, `
		SELECT entry.category, count(*)
		FROM genshin_content_entries entry
		JOIN genshin_current_release release ON release.id = entry.release_id
		GROUP BY entry.category
		ORDER BY entry.category`)
	if err != nil {
		return Status{}, fmt.Errorf("read genshin content category status: %w", err)
	}
	defer categoryRows.Close()
	for categoryRows.Next() {
		var category string
		var count int64
		if err := categoryRows.Scan(&category, &count); err != nil {
			return Status{}, fmt.Errorf("scan genshin content category status: %w", err)
		}
		status.ContentByCategory[category] = count
	}
	if err := categoryRows.Err(); err != nil {
		return Status{}, fmt.Errorf("iterate genshin content category status: %w", err)
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

func (s *Service) GetCharacter(ctx context.Context, slug, locale string) (CharacterDetail, error) {
	var item CharacterDetail
	var iconStorageKey, portraitStorageKey *string
	var sourcePayload []byte
	err := s.postgres.QueryRow(ctx, `
		SELECT character.id, character.external_id, character.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), character.slug),
		       COALESCE(NULLIF(localized.title, ''), NULLIF(english.title, ''), ''),
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       character.rarity, character.element, character.weapon_type, character.region,
		       icon.storage_key, portrait.storage_key,
		       character.source_payload, $1, localized.character_id IS NULL,
		       (SELECT count(*) FROM genshin_character_talents talent WHERE talent.character_id = character.id)
		FROM genshin_characters character
		JOIN genshin_current_release release ON release.id = character.release_id
		LEFT JOIN genshin_character_localizations localized
		       ON localized.character_id = character.id AND localized.locale = $1
		LEFT JOIN genshin_character_localizations english
		       ON english.character_id = character.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = character.icon_asset_id
		LEFT JOIN genshin_media_assets portrait ON portrait.id = character.portrait_asset_id
		WHERE character.slug = $2`, locale, slug).Scan(
		&item.ID, &item.ExternalID, &item.Slug, &item.Name, &item.Title, &item.Description,
		&item.Rarity, &item.Element, &item.WeaponType, &item.Region, &iconStorageKey,
		&portraitStorageKey, &sourcePayload, &item.Locale, &item.LocaleFallback, &item.TalentCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return CharacterDetail{}, ErrCharacterNotFound
	}
	if err != nil {
		return CharacterDetail{}, fmt.Errorf("read genshin character %s: %w", slug, err)
	}
	item.IconURL = storageURL(iconStorageKey)
	item.PortraitURL = storageURL(portraitStorageKey)
	item.Description = cleanGenshinMarkup(item.Description)
	stats, err := s.characterStats(ctx, slug)
	if err != nil {
		return CharacterDetail{}, err
	}
	item.Stats = stats
	item.AscensionCosts, err = s.upgradeCosts(ctx, sourcePayload, locale, promotionMaxLevels(stats))
	if err != nil {
		return CharacterDetail{}, err
	}

	talents, err := s.characterTalents(ctx, item.ID, slug, locale)
	if err != nil {
		return CharacterDetail{}, err
	}
	item.Talents = talents
	constellations, err := s.characterConstellations(ctx, item.ID, slug, locale)
	if err != nil {
		return CharacterDetail{}, err
	}
	item.Constellations = constellations
	return item, nil
}

type characterStatsSource struct {
	Base struct {
		HP         float64 `json:"hp"`
		Attack     float64 `json:"attack"`
		Defense    float64 `json:"defense"`
		CritRate   float64 `json:"critrate"`
		CritDamage float64 `json:"critdmg"`
	} `json:"base"`
	Curve     map[string]string `json:"curve"`
	Promotion []struct {
		HP          float64 `json:"hp"`
		Attack      float64 `json:"attack"`
		Defense     float64 `json:"defense"`
		MaxLevel    int16   `json:"maxlevel"`
		Specialized float64 `json:"specialized"`
	} `json:"promotion"`
	Specialized string `json:"specialized"`
}

func (s *Service) characterStats(ctx context.Context, slug string) (*CharacterStats, error) {
	var raw []byte
	err := s.postgres.QueryRow(ctx, `
		SELECT entry.source_payload -> $1
		FROM genshin_content_entries entry
		JOIN genshin_current_release release ON release.id = entry.release_id
		WHERE entry.category = 'stats' AND entry.slug = 'characters'`, slug).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) || len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read genshin character stats %s: %w", slug, err)
	}
	var source characterStatsSource
	if err := json.Unmarshal(raw, &source); err != nil {
		return nil, fmt.Errorf("decode genshin character stats %s: %w", slug, err)
	}
	stats := &CharacterStats{
		Base: CharacterStatValues{
			HP: source.Base.HP, Attack: source.Base.Attack, Defense: source.Base.Defense,
			CritRate: source.Base.CritRate, CritDamage: source.Base.CritDamage,
		},
		Curve: source.Curve, Specialized: source.Specialized,
		Promotion: make([]CharacterPromotion, 0, len(source.Promotion)),
	}
	for _, promotion := range source.Promotion {
		stats.Promotion = append(stats.Promotion, CharacterPromotion{
			HP: promotion.HP, Attack: promotion.Attack, Defense: promotion.Defense,
			MaxLevel: promotion.MaxLevel, Specialized: promotion.Specialized,
		})
	}
	return stats, nil
}

type upgradeCostSource struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

func (s *Service) upgradeCosts(ctx context.Context, sourcePayload []byte, locale string, maxLevels []int16) ([]UpgradeCostStage, error) {
	if len(sourcePayload) == 0 {
		return []UpgradeCostStage{}, nil
	}
	var costs map[string][]upgradeCostSource
	var source struct {
		Costs map[string][]upgradeCostSource `json:"costs"`
	}
	if err := json.Unmarshal(sourcePayload, &source); err != nil {
		return nil, fmt.Errorf("decode genshin upgrade costs: %w", err)
	}
	costs = source.Costs
	if len(costs) == 0 {
		return []UpgradeCostStage{}, nil
	}
	stages := make([]UpgradeCostStage, 0, len(costs))
	ids := make([]int64, 0)
	seenIDs := make(map[int64]struct{})
	for key, rawItems := range costs {
		stage := stageNumber(key)
		if stage == 0 {
			continue
		}
		items := make([]UpgradeCostItem, 0, len(rawItems))
		for _, raw := range rawItems {
			items = append(items, UpgradeCostItem{ID: raw.ID, Name: raw.Name, Count: raw.Count})
			if _, seen := seenIDs[raw.ID]; !seen {
				seenIDs[raw.ID] = struct{}{}
				ids = append(ids, raw.ID)
			}
		}
		maxLevel := int16(0)
		if stage <= len(maxLevels) {
			maxLevel = maxLevels[stage-1]
		}
		stages = append(stages, UpgradeCostStage{Key: key, Stage: int16(stage), MaxLevel: maxLevel, Items: items})
	}
	slices.SortFunc(stages, func(a, b UpgradeCostStage) int { return int(a.Stage - b.Stage) })
	if len(ids) == 0 {
		return stages, nil
	}
	localized, err := s.lookupMaterialNames(ctx, locale, ids)
	if err != nil {
		return nil, err
	}
	for stage := range stages {
		for item := range stages[stage].Items {
			if material, ok := localized[stages[stage].Items[item].ID]; ok {
				stages[stage].Items[item].Name = material.Name
				stages[stage].Items[item].IconURL = material.IconURL
				stages[stage].Items[item].Locale = material.Locale
				stages[stage].Items[item].LocaleFallback = material.LocaleFallback
			}
		}
	}
	return stages, nil
}

func stageNumber(key string) int {
	if len(key) < 7 || !strings.HasPrefix(key, "ascend") {
		return 0
	}
	value, err := strconv.Atoi(key[len("ascend"):])
	if err != nil || value < 1 || value > 6 {
		return 0
	}
	return value
}

func promotionMaxLevels(stats *CharacterStats) []int16 {
	if stats == nil {
		return nil
	}
	// The first promotion row describes the level-20 baseline. Ascend1
	// unlocks the following row (level 40), so costs are offset by one row.
	start := 0
	if len(stats.Promotion) > 1 && stats.Promotion[0].MaxLevel <= 20 {
		start = 1
	}
	levels := make([]int16, 0, len(stats.Promotion)-start)
	for _, promotion := range stats.Promotion[start:] {
		levels = append(levels, promotion.MaxLevel)
	}
	return levels
}

type localizedMaterial struct {
	Name           string
	IconURL        *string
	Locale         string
	LocaleFallback bool
}

func (s *Service) lookupMaterialNames(ctx context.Context, locale string, ids []int64) (map[int64]localizedMaterial, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT entry.external_id,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), entry.slug),
		       icon.storage_key, $1, localized.entry_id IS NULL
		FROM genshin_content_entries entry
		JOIN genshin_current_release release ON release.id = entry.release_id
		LEFT JOIN genshin_content_localizations localized
		       ON localized.entry_id = entry.id AND localized.locale = $1
		LEFT JOIN genshin_content_localizations english
		       ON english.entry_id = entry.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = entry.icon_asset_id
		WHERE entry.category IN ('materials', 'crafts')
		  AND entry.external_id = ANY($2)`, locale, ids)
	if err != nil {
		return nil, fmt.Errorf("lookup genshin upgrade materials: %w", err)
	}
	defer rows.Close()
	result := make(map[int64]localizedMaterial, len(ids))
	for rows.Next() {
		var id int64
		var material localizedMaterial
		var iconStorageKey *string
		if err := rows.Scan(&id, &material.Name, &iconStorageKey, &material.Locale, &material.LocaleFallback); err != nil {
			return nil, fmt.Errorf("scan genshin upgrade material: %w", err)
		}
		material.IconURL = storageURL(iconStorageKey)
		result[id] = material
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate genshin upgrade materials: %w", err)
	}
	return result, nil
}

func (s *Service) GetWeapon(ctx context.Context, slug, locale string) (WeaponDetail, error) {
	var item WeaponDetail
	var iconStorageKey *string
	var sourcePayload, refinementPayload []byte
	err := s.postgres.QueryRow(ctx, `
		SELECT weapon.id, weapon.external_id, weapon.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), weapon.slug),
		       weapon.rarity, weapon.weapon_type, weapon.base_attack::float8, weapon.secondary_stat,
		       weapon.secondary_stat_value::float8, icon.storage_key,
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       COALESCE(NULLIF(localized.passive_name, ''), NULLIF(english.passive_name, ''), ''),
		       COALESCE(NULLIF(localized.passive_description, ''), NULLIF(english.passive_description, ''), ''),
		       COALESCE(localized.refinement_descriptions, english.refinement_descriptions, '[]'::jsonb),
		       weapon.source_payload, $1, localized.weapon_id IS NULL
		FROM genshin_weapons weapon
		JOIN genshin_current_release release ON release.id = weapon.release_id
		LEFT JOIN genshin_weapon_localizations localized
		       ON localized.weapon_id = weapon.id AND localized.locale = $1
		LEFT JOIN genshin_weapon_localizations english
		       ON english.weapon_id = weapon.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = weapon.icon_asset_id
		WHERE weapon.slug = $2`, locale, slug).Scan(
		&item.ID, &item.ExternalID, &item.Slug, &item.Name, &item.Rarity, &item.WeaponType,
		&item.BaseAttack, &item.SecondaryStat, &item.SecondaryStatValue, &iconStorageKey,
		&item.Description, &item.PassiveName, &item.PassiveDescription, &refinementPayload,
		&sourcePayload, &item.Locale, &item.LocaleFallback,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return WeaponDetail{}, ErrWeaponNotFound
	}
	if err != nil {
		return WeaponDetail{}, fmt.Errorf("read genshin weapon %s: %w", slug, err)
	}
	item.IconURL = storageURL(iconStorageKey)
	item.Description = cleanGenshinMarkup(item.Description)
	item.PassiveName = cleanGenshinMarkup(item.PassiveName)
	item.PassiveDescription = cleanGenshinMarkup(item.PassiveDescription)
	stats, err := s.weaponStats(ctx, slug)
	if err != nil {
		return WeaponDetail{}, err
	}
	item.Stats = stats
	item.Refinements = weaponRefinements(sourcePayload, refinementPayload, item.PassiveDescription)
	item.AscensionCosts, err = s.upgradeCosts(ctx, sourcePayload, locale, weaponPromotionMaxLevels(stats))
	if err != nil {
		return WeaponDetail{}, err
	}
	return item, nil
}

type weaponStatsSource struct {
	Base struct {
		Attack      float64 `json:"attack"`
		Specialized float64 `json:"specialized"`
	} `json:"base"`
	Curve     map[string]string `json:"curve"`
	Promotion []struct {
		Attack   float64 `json:"attack"`
		MaxLevel int16   `json:"maxlevel"`
	} `json:"promotion"`
	Specialized string `json:"specialized"`
}

func (s *Service) weaponStats(ctx context.Context, slug string) (*WeaponStats, error) {
	var raw []byte
	err := s.postgres.QueryRow(ctx, `
		SELECT entry.source_payload -> $1
		FROM genshin_content_entries entry
		JOIN genshin_current_release release ON release.id = entry.release_id
		WHERE entry.category = 'stats' AND entry.slug = 'weapons'`, slug).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) || len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read genshin weapon stats %s: %w", slug, err)
	}
	var source weaponStatsSource
	if err := json.Unmarshal(raw, &source); err != nil {
		return nil, fmt.Errorf("decode genshin weapon stats %s: %w", slug, err)
	}
	stats := &WeaponStats{
		Base:  WeaponStatValues{Attack: source.Base.Attack, Specialized: source.Base.Specialized},
		Curve: source.Curve, Specialized: source.Specialized,
		Promotion: make([]WeaponPromotion, 0, len(source.Promotion)),
	}
	for _, promotion := range source.Promotion {
		stats.Promotion = append(stats.Promotion, WeaponPromotion{Attack: promotion.Attack, MaxLevel: promotion.MaxLevel})
	}
	return stats, nil
}

func weaponPromotionMaxLevels(stats *WeaponStats) []int16 {
	if stats == nil {
		return nil
	}
	start := 0
	if len(stats.Promotion) > 1 && stats.Promotion[0].MaxLevel <= 20 {
		start = 1
	}
	levels := make([]int16, 0, len(stats.Promotion)-start)
	for _, promotion := range stats.Promotion[start:] {
		levels = append(levels, promotion.MaxLevel)
	}
	return levels
}

type weaponRefinementSource struct {
	Values      []string `json:"values"`
	Description string   `json:"description"`
}

func weaponRefinements(sourcePayload, localizedPayload []byte, passiveDescription string) []WeaponRefinement {
	var source map[string]weaponRefinementSource
	_ = json.Unmarshal(sourcePayload, &source)
	var localized []string
	_ = json.Unmarshal(localizedPayload, &localized)
	result := make([]WeaponRefinement, 0, 5)
	for level := 1; level <= 5; level++ {
		key := "r" + strconv.Itoa(level)
		refinement, ok := source[key]
		if !ok && level > len(localized) {
			continue
		}
		description := refinement.Description
		if level <= len(localized) && localized[level-1] != "" {
			description = localized[level-1]
		}
		if strings.Contains(passiveDescription, "{") && len(refinement.Values) > 0 {
			description = passiveDescription
			for index, value := range refinement.Values {
				description = strings.ReplaceAll(description, "{"+strconv.Itoa(index)+"}", value)
			}
		}
		description = cleanGenshinMarkup(description)
		result = append(result, WeaponRefinement{Level: int16(level), Values: refinement.Values, Description: description})
	}
	return result
}

func cleanGenshinMarkup(value string) string {
	value = genshinBreakTag.ReplaceAllString(value, "\n")
	return genshinColorTag.ReplaceAllString(value, "")
}

func (s *Service) GetArtifactSet(ctx context.Context, slug, locale string) (ArtifactSetDetail, error) {
	var item ArtifactSetDetail
	var iconStorageKey *string
	var englishName string
	err := s.postgres.QueryRow(ctx, `
		SELECT artifact.id, artifact.external_id, artifact.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), artifact.slug),
		       artifact.min_rarity, artifact.max_rarity,
		       COALESCE(NULLIF(localized.two_piece_bonus, ''), NULLIF(english.two_piece_bonus, ''), ''),
		       COALESCE(NULLIF(localized.four_piece_bonus, ''), NULLIF(english.four_piece_bonus, ''), ''),
		       icon.storage_key, $1, localized.artifact_set_id IS NULL,
		       (SELECT count(*) FROM genshin_artifact_pieces piece WHERE piece.artifact_set_id = artifact.id),
		       COALESCE(english.name, artifact.slug)
		FROM genshin_artifact_sets artifact
		JOIN genshin_current_release release ON release.id = artifact.release_id
		LEFT JOIN genshin_artifact_set_localizations localized
		       ON localized.artifact_set_id = artifact.id AND localized.locale = $1
		LEFT JOIN genshin_artifact_set_localizations english
		       ON english.artifact_set_id = artifact.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = artifact.icon_asset_id
		WHERE artifact.slug = $2`, locale, slug).Scan(
		&item.ID, &item.ExternalID, &item.Slug, &item.Name, &item.MinRarity, &item.MaxRarity,
		&item.TwoPieceBonus, &item.FourPieceBonus, &iconStorageKey, &item.Locale, &item.LocaleFallback,
		&item.PieceCount, &englishName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ArtifactSetDetail{}, ErrArtifactSetNotFound
	}
	if err != nil {
		return ArtifactSetDetail{}, fmt.Errorf("read genshin artifact set %s: %w", slug, err)
	}
	item.IconURL = storageURL(iconStorageKey)
	item.Pieces, err = s.artifactPieces(ctx, item.ID, slug, locale)
	if err != nil {
		return ArtifactSetDetail{}, err
	}
	item.Sources, err = s.artifactSources(ctx, englishName, locale)
	if err != nil {
		return ArtifactSetDetail{}, err
	}
	return item, nil
}

func (s *Service) artifactPieces(ctx context.Context, artifactID int64, slug, locale string) ([]ArtifactPieceSummary, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT piece.id, piece.slot,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), piece.slot),
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       icon.storage_key, $1, localized.artifact_piece_id IS NULL
		FROM genshin_artifact_pieces piece
		LEFT JOIN genshin_artifact_piece_localizations localized
		       ON localized.artifact_piece_id = piece.id AND localized.locale = $1
		LEFT JOIN genshin_artifact_piece_localizations english
		       ON english.artifact_piece_id = piece.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = piece.icon_asset_id
		WHERE piece.artifact_set_id = $2
		ORDER BY CASE piece.slot WHEN 'flower' THEN 1 WHEN 'plume' THEN 2 WHEN 'sands' THEN 3 WHEN 'goblet' THEN 4 WHEN 'circlet' THEN 5 ELSE 6 END, piece.id`, locale, artifactID)
	if err != nil {
		return nil, fmt.Errorf("list genshin artifact pieces %s: %w", slug, err)
	}
	defer rows.Close()
	items := make([]ArtifactPieceSummary, 0, 5)
	for rows.Next() {
		var item ArtifactPieceSummary
		var iconStorageKey *string
		if err := rows.Scan(&item.ID, &item.Slot, &item.Name, &item.Description, &iconStorageKey, &item.Locale, &item.LocaleFallback); err != nil {
			return nil, fmt.Errorf("scan genshin artifact piece %s: %w", slug, err)
		}
		item.IconURL = storageURL(iconStorageKey)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate genshin artifact pieces %s: %w", slug, err)
	}
	return items, nil
}

func (s *Service) artifactSources(ctx context.Context, artifactName, locale string) ([]ArtifactSourceSummary, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT entry.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), entry.slug),
		       COALESCE(NULLIF(localized.source_payload->>'regionName', ''), NULLIF(english.source_payload->>'regionName', ''), ''),
		       COALESCE(NULLIF(localized.source_payload->>'entranceName', ''), NULLIF(english.source_payload->>'entranceName', ''), ''),
		       COALESCE(NULLIF(localized.source_payload->>'unlockRank', '')::smallint, NULLIF(english.source_payload->>'unlockRank', '')::smallint, 0),
		       COALESCE(NULLIF(localized.source_payload->>'recommendedLevel', '')::smallint, NULLIF(english.source_payload->>'recommendedLevel', '')::smallint, 0)
		FROM genshin_content_entries entry
		JOIN genshin_current_release release ON release.id = entry.release_id
		LEFT JOIN genshin_content_localizations localized
		       ON localized.entry_id = entry.id AND localized.locale = $1
		LEFT JOIN genshin_content_localizations english
		       ON english.entry_id = entry.id AND english.locale = 'en_US'
		WHERE entry.category = 'domains'
		  AND entry.source_payload->>'domainType' = 'UI_ABYSSUS_RELIC'
		  AND EXISTS (
		      SELECT 1
		      FROM jsonb_array_elements(COALESCE(entry.source_payload->'rewardPreview', '[]'::jsonb)) reward
		      WHERE lower(reward->>'name') = lower($2)
		  )
		ORDER BY COALESCE(NULLIF(localized.source_payload->>'entranceName', ''), NULLIF(english.source_payload->>'entranceName', ''), entry.slug),
		         COALESCE(NULLIF(localized.source_payload->>'unlockRank', '')::smallint, NULLIF(english.source_payload->>'unlockRank', '')::smallint, 0), entry.slug`, locale, artifactName)
	if err != nil {
		return nil, fmt.Errorf("list genshin artifact sources: %w", err)
	}
	defer rows.Close()
	items := make([]ArtifactSourceSummary, 0, 8)
	for rows.Next() {
		var item ArtifactSourceSummary
		if err := rows.Scan(&item.Slug, &item.Name, &item.Region, &item.EntranceName, &item.UnlockRank, &item.RecommendedLevel); err != nil {
			return nil, fmt.Errorf("scan genshin artifact source: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate genshin artifact sources: %w", err)
	}
	return items, nil
}

func (s *Service) characterTalents(ctx context.Context, characterID int64, slug, locale string) ([]TalentSummary, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT talent.id, character.slug,
		       COALESCE(NULLIF(character_localized.name, ''), NULLIF(character_english.name, ''), character.slug),
		       talent.external_key, talent.kind, talent.display_order,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), talent.external_key),
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       icon.storage_key, $1, localized.talent_id IS NULL
		FROM genshin_character_talents talent
		JOIN genshin_characters character ON character.id = talent.character_id
		LEFT JOIN genshin_character_localizations character_localized
		       ON character_localized.character_id = character.id AND character_localized.locale = $1
		LEFT JOIN genshin_character_localizations character_english
		       ON character_english.character_id = character.id AND character_english.locale = 'en_US'
		LEFT JOIN genshin_character_talent_localizations localized
		       ON localized.talent_id = talent.id AND localized.locale = $1
		LEFT JOIN genshin_character_talent_localizations english
		       ON english.talent_id = talent.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = talent.icon_asset_id
		WHERE talent.character_id = $2
		ORDER BY talent.display_order, talent.id`, locale, characterID)
	if err != nil {
		return nil, fmt.Errorf("list genshin character talents %s: %w", slug, err)
	}
	defer rows.Close()
	items := make([]TalentSummary, 0, 8)
	for rows.Next() {
		var item TalentSummary
		var iconStorageKey *string
		if err := rows.Scan(&item.ID, &item.CharacterSlug, &item.CharacterName, &item.ExternalKey,
			&item.Kind, &item.DisplayOrder, &item.Name, &item.Description, &iconStorageKey,
			&item.Locale, &item.LocaleFallback); err != nil {
			return nil, fmt.Errorf("scan genshin character talent %s: %w", slug, err)
		}
		item.IconURL = storageURL(iconStorageKey)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate genshin character talents %s: %w", slug, err)
	}
	return items, nil
}

func (s *Service) characterConstellations(ctx context.Context, characterID int64, slug, locale string) ([]ConstellationSummary, error) {
	rows, err := s.postgres.Query(ctx, `
		SELECT constellation.id, character.slug, constellation.external_key, constellation.position,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), constellation.external_key),
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       icon.storage_key, $1, localized.constellation_id IS NULL
		FROM genshin_character_constellations constellation
		JOIN genshin_characters character ON character.id = constellation.character_id
		LEFT JOIN genshin_character_constellation_localizations localized
		       ON localized.constellation_id = constellation.id AND localized.locale = $1
		LEFT JOIN genshin_character_constellation_localizations english
		       ON english.constellation_id = constellation.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = constellation.icon_asset_id
		WHERE constellation.character_id = $2
		ORDER BY constellation.position, constellation.id`, locale, characterID)
	if err != nil {
		return nil, fmt.Errorf("list genshin character constellations %s: %w", slug, err)
	}
	defer rows.Close()
	items := make([]ConstellationSummary, 0, 6)
	for rows.Next() {
		var item ConstellationSummary
		var iconStorageKey *string
		if err := rows.Scan(&item.ID, &item.CharacterSlug, &item.ExternalKey, &item.Position,
			&item.Name, &item.Description, &iconStorageKey, &item.Locale, &item.LocaleFallback); err != nil {
			return nil, fmt.Errorf("scan genshin character constellation %s: %w", slug, err)
		}
		item.IconURL = storageURL(iconStorageKey)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate genshin character constellations %s: %w", slug, err)
	}
	return items, nil
}

func storageURL(storageKey *string) *string {
	if storageKey == nil || *storageKey == "" {
		return nil
	}
	url := "/genshin-impact/media/" + *storageKey
	return &url
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
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       COALESCE(NULLIF(localized.passive_name, ''), NULLIF(english.passive_name, ''), ''),
		       COALESCE(NULLIF(localized.passive_description, ''), NULLIF(english.passive_description, ''), ''),
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
			&item.BaseAttack, &item.SecondaryStat, &item.SecondaryStatValue, &item.IconURL, &item.Description,
			&item.PassiveName, &item.PassiveDescription, &item.Locale,
			&item.LocaleFallback); err != nil {
			return Page[WeaponSummary]{}, fmt.Errorf("scan genshin weapon: %w", err)
		}
		item.Description = cleanGenshinMarkup(item.Description)
		item.PassiveName = cleanGenshinMarkup(item.PassiveName)
		item.PassiveDescription = cleanGenshinMarkup(item.PassiveDescription)
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
		item.TwoPieceBonus = cleanGenshinMarkup(item.TwoPieceBonus)
		item.FourPieceBonus = cleanGenshinMarkup(item.FourPieceBonus)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[ArtifactSetSummary]{}, fmt.Errorf("iterate genshin artifact sets: %w", err)
	}
	return makePage(items, params.Limit, func(item ArtifactSetSummary) string { return item.Slug }), nil
}

func (s *Service) ListTalents(ctx context.Context, params ListParams) (Page[TalentSummary], error) {
	afterID, err := decodeTalentCursor(params.Cursor)
	if err != nil {
		return Page[TalentSummary]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT talent.id, character.slug,
		       COALESCE(NULLIF(character_localized.name, ''), NULLIF(character_english.name, ''), character.slug),
		       talent.external_key, talent.kind, talent.display_order,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), talent.external_key),
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       CASE WHEN icon.storage_key IS NULL THEN NULL ELSE '/genshin-impact/media/' || icon.storage_key END,
		       $1, localized.talent_id IS NULL
		FROM genshin_character_talents talent
		JOIN genshin_characters character ON character.id = talent.character_id
		JOIN genshin_current_release release ON release.id = character.release_id
		LEFT JOIN genshin_character_localizations character_localized
		       ON character_localized.character_id = character.id AND character_localized.locale = $1
		LEFT JOIN genshin_character_localizations character_english
		       ON character_english.character_id = character.id AND character_english.locale = 'en_US'
		LEFT JOIN genshin_character_talent_localizations localized
		       ON localized.talent_id = talent.id AND localized.locale = $1
		LEFT JOIN genshin_character_talent_localizations english
		       ON english.talent_id = talent.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = talent.icon_asset_id
		WHERE ($2 = '' OR lower(COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), talent.external_key)) LIKE '%' || lower($2) || '%'
		                  OR lower(COALESCE(NULLIF(character_localized.name, ''), NULLIF(character_english.name, ''), character.slug)) LIKE '%' || lower($2) || '%')
		  AND ($3 = 0 OR talent.id > $3)
		ORDER BY talent.id
		LIMIT $4`, params.Locale, params.Query, afterID, params.Limit+1)
	if err != nil {
		return Page[TalentSummary]{}, fmt.Errorf("list genshin talents: %w", err)
	}
	defer rows.Close()
	items := make([]TalentSummary, 0, params.Limit+1)
	for rows.Next() {
		var item TalentSummary
		if err := rows.Scan(&item.ID, &item.CharacterSlug, &item.CharacterName, &item.ExternalKey,
			&item.Kind, &item.DisplayOrder, &item.Name, &item.Description, &item.IconURL,
			&item.Locale, &item.LocaleFallback); err != nil {
			return Page[TalentSummary]{}, fmt.Errorf("scan genshin talent: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[TalentSummary]{}, fmt.Errorf("iterate genshin talents: %w", err)
	}
	return makePage(items, params.Limit, func(item TalentSummary) string { return strconv.FormatInt(item.ID, 10) }), nil
}

func (s *Service) ListContent(ctx context.Context, category string, params ListParams) (Page[ContentSummary], error) {
	after, err := decodeCursor(params.Cursor)
	if err != nil {
		return Page[ContentSummary]{}, err
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT entry.id, entry.external_id, entry.category, entry.slug,
		       COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), entry.slug),
		       COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), ''),
		       icon.storage_key,
		       entry.source_payload, localized.source_payload,
		       COALESCE(jsonb_agg(jsonb_build_object(
		           'role', content_media.media_role,
		           'filename', content_media.source_filename,
		           'url', '/genshin-impact/media/' || media.storage_key
		       ) ORDER BY content_media.media_role) FILTER (WHERE content_media.entry_id IS NOT NULL), '[]'::jsonb),
		       $1, localized.entry_id IS NULL
		FROM genshin_content_entries entry
		JOIN genshin_current_release release ON release.id = entry.release_id
		LEFT JOIN genshin_content_localizations localized
		       ON localized.entry_id = entry.id AND localized.locale = $1
		LEFT JOIN genshin_content_localizations english
		       ON english.entry_id = entry.id AND english.locale = 'en_US'
		LEFT JOIN genshin_media_assets icon ON icon.id = entry.icon_asset_id
		LEFT JOIN genshin_content_media content_media ON content_media.entry_id = entry.id
		LEFT JOIN genshin_media_assets media ON media.id = content_media.asset_id
		WHERE entry.category = $2
		  AND ($3 = '' OR lower(COALESCE(NULLIF(localized.name, ''), NULLIF(english.name, ''), entry.slug)) LIKE '%' || lower($3) || '%'
		                   OR lower(COALESCE(NULLIF(localized.description, ''), NULLIF(english.description, ''), '')) LIKE '%' || lower($3) || '%')
		  AND ($4 = '' OR entry.slug > $4)
		GROUP BY entry.id, localized.name, localized.description, english.name, english.description,
		         localized.source_payload, entry.source_payload, localized.entry_id, icon.storage_key
		ORDER BY entry.slug
		LIMIT $5`, params.Locale, category, params.Query, after, params.Limit+1)
	if err != nil {
		return Page[ContentSummary]{}, fmt.Errorf("list genshin content %s: %w", category, err)
	}
	defer rows.Close()
	items := make([]ContentSummary, 0, params.Limit+1)
	for rows.Next() {
		var item ContentSummary
		var sourcePayload, localizedPayload, mediaPayload []byte
		var iconStorageKey *string
		if err := rows.Scan(&item.ID, &item.ExternalID, &item.Category, &item.Slug, &item.Name, &item.Description,
			&iconStorageKey, &sourcePayload, &localizedPayload, &mediaPayload, &item.Locale, &item.LocaleFallback); err != nil {
			return Page[ContentSummary]{}, fmt.Errorf("scan genshin content %s: %w", category, err)
		}
		item.SourcePayload = append(json.RawMessage(nil), sourcePayload...)
		item.LocalizedPayload = append(json.RawMessage(nil), localizedPayload...)
		if len(mediaPayload) == 0 {
			mediaPayload = []byte(`[]`)
		}
		if err := json.Unmarshal(mediaPayload, &item.Media); err != nil {
			return Page[ContentSummary]{}, fmt.Errorf("decode genshin content media %s: %w", category, err)
		}
		if iconStorageKey != nil {
			url := "/genshin-impact/media/" + *iconStorageKey
			item.IconURL = &url
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Page[ContentSummary]{}, fmt.Errorf("iterate genshin content %s: %w", category, err)
	}
	return makePage(items, params.Limit, func(item ContentSummary) string { return item.Slug }), nil
}

func decodeTalentCursor(cursor string) (int64, error) {
	after, err := decodeCursor(cursor)
	if err != nil {
		return 0, err
	}
	if after == "" {
		return 0, nil
	}
	afterID, err := strconv.ParseInt(after, 10, 64)
	if err != nil || afterID < 1 {
		return 0, ErrInvalidCursor
	}
	return afterID, nil
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
