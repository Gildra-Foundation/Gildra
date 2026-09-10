package catalogquality

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// QualityProfileMidnightActive is deliberately scoped to the build-pinned
// Midnight cohort.  New strict public checks must be added to an explicit
// profile rather than silently applying to every historical WoW row.
const QualityProfileMidnightActive = "midnight-active"

type PublicQualityProfile struct {
	Key                  string
	RequiresRussianProof bool
}

func PublicQualityProfileFor(key string) (PublicQualityProfile, error) {
	switch strings.TrimSpace(strings.ToLower(key)) {
	case "", QualityProfileMidnightActive:
		return PublicQualityProfile{Key: QualityProfileMidnightActive, RequiresRussianProof: true}, nil
	default:
		return PublicQualityProfile{}, fmt.Errorf("unsupported catalog quality profile %q", key)
	}
}

type LocaleQuality struct {
	Available int64 `json:"available"`
	Technical int64 `json:"technical"`
	Missing   int64 `json:"missing"`
	Verified  int64 `json:"verified"`
	Fallback  int64 `json:"fallback"`
	Unproven  int64 `json:"unproven"`
}

type PublicQualityCoverage struct {
	EntityType          string        `json:"entityType"`
	Raw                 int64         `json:"raw"`
	Eligible            int64         `json:"eligible"`
	Review              int64         `json:"review"`
	Excluded            int64         `json:"excluded"`
	English             LocaleQuality `json:"english"`
	Russian             LocaleQuality `json:"russian"`
	UnresolvedText      int64         `json:"unresolvedTextTemplates"`
	UnresolvedTooltip   int64         `json:"unresolvedTooltipTemplates"`
	TooltipFallback     int64         `json:"tooltipFallbackValues"`
	MediaRecords        int64         `json:"mediaRecords"`
	CachedMedia         int64         `json:"cachedMedia"`
	FailedMedia         int64         `json:"failedMedia"`
	RemoteMedia         int64         `json:"remoteMedia"`
	MissingPrimaryMedia int64         `json:"missingPrimaryMedia"`
}

type PublicQualitySnapshot struct {
	Profile             string                  `json:"profile"`
	Product             string                  `json:"product"`
	BuildID             int64                   `json:"buildId"`
	BuildVersion        string                  `json:"buildVersion"`
	ActiveBuild         bool                    `json:"activeBuild"`
	Raw                 int64                   `json:"raw"`
	Eligible            int64                   `json:"eligible"`
	Review              int64                   `json:"review"`
	Excluded            int64                   `json:"excluded"`
	English             LocaleQuality           `json:"english"`
	Russian             LocaleQuality           `json:"russian"`
	UnresolvedText      int64                   `json:"unresolvedTextTemplates"`
	UnresolvedTooltip   int64                   `json:"unresolvedTooltipTemplates"`
	TooltipFallback     int64                   `json:"tooltipFallbackValues"`
	MediaRecords        int64                   `json:"mediaRecords"`
	CachedMedia         int64                   `json:"cachedMedia"`
	FailedMedia         int64                   `json:"failedMedia"`
	RemoteMedia         int64                   `json:"remoteMedia"`
	MissingPrimaryMedia int64                   `json:"missingPrimaryMedia"`
	RunningImports      int64                   `json:"runningImports"`
	FailedImports       int64                   `json:"failedImports"`
	Coverage            []PublicQualityCoverage `json:"coverage"`
}

