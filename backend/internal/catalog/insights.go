package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type QualityCheck struct {
	Key, Label, Detail string
	Present, Required  bool
}

type EntitySource struct {
	Source, DisplayName, SourceURL string
	Documents                      int
	ImportedAt                     *time.Time
}

type EntityQuality struct {
	EntityID           uuid.UUID
	Score              int
	Status             string
	BuildID            int64
	BuildNumber        int
	BuildVersion       string
	UpdatedAt          time.Time
	Checks             []QualityCheck
	Confirmed, Missing []string
	Sources            []EntitySource
}

type EntityVersion struct {
	ID                    uuid.UUID
	BuildID               int64
	BuildNumber, Revision int
	BuildVersion          string
	Name, Description     string
	SourceURL             string
	ObservedAt            time.Time
	Payload               map[string]any
}

type EntityChange struct {
	Field, Label, ChangeType string
	Before, After            any
}

type EntityComparison struct {
	From, To EntityVersion
	Changes  []EntityChange
}

func (s *Service) Quality(ctx context.Context, id uuid.UUID, locale string) (EntityQuality, error) {
	locale = normalizeLocale(locale)
	var report EntityQuality
	var entityType string
	var hasName, hasDescription, hasTooltip, hasIcon, hasRelations, hasStructuredFacts, hasSource bool
	err := s.postgres.QueryRow(ctx, `
		SELECT entity.id,version.build_id,build.build_number,build.version,entity.updated_at,entity.entity_type,
			COALESCE(NULLIF(localized.name,''),NULLIF(fallback.name,'')) IS NOT NULL,
			COALESCE(NULLIF(localized.description,''),NULLIF(fallback.description,'')) IS NOT NULL,
			EXISTS(SELECT 1 FROM catalog_entity_tooltips tooltip WHERE tooltip.version_id=version.id
				AND tooltip.locale IN ($2,'en_US') AND (tooltip.plain_text<>'' OR jsonb_array_length(tooltip.blocks)>0))
				OR (entity.entity_type='quest' AND EXISTS(SELECT 1 FROM catalog_quest_registry registry
					WHERE registry.build_id=version.build_id AND registry.quest_id=entity.external_id)),
			EXISTS(SELECT 1 FROM catalog_entity_icons icon WHERE icon.build_id=version.build_id
				AND icon.entity_type=entity.entity_type AND icon.external_id=entity.external_id)
				OR COALESCE(version.payload->>'icon_file_data_id',version.payload #>> '{raidbots,icon}') IS NOT NULL,
			EXISTS(SELECT 1 FROM game_entity_links link
				WHERE link.build_id=version.build_id
				  AND (link.source_entity_id=entity.id OR link.target_entity_id=entity.id)),
			CASE entity.entity_type
				WHEN 'item' THEN EXISTS(SELECT 1 FROM catalog_items facts WHERE facts.version_id=version.id)
				WHEN 'spell' THEN EXISTS(SELECT 1 FROM catalog_spells facts WHERE facts.version_id=version.id)
				WHEN 'profession' THEN EXISTS(SELECT 1 FROM catalog_professions facts WHERE facts.version_id=version.id)
				WHEN 'creature' THEN EXISTS(SELECT 1 FROM catalog_creatures facts WHERE facts.version_id=version.id)
				WHEN 'npc' THEN EXISTS(SELECT 1 FROM catalog_creatures facts WHERE facts.version_id=version.id)
				WHEN 'quest' THEN EXISTS(SELECT 1 FROM catalog_quest_registry facts WHERE facts.build_id=version.build_id AND facts.quest_id=entity.external_id)
				WHEN 'talent' THEN EXISTS(SELECT 1 FROM catalog_talent_spell_relations facts WHERE facts.talent_version_id=version.id)
				WHEN 'pvp_talent' THEN EXISTS(SELECT 1 FROM catalog_talent_spell_relations facts WHERE facts.talent_version_id=version.id)
				ELSE version.payload<>'{}'::jsonb
			END,
			version.source_url<>'' OR EXISTS(SELECT 1 FROM catalog_entity_source_documents doc
				WHERE doc.build_id=version.build_id AND doc.entity_type=entity.entity_type AND doc.external_id=entity.external_id)
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.published_version_id
		JOIN game_builds build ON build.id=version.build_id
		LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale=$2
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
		WHERE entity.id=$1 AND entity.deleted_at IS NULL`, id, locale).Scan(
		&report.EntityID, &report.BuildID, &report.BuildNumber, &report.BuildVersion, &report.UpdatedAt, &entityType,
		&hasName, &hasDescription, &hasTooltip, &hasIcon, &hasRelations, &hasStructuredFacts, &hasSource)
	if errors.Is(err, pgx.ErrNoRows) {
		return EntityQuality{}, ErrNotFound
	}
	if err != nil {
		return EntityQuality{}, fmt.Errorf("read entity quality: %w", err)
	}

	checks := []QualityCheck{
		{Key: "name", Label: qualityLabel(locale, "Name", "Название"), Detail: qualityLabel(locale, "Requested locale or documented fallback", "Запрошенная локаль или подтверждённый fallback"), Present: hasName, Required: true},
		{Key: "description", Label: qualityLabel(locale, "Description", "Описание"), Detail: qualityLabel(locale, "Source-backed localized text", "Локализованный текст из источника"), Present: hasDescription, Required: true},
		{Key: "tooltip", Label: "Tooltip", Detail: qualityLabel(locale, "Canonical public projection", "Каноническая публичная проекция"), Present: hasTooltip, Required: true},
		{Key: "icon", Label: qualityLabel(locale, "Icon", "Иконка"), Detail: qualityLabel(locale, "Official media or client FileDataID", "Официальное медиа или клиентский FileDataID"), Present: hasIcon, Required: true},
		{Key: "facts", Label: qualityLabel(locale, "Structured facts", "Структурированные факты"), Detail: qualityLabel(locale, "Normalized "+entityType+" domain row", "Нормализованная запись домена "+entityType), Present: hasStructuredFacts, Required: true},
		{Key: "source", Label: qualityLabel(locale, "Source provenance", "Источник данных"), Detail: qualityLabel(locale, "Build-pinned source document", "Документ источника с привязкой к сборке"), Present: hasSource, Required: true},
		{Key: "relationships", Label: qualityLabel(locale, "Relationships", "Связи"), Detail: qualityLabel(locale, "Normalized entity graph edge", "Нормализованное ребро графа сущностей"), Present: hasRelations, Required: false},
	}
	report.Checks = checks
	weight, earned := 0, 0
	for _, check := range checks {
		points := 10
		if check.Required {
			points = 15
		}
		weight += points
		if check.Present {
			earned += points
			report.Confirmed = append(report.Confirmed, check.Key)
		} else {
			report.Missing = append(report.Missing, check.Key)
		}
	}
	report.Score = earned * 100 / weight
	switch {
	case report.Score >= 85:
		report.Status = "verified"
	case report.Score >= 50:
		report.Status = "partial"
	default:
		report.Status = "minimal"
	}

	rows, err := s.postgres.Query(ctx, `
		WITH selected AS (
			SELECT entity.entity_type,entity.external_id,version.build_id,version.source,version.source_url,version.source_artifact_id,version.observed_at
			FROM game_entities entity JOIN game_entity_versions version ON version.id=entity.published_version_id WHERE entity.id=$1
		), sources AS (
			SELECT doc.source,doc.source_url,doc.imported_at FROM selected
			JOIN catalog_entity_source_documents doc ON doc.build_id=selected.build_id AND doc.entity_type=selected.entity_type
				AND doc.external_id=selected.external_id AND doc.locale IN ($2,'en_US')
			UNION ALL
			SELECT artifact.source,artifact.source_url,artifact.fetched_at FROM selected
			JOIN catalog_source_artifacts artifact ON artifact.id=selected.source_artifact_id
			UNION ALL
			SELECT selected.source,selected.source_url,selected.observed_at FROM selected
		)
		SELECT sources.source,COALESCE(policy.display_name,sources.source),count(*),max(sources.source_url),max(sources.imported_at)
		FROM sources LEFT JOIN catalog_source_policies policy ON policy.source=sources.source
		GROUP BY sources.source,policy.display_name ORDER BY sources.source`, id, locale)
	if err != nil {
		return EntityQuality{}, fmt.Errorf("read entity sources: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var source EntitySource
		if err := rows.Scan(&source.Source, &source.DisplayName, &source.Documents, &source.SourceURL, &source.ImportedAt); err != nil {
			return EntityQuality{}, fmt.Errorf("scan entity source: %w", err)
		}
		report.Sources = append(report.Sources, source)
	}
	return report, rows.Err()
}

func qualityLabel(locale, en, ru string) string {
	if locale == "ru_RU" {
		return ru
	}
	return en
}

func (s *Service) Versions(ctx context.Context, id uuid.UUID, locale string, limit int) ([]EntityVersion, error) {
	if limit < 1 || limit > 50 {
		return nil, errors.New("limit must be between 1 and 50")
	}
	var exists bool
	if err := s.postgres.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_entities WHERE id=$1 AND deleted_at IS NULL AND published_version_id IS NOT NULL)`, id).Scan(&exists); err != nil {
		return nil, fmt.Errorf("find version entity: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}
	rows, err := s.postgres.Query(ctx, `
		SELECT version.id,version.build_id,build.build_number,build.version,version.revision,
			COALESCE(NULLIF(localized.name,''),fallback.name,''),COALESCE(NULLIF(localized.description,''),fallback.description,''),
			version.source_url,version.observed_at,version.payload
		FROM game_entity_versions version
		JOIN game_builds build ON build.id=version.build_id
		LEFT JOIN catalog_snapshots snapshot ON snapshot.id=version.snapshot_id
		LEFT JOIN game_entity_localizations localized ON localized.version_id=version.id AND localized.locale=$2
		LEFT JOIN game_entity_localizations fallback ON fallback.version_id=version.id AND fallback.locale='en_US'
		WHERE version.entity_id=$1
		  AND (version.snapshot_id IS NULL OR snapshot.status='published')
		ORDER BY build.build_number DESC,version.revision DESC LIMIT $3`, id, normalizeLocale(locale), limit)
	if err != nil {
		return nil, fmt.Errorf("list entity versions: %w", err)
	}
	defer rows.Close()
	result := make([]EntityVersion, 0, limit)
	for rows.Next() {
		var item EntityVersion
		var payload []byte
		if err := rows.Scan(&item.ID, &item.BuildID, &item.BuildNumber, &item.BuildVersion, &item.Revision, &item.Name, &item.Description, &item.SourceURL, &item.ObservedAt, &payload); err != nil {
			return nil, fmt.Errorf("scan entity version: %w", err)
		}
		if err := json.Unmarshal(payload, &item.Payload); err != nil {
			return nil, fmt.Errorf("decode entity version: %w", err)
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Service) Compare(ctx context.Context, id uuid.UUID, locale string, fromBuildID, toBuildID *int64) (EntityComparison, error) {
	if (fromBuildID == nil) != (toBuildID == nil) {
		return EntityComparison{}, errors.New("fromBuildId and toBuildId must be provided together")
	}
	if fromBuildID != nil && *fromBuildID == *toBuildID {
		return EntityComparison{}, errors.New("fromBuildId and toBuildId must differ")
	}
	versions, err := s.Versions(ctx, id, locale, 50)
	if err != nil {
		return EntityComparison{}, err
	}
	from, to, ok := selectComparisonVersions(versions, fromBuildID, toBuildID)
	if !ok {
		return EntityComparison{}, ErrNotFound
	}
	fromFacts, err := s.comparisonFacts(ctx, from.ID, locale)
	if err != nil {
		return EntityComparison{}, fmt.Errorf("read comparison source facts: %w", err)
	}
	toFacts, err := s.comparisonFacts(ctx, to.ID, locale)
	if err != nil {
		return EntityComparison{}, fmt.Errorf("read comparison target facts: %w", err)
	}
	changes := compareVersionFields(from, to, fromFacts, toFacts, normalizeLocale(locale))
	return EntityComparison{From: from, To: to, Changes: changes}, nil
}

func selectComparisonVersions(versions []EntityVersion, fromBuildID, toBuildID *int64) (EntityVersion, EntityVersion, bool) {
	if fromBuildID == nil {
		latestByBuild := make([]EntityVersion, 0, 2)
		var previousBuild int64
		for _, version := range versions {
			if len(latestByBuild) > 0 && version.BuildID == previousBuild {
				continue
			}
			latestByBuild = append(latestByBuild, version)
			previousBuild = version.BuildID
			if len(latestByBuild) == 2 {
				return latestByBuild[1], latestByBuild[0], true
			}
		}
		return EntityVersion{}, EntityVersion{}, false
	}
	var from, to *EntityVersion
	for index := range versions {
		if from == nil && versions[index].BuildID == *fromBuildID {
			from = &versions[index]
		}
		if to == nil && versions[index].BuildID == *toBuildID {
			to = &versions[index]
		}
	}
	if from == nil || to == nil {
		return EntityVersion{}, EntityVersion{}, false
	}
	return *from, *to, true
}

func (s *Service) comparisonFacts(ctx context.Context, versionID uuid.UUID, locale string) (map[string]any, error) {
	var raw []byte
	err := s.postgres.QueryRow(ctx, `
		SELECT jsonb_strip_nulls(jsonb_build_object(
			'tooltip',COALESCE(NULLIF(localized_tooltip.plain_text,''),NULLIF(fallback_tooltip.plain_text,'')),
			'item_level',item.item_level,'required_level',item.required_level,'quality',item.quality,
			'inventory_type',item.inventory_type,'class_id',item.item_class_id,'subclass_id',item.item_subclass_id,
			'item_stats',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',stat.stat_type,'value',stat.percent_editor,'socket',stat.socket_percentage) ORDER BY stat.slot) FROM catalog_item_stats stat WHERE stat.version_id=version.id),'[]'::jsonb),
			'acquisition_sources',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',source.source_type,'id',source.source_id,'context',source.context_id,'chance',source.chance_percent,'difficulty',source.difficulty_mask) ORDER BY source.source_type,source.source_id,source.context_id) FROM catalog_item_acquisition_sources source WHERE source.version_id=version.id),'[]'::jsonb),
			'school',spell.school,'cast_time',spell.cast_time,'cooldown',spell.cooldown_ms,
			'min_range',spell.min_range,'max_range',spell.max_range,
			'spell_effects',COALESCE((SELECT jsonb_agg(jsonb_build_object('index',effect.effect_index,'difficulty',effect.difficulty_id,'type',effect.effect_type,'aura',effect.aura_type,'base',effect.base_points,'sp',effect.coefficient,'ap',effect.attack_power_coefficient,'period',effect.amplitude_ms,'targets',effect.chain_targets,'attributes',effect.attributes) ORDER BY effect.effect_index,effect.difficulty_id,effect.source) FROM catalog_spell_effects effect WHERE effect.spell_version_id=version.id),'[]'::jsonb),
			'talent_spells',COALESCE((SELECT jsonb_agg(jsonb_build_object('spell_id',spell_entity.external_id,'relationship',relation.relationship,'attributes',relation.attributes) ORDER BY relation.relationship,spell_entity.external_id) FROM catalog_talent_spell_relations relation JOIN game_entity_versions spell_version ON spell_version.id=relation.spell_version_id JOIN game_entities spell_entity ON spell_entity.id=spell_version.entity_id WHERE relation.talent_version_id=version.id),'[]'::jsonb)
		))
		FROM game_entity_versions version
		LEFT JOIN catalog_items item ON item.version_id=version.id
		LEFT JOIN catalog_spells spell ON spell.version_id=version.id
		LEFT JOIN catalog_entity_tooltips localized_tooltip ON localized_tooltip.version_id=version.id AND localized_tooltip.locale=$2
		LEFT JOIN catalog_entity_tooltips fallback_tooltip ON fallback_tooltip.version_id=version.id AND fallback_tooltip.locale='en_US'
		WHERE version.id=$1`, versionID, normalizeLocale(locale)).Scan(&raw)
	if err != nil {
		return nil, err
	}
	facts := make(map[string]any)
	if err := json.Unmarshal(raw, &facts); err != nil {
		return nil, fmt.Errorf("decode comparison facts: %w", err)
	}
	return facts, nil
}

func compareVersionFields(from, to EntityVersion, fromFacts, toFacts map[string]any, locale string) []EntityChange {
	fields := []struct {
		key, label    string
		before, after any
	}{
		{"name", qualityLabel(locale, "Name", "Название"), from.Name, to.Name},
		{"description", qualityLabel(locale, "Description", "Описание"), from.Description, to.Description},
	}
	labels := map[string][2]string{
		"tooltip": {"Tooltip", "Tooltip"}, "item_level": {"Item level", "Уровень предмета"},
		"required_level": {"Required level", "Требуемый уровень"}, "quality": {"Quality", "Качество"},
		"inventory_type": {"Equipment slot", "Ячейка экипировки"}, "class_id": {"Item class", "Класс предмета"},
		"subclass_id": {"Item subclass", "Подкласс предмета"}, "item_stats": {"Item stats", "Характеристики предмета"},
		"acquisition_sources": {"Acquisition sources", "Источники добычи"}, "school": {"Spell school", "Школа заклинания"},
		"cast_time": {"Cast time", "Время применения"}, "cooldown": {"Cooldown", "Время восстановления"},
		"min_range": {"Minimum range", "Минимальная дистанция"}, "max_range": {"Maximum range", "Максимальная дистанция"},
		"spell_effects": {"Spell effects", "Эффекты заклинания"}, "talent_spells": {"Talent modifications", "Изменения таланта"},
	}
	for _, key := range []string{"tooltip", "item_level", "required_level", "quality", "inventory_type", "class_id", "subclass_id", "item_stats", "acquisition_sources", "school", "cast_time", "cooldown", "min_range", "max_range", "spell_effects", "talent_spells"} {
		label := labels[key][0]
		if locale == "ru_RU" {
			label = labels[key][1]
		}
		fields = append(fields, struct {
			key, label    string
			before, after any
		}{key, label, normalizeComparisonValue(key, fromFacts[key]), normalizeComparisonValue(key, toFacts[key])})
	}
	result := make([]EntityChange, 0)
	for _, field := range fields {
		if reflect.DeepEqual(field.before, field.after) {
			continue
		}
		kind := "changed"
		if isEmpty(field.before) {
			kind = "added"
		}
		if isEmpty(field.after) {
			kind = "removed"
		}
		result = append(result, EntityChange{Field: field.key, Label: field.label, Before: field.before, After: field.after, ChangeType: kind})
	}
	return result
}

func normalizeComparisonValue(field string, value any) any {
	if field != "quality" {
		return value
	}
	text := strings.ToUpper(strings.TrimSpace(fmt.Sprint(value)))
	quality := map[string]string{
		"POOR": "0", "COMMON": "1", "UNCOMMON": "2", "RARE": "3", "EPIC": "4",
		"LEGENDARY": "5", "ARTIFACT": "6", "HEIRLOOM": "7", "WOW_TOKEN": "8",
	}
	if normalized, ok := quality[text]; ok {
		return normalized
	}
	return value
}

func isEmpty(value any) bool { return value == nil || value == "" }