// EvaluatePublicQuality produces the baseline used by catalog-audit.  The
// only currently supported profile uses catalog_entity_expansions as its
// denominator and catalog_entity_usability as its explicit public decision.
// Raw client rows outside that cohort are intentionally not part of this
// strict public snapshot.
func EvaluatePublicQuality(ctx context.Context, db *pgxpool.Pool, product, buildVersion, profileKey string) (PublicQualitySnapshot, error) {
	profile, err := PublicQualityProfileFor(profileKey)
	if err != nil {
		return PublicQualitySnapshot{}, err
	}
	product = strings.TrimSpace(strings.ToLower(product))
	buildVersion = strings.TrimSpace(buildVersion)
	if product == "" {
		return PublicQualitySnapshot{}, errors.New("product is required")
	}

	result := PublicQualitySnapshot{Profile: profile.Key, Product: product, Coverage: make([]PublicQualityCoverage, 0)}
	if err := db.QueryRow(ctx, `
		SELECT build.id,build.version,build.is_active
		FROM game_builds build
		JOIN game_products product ON product.id=build.product_id
		WHERE product.slug=$1 AND ($2='' OR build.version=$2)
		ORDER BY build.is_active DESC,build.build_number DESC LIMIT 1`, product, buildVersion).
		Scan(&result.BuildID, &result.BuildVersion, &result.ActiveBuild); err != nil {
		return PublicQualitySnapshot{}, fmt.Errorf("load quality profile build: %w", err)
	}

	// The cohort and usability tables are populated by the Midnight-specific
	// migrations. A confirmed non-item cohort row is eligible by default; item
	// decisions are explicit and review/excluded rows remain visible in audit.
	const scopeSQL = `
	WITH midnight AS (
		SELECT cohort.entity_type,cohort.external_id,
			COALESCE(usability.decision,'review') AS decision
		FROM catalog_entity_expansions cohort
		JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
		LEFT JOIN catalog_entity_usability usability
			ON usability.product_id=cohort.product_id AND usability.build_id=cohort.build_id
			AND usability.entity_type=cohort.entity_type AND usability.external_id=cohort.external_id
		WHERE cohort.product_id=(SELECT id FROM game_products WHERE slug=$1)
		  AND cohort.build_id=$2 AND cohort.classification='confirmed'
		  AND expansion.expansion_key='midnight'
	), selected AS (
		SELECT midnight.*,
			entity.id AS entity_id,
			version.id AS version_id
		FROM midnight
		LEFT JOIN game_entities entity ON entity.product_id=(SELECT id FROM game_products WHERE slug=$1)
			AND entity.entity_type=midnight.entity_type AND entity.external_id=midnight.external_id
			AND entity.deleted_at IS NULL
		LEFT JOIN game_entity_versions version ON version.id=COALESCE(entity.published_version_id,entity.latest_version_id)
			AND version.build_id=$2
	)
	SELECT count(*),
		count(*) FILTER (WHERE decision='eligible'),count(*) FILTER (WHERE decision='review'),count(*) FILTER (WHERE decision='excluded'),
		count(*) FILTER (WHERE decision='eligible' AND NULLIF(btrim(en.name),'') IS NOT NULL AND en.name !~* '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\\]'),
		count(*) FILTER (WHERE decision='eligible' AND NULLIF(btrim(ru.name),'') IS NOT NULL AND ru.name !~* '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\\]'),
		count(*) FILTER (WHERE decision='eligible' AND NULLIF(btrim(en.name),'') IS NOT NULL AND en.name ~* '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\\]'),
		count(*) FILTER (WHERE decision='eligible' AND NULLIF(btrim(ru.name),'') IS NOT NULL AND ru.name ~* '(^|[[:space:]])(dnt|test|unused|deprecated|internal|zzold|delete|dummy|nyi)([[:space:]_:-]|$)|\\[(ph|dnt|test|unused|deprecated|internal|zzold|nyi)\\]'),
		count(*) FILTER (WHERE decision='eligible' AND NULLIF(btrim(en.name),'') IS NULL),
		count(*) FILTER (WHERE decision='eligible' AND NULLIF(btrim(ru.name),'') IS NULL),
		count(*) FILTER (WHERE decision='eligible' AND ru.name IS NOT NULL AND btrim(ru.name)<>'' AND btrim(ru.name)=btrim(en.name)
			AND NOT EXISTS (SELECT 1 FROM catalog_entity_localization_artifacts proof JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
				WHERE proof.version_id=selected.version_id AND proof.locale='ru_RU' AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)),
		count(*) FILTER (WHERE decision='eligible' AND ru.name IS NOT NULL AND btrim(ru.name)<>'' AND btrim(ru.name)<>btrim(en.name)
			AND NOT EXISTS (SELECT 1 FROM catalog_entity_localization_artifacts proof JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
				WHERE proof.version_id=selected.version_id AND proof.locale='ru_RU' AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)),
		count(*) FILTER (WHERE decision='eligible' AND EXISTS (SELECT 1 FROM catalog_entity_localization_artifacts proof JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
			WHERE proof.version_id=selected.version_id AND proof.locale='en_US' AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)),
		count(*) FILTER (WHERE decision='eligible' AND EXISTS (SELECT 1 FROM catalog_entity_localization_artifacts proof JOIN catalog_source_artifacts artifact ON artifact.id=proof.source_artifact_id
			WHERE proof.version_id=selected.version_id AND proof.locale='ru_RU' AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL)),
		count(*) FILTER (WHERE decision='eligible' AND en.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'),
		count(*) FILTER (WHERE decision='eligible' AND ru.description ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'),
		count(*) FILTER (WHERE decision='eligible' AND EXISTS (SELECT 1 FROM catalog_entity_tooltips tooltip WHERE tooltip.version_id=selected.version_id AND tooltip.locale='en_US' AND (tooltip.plain_text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])' OR tooltip.blocks::text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'))),
		count(*) FILTER (WHERE decision='eligible' AND EXISTS (SELECT 1 FROM catalog_entity_tooltips tooltip WHERE tooltip.version_id=selected.version_id AND tooltip.locale='ru_RU' AND (tooltip.plain_text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])' OR tooltip.blocks::text ~ '\$(?:@spelldesc|[?A-Za-z{]|[0-9]+[A-Za-z])'))),
		count(*) FILTER (WHERE decision='eligible' AND EXISTS (SELECT 1 FROM catalog_entity_tooltips tooltip WHERE tooltip.version_id=selected.version_id AND (tooltip.plain_text ~* 'a game-defined value|значение, определяемое игрой' OR tooltip.blocks::text ~* 'a game-defined value|значение, определяемое игрой')))
	FROM selected
	LEFT JOIN game_entity_localizations en ON en.version_id=selected.version_id AND en.locale='en_US'
	LEFT JOIN game_entity_localizations ru ON ru.version_id=selected.version_id AND ru.locale='ru_RU'`

	var englishTechnical, russianTechnical, englishMissing, russianMissing int64
	var russianFallback, russianUnproven, englishVerified, russianVerified int64
	var englishTextTemplates, russianTextTemplates, englishTooltipTemplates, russianTooltipTemplates, tooltipFallback int64
	if err := db.QueryRow(ctx, scopeSQL, product, result.BuildID).Scan(
		&result.Raw, &result.Eligible, &result.Review, &result.Excluded,
		&result.English.Available, &result.Russian.Available,
		&englishTechnical, &russianTechnical, &englishMissing, &russianMissing,
		&russianFallback, &russianUnproven, &englishVerified, &russianVerified,
		&englishTextTemplates, &russianTextTemplates, &englishTooltipTemplates, &russianTooltipTemplates, &tooltipFallback); err != nil {
		return PublicQualitySnapshot{}, fmt.Errorf("query quality profile snapshot: %w", err)
	}
	result.English.Technical, result.Russian.Technical = englishTechnical, russianTechnical
	result.English.Missing, result.Russian.Missing = englishMissing, russianMissing
	result.English.Verified, result.Russian.Verified = englishVerified, russianVerified
	result.Russian.Fallback, result.Russian.Unproven = russianFallback, russianUnproven
	result.UnresolvedText = englishTextTemplates + russianTextTemplates
	result.UnresolvedTooltip = englishTooltipTemplates + russianTooltipTemplates
	result.TooltipFallback = tooltipFallback

	rows, err := db.Query(ctx, `
		WITH cohort AS (
			SELECT cohort.entity_type,cohort.external_id,
			COALESCE(usability.decision,'review') AS decision
			FROM catalog_entity_expansions cohort
			JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
			LEFT JOIN catalog_entity_usability usability ON usability.product_id=cohort.product_id AND usability.build_id=cohort.build_id
				AND usability.entity_type=cohort.entity_type AND usability.external_id=cohort.external_id
			WHERE cohort.product_id=(SELECT id FROM game_products WHERE slug=$1) AND cohort.build_id=$2
			  AND cohort.classification='confirmed' AND expansion.expansion_key='midnight'
		), counts AS (
			SELECT entity_type,count(*) AS raw,count(*) FILTER (WHERE decision='eligible') AS eligible,
				count(*) FILTER (WHERE decision='review') AS review,count(*) FILTER (WHERE decision='excluded') AS excluded
			FROM cohort GROUP BY entity_type
		)
		SELECT entity_type,raw,eligible,review,excluded FROM counts ORDER BY entity_type`, product, result.BuildID)
	if err != nil {
		return PublicQualitySnapshot{}, fmt.Errorf("query quality profile coverage: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var item PublicQualityCoverage
		if err := rows.Scan(&item.EntityType, &item.Raw, &item.Eligible, &item.Review, &item.Excluded); err != nil {
			return PublicQualitySnapshot{}, fmt.Errorf("scan quality profile coverage: %w", err)
		}
		var englishTechnical, russianTechnical, englishMissing, russianMissing int64
		var russianFallback, russianUnproven, englishVerified, russianVerified int64
		var englishTextTemplates, russianTextTemplates, englishTooltipTemplates, russianTooltipTemplates, tooltipFallback int64
		if err := db.QueryRow(ctx, scopeSQL+` WHERE selected.entity_type=$3`, product, result.BuildID, item.EntityType).Scan(
			&item.Raw, &item.Eligible, &item.Review, &item.Excluded,
			&item.English.Available, &item.Russian.Available,
			&englishTechnical, &russianTechnical, &englishMissing, &russianMissing,
			&russianFallback, &russianUnproven, &englishVerified, &russianVerified,
			&englishTextTemplates, &russianTextTemplates, &englishTooltipTemplates, &russianTooltipTemplates, &tooltipFallback); err != nil {
			return PublicQualitySnapshot{}, fmt.Errorf("query quality profile coverage for %s: %w", item.EntityType, err)
		}
		item.English.Technical, item.Russian.Technical = englishTechnical, russianTechnical
		item.English.Missing, item.Russian.Missing = englishMissing, russianMissing
		item.English.Verified, item.Russian.Verified = englishVerified, russianVerified
		item.Russian.Fallback, item.Russian.Unproven = russianFallback, russianUnproven
		item.UnresolvedText = englishTextTemplates + russianTextTemplates
		item.UnresolvedTooltip = englishTooltipTemplates + russianTooltipTemplates
		item.TooltipFallback = tooltipFallback
		result.Coverage = append(result.Coverage, item)
	}
	if err := rows.Err(); err != nil {
		return PublicQualitySnapshot{}, fmt.Errorf("read quality profile coverage: %w", err)
	}

	if err := db.QueryRow(ctx, `
		WITH cohort AS (
			SELECT cohort.entity_type,cohort.external_id,
				CASE WHEN cohort.entity_type='item' THEN COALESCE(usability.decision,'review') ELSE 'eligible' END AS decision
			FROM catalog_entity_expansions cohort
			JOIN catalog_expansions expansion ON expansion.id=cohort.expansion_id
			LEFT JOIN catalog_entity_usability usability ON usability.product_id=cohort.product_id AND usability.build_id=cohort.build_id
				AND usability.entity_type=cohort.entity_type AND usability.external_id=cohort.external_id
			WHERE cohort.product_id=(SELECT id FROM game_products WHERE slug=$1) AND cohort.build_id=$2
			  AND cohort.classification='confirmed' AND expansion.expansion_key='midnight'
		), eligible AS (
			SELECT * FROM cohort WHERE decision='eligible' AND entity_type='item'
		), media AS (
			SELECT media.entity_type,media.external_id,
				count(*) AS records,
				count(*) FILTER (WHERE media.cache_status='cached' AND NULLIF(media.cached_url,'') IS NOT NULL AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL) AS cached,
				count(*) FILTER (WHERE media.cache_status='failed') AS failed,
				count(*) FILTER (WHERE media.cache_status='remote') AS remote
			FROM catalog_entity_media media WHERE media.build_id=$2 GROUP BY media.entity_type,media.external_id
		)
		SELECT COALESCE(sum(media.records),0),COALESCE(sum(media.cached),0),COALESCE(sum(media.failed),0),COALESCE(sum(media.remote),0),
			count(*) FILTER (WHERE media.entity_type IS NULL OR media.cached=0)
		FROM eligible cohort LEFT JOIN media ON media.entity_type=cohort.entity_type AND media.external_id=cohort.external_id`, product, result.BuildID).
		Scan(&result.MediaRecords, &result.CachedMedia, &result.FailedMedia, &result.RemoteMedia, &result.MissingPrimaryMedia); err != nil {
		return PublicQualitySnapshot{}, fmt.Errorf("query quality profile media: %w", err)
	}
	for index := range result.Coverage {
		if result.Coverage[index].EntityType != "item" {
			continue
		}
		result.Coverage[index].MediaRecords = result.MediaRecords
		result.Coverage[index].CachedMedia = result.CachedMedia
		result.Coverage[index].FailedMedia = result.FailedMedia
		result.Coverage[index].RemoteMedia = result.RemoteMedia
		result.Coverage[index].MissingPrimaryMedia = result.MissingPrimaryMedia
	}
	if err := db.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE run.status='RUNNING'),
			count(*) FILTER (WHERE run.status='FAILED' AND COALESCE(queue.state,'quarantined')<>'resolved')
		FROM catalog_import_runs run JOIN game_products product ON product.id=run.product_id
		LEFT JOIN catalog_import_failure_queue queue ON queue.import_run_id=run.id
		WHERE product.slug=$1 AND run.build_id=$2`, product, result.BuildID).
		Scan(&result.RunningImports, &result.FailedImports); err != nil {
		return PublicQualitySnapshot{}, fmt.Errorf("query quality profile imports: %w", err)
	}
	return result, nil
}

// ApplyPublicQualityGate turns only profile-scoped public failures into
// blocking production checks. Historical warnings from the broad readiness
// report remain available, but cannot make this profile appear complete.
func ApplyPublicQualityGate(report *ReadinessReport, snapshot PublicQualitySnapshot) {
	profile, _ := PublicQualityProfileFor(snapshot.Profile)
	scopeFailure := snapshot.Raw == 0 || !snapshot.ActiveBuild
	scopeCount := snapshot.Raw
	if !snapshot.ActiveBuild {
		scopeCount++
	}
	report.add("quality_profile_scope", ScopeProduction, scopeFailure, scopeCount,
		fmt.Sprintf("%s requires a non-empty cohort pinned to the active build", snapshot.Profile))
	report.add("public_nontechnical_english_names", ScopeProduction,
		snapshot.English.Missing+snapshot.English.Technical != 0,
		snapshot.English.Missing+snapshot.English.Technical,
		"eligible public records must have a non-technical English display name")
	russianFailure := snapshot.Russian.Missing + snapshot.Russian.Technical
	if profile.RequiresRussianProof {
		russianFailure += snapshot.Russian.Fallback + snapshot.Russian.Unproven
	}
	report.add("public_russian_names", ScopeProduction, russianFailure != 0, russianFailure,
		"Russian availability is measured separately; fallback and unproven text do not count as verified Russian")
	// Tooltip rows retain source-backed raw templates. The API resolves these
	// at request time, so a stored token alone is not a public defect. A
	// literal sanitizer fallback is observable public output and remains a
	// blocking failure. UnresolvedTooltip is intentionally audit-only here.
	templateFailures := snapshot.UnresolvedText + snapshot.TooltipFallback
	report.add("public_unresolved_templates", ScopeProduction,
		templateFailures != 0, templateFailures,
		"public eligible records must not expose unresolved descriptions or runtime tooltip fallback values")
	// Failed and remote observations are retained as source history. They do not
	// make a public card broken when a newer verified cached primary already
	// exists for that entity. MissingPrimaryMedia is the build-pinned cardinality
	// of cards that have no usable public image at all, and is the only safe
	// release blocker here.
	report.add("public_media_backlog", ScopeProduction,
		snapshot.MissingPrimaryMedia != 0,
		snapshot.MissingPrimaryMedia,
		"public eligible records must have a verified cached primary image")
	report.add("public_import_failures", ScopeProduction, snapshot.FailedImports != 0, snapshot.FailedImports,
		"the profiled build has failed catalog imports")
}
