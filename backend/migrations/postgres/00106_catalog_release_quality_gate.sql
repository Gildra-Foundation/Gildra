-- +goose Up
-- A release may contain a newer version of an already published entity.  The
-- provenance gate proves where that version came from; this gate proves that
-- selecting it will not silently discard facts that the public API already
-- exposes.  Missing enrichment on a brand-new entity is reported as a warning
-- and can be fixed by a later enrichment release.  A regression of an already
-- published fact is blocking.
-- +goose StatementBegin
CREATE FUNCTION catalog_release_quality_gate(p_release_id UUID)
RETURNS TABLE(
    check_key TEXT,
    failed_count BIGINT,
    blocking BOOLEAN,
    details JSONB
)
LANGUAGE sql
STABLE
AS $$
WITH release_context AS (
    SELECT release_record.id,release_record.product_id,release_record.build_id,release_record.status,
        build.build_number,
        previous_build.build_number AS previous_build_number
    FROM catalog_releases release_record
    LEFT JOIN game_builds build ON build.id=release_record.build_id
    LEFT JOIN catalog_public_release_state public_state
        ON public_state.product_id=release_record.product_id
    LEFT JOIN catalog_releases previous_release
        ON previous_release.id=public_state.release_id
    LEFT JOIN game_builds previous_build
        ON previous_build.id=previous_release.build_id
    WHERE release_record.id=p_release_id
),
snapshot_status AS (
    SELECT count(*) AS snapshot_count,
        count(*) FILTER (WHERE snapshot.status<>'validated') AS invalid_snapshot_count
    FROM catalog_snapshots snapshot
    WHERE snapshot.release_id=p_release_id
),
selected_candidates AS (
    SELECT DISTINCT ON (entity.id)
        entity.id AS entity_id,entity.entity_type,entity.external_id,
        entity.published_version_id,
        candidate.id AS candidate_version_id,
        candidate.build_id AS candidate_build_id,
        release_record.build_number,release_record.previous_build_number
    FROM release_context release_record
    JOIN catalog_snapshots snapshot
        ON snapshot.release_id=release_record.id AND snapshot.status='validated'
    JOIN game_entity_versions candidate
        ON candidate.snapshot_id=snapshot.id AND candidate.build_id=release_record.build_id
    JOIN game_entities entity
        ON entity.id=candidate.entity_id AND entity.product_id=release_record.product_id
        AND entity.deleted_at IS NULL AND entity.latest_version_id=candidate.id
    ORDER BY entity.id,candidate.revision DESC,candidate.created_at DESC,candidate.id DESC
),
relevant_versions AS (
    SELECT candidate_version_id AS version_id
    FROM selected_candidates
    UNION
    SELECT published_version_id
    FROM selected_candidates
    WHERE published_version_id IS NOT NULL
),
item_stat_counts AS (
    SELECT stats.version_id,count(*) AS row_count
    FROM catalog_item_stats stats
    JOIN relevant_versions relevant ON relevant.version_id=stats.version_id
    GROUP BY stats.version_id
),
item_effect_counts AS (
    SELECT effects.version_id,count(*) AS row_count
    FROM catalog_item_effects effects
    JOIN relevant_versions relevant ON relevant.version_id=effects.version_id
    GROUP BY effects.version_id
),
item_acquisition_counts AS (
    SELECT acquisitions.version_id,count(*) AS row_count
    FROM catalog_item_acquisition_sources acquisitions
    JOIN relevant_versions relevant ON relevant.version_id=acquisitions.version_id
    GROUP BY acquisitions.version_id
),
spell_effect_counts AS (
    SELECT effects.spell_version_id,count(*) AS row_count
    FROM catalog_spell_effects effects
    JOIN relevant_versions relevant ON relevant.version_id=effects.spell_version_id
    GROUP BY effects.spell_version_id
),
spell_fact_counts AS (
    SELECT spells.version_id,count(*) AS row_count
    FROM catalog_spells spells
    JOIN relevant_versions relevant ON relevant.version_id=spells.version_id
    GROUP BY spells.version_id
),
item_tooltip_counts AS (
    SELECT tooltips.version_id,count(*) AS row_count
    FROM catalog_item_tooltips tooltips
    JOIN relevant_versions relevant ON relevant.version_id=tooltips.version_id
    GROUP BY tooltips.version_id
),
entity_tooltip_counts AS (
    SELECT tooltips.version_id,count(*) AS row_count
    FROM catalog_entity_tooltips tooltips
    JOIN relevant_versions relevant ON relevant.version_id=tooltips.version_id
    GROUP BY tooltips.version_id
),
candidate_metrics AS (
    SELECT candidate.*,
        published.id AS published_version,
        COALESCE(candidate_en.name,'') AS candidate_en_name,
        COALESCE(candidate_ru.name,'') AS candidate_ru_name,
        COALESCE(candidate_en.description,'') AS candidate_en_description,
        COALESCE(candidate_ru.description,'') AS candidate_ru_description,
        COALESCE(published_en.name,'') AS published_en_name,
        COALESCE(published_ru.name,'') AS published_ru_name,
        COALESCE(published_en.description,'') AS published_en_description,
        COALESCE(published_ru.description,'') AS published_ru_description,
        COALESCE(candidate_item_stat_count.row_count,0) AS candidate_item_stats,
        COALESCE(published_item_stat_count.row_count,0) AS published_item_stats,
        COALESCE(candidate_item_effect_count.row_count,0) AS candidate_item_effects,
        COALESCE(published_item_effect_count.row_count,0) AS published_item_effects,
        COALESCE(candidate_item_acquisition_count.row_count,0) AS candidate_item_acquisition,
        COALESCE(published_item_acquisition_count.row_count,0) AS published_item_acquisition,
        COALESCE(candidate_spell_effect_count.row_count,0) AS candidate_spell_effects,
        COALESCE(published_spell_effect_count.row_count,0) AS published_spell_effects,
        COALESCE(candidate_spell_fact_count.row_count,0) AS candidate_spell_facts,
        COALESCE(published_spell_fact_count.row_count,0) AS published_spell_facts,
        COALESCE(candidate_item_tooltip_count.row_count,0) AS candidate_item_tooltips,
        COALESCE(published_item_tooltip_count.row_count,0) AS published_item_tooltips,
        COALESCE(candidate_entity_tooltip_count.row_count,0) AS candidate_entity_tooltips,
        COALESCE(published_entity_tooltip_count.row_count,0) AS published_entity_tooltips,
        EXISTS (
            SELECT 1
            FROM catalog_entity_media media
            JOIN game_builds media_build ON media_build.id=media.build_id
                AND media_build.product_id=release_product.product_id
            JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
            JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
            WHERE media.entity_id=candidate.entity_id
              AND media.cache_status='cached'
              AND NULLIF(media.cached_url,'') IS NOT NULL
              AND media.cached_content_hash IS NOT NULL
              AND media.cached_byte_size IS NOT NULL
              AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
              AND artifact.byte_size IS NOT NULL
              AND media_build.build_number<=candidate.build_number
        ) AS has_cached_media
    FROM selected_candidates candidate
    JOIN release_context release_product ON release_product.id=p_release_id
    LEFT JOIN game_entity_versions published ON published.id=candidate.published_version_id
    LEFT JOIN game_entity_localizations candidate_en
        ON candidate_en.version_id=candidate.candidate_version_id AND candidate_en.locale='en_US'
    LEFT JOIN game_entity_localizations candidate_ru
        ON candidate_ru.version_id=candidate.candidate_version_id AND candidate_ru.locale='ru_RU'
    LEFT JOIN game_entity_localizations published_en
        ON published_en.version_id=published.id AND published_en.locale='en_US'
    LEFT JOIN game_entity_localizations published_ru
        ON published_ru.version_id=published.id AND published_ru.locale='ru_RU'
    LEFT JOIN item_stat_counts candidate_item_stat_count
        ON candidate_item_stat_count.version_id=candidate.candidate_version_id
    LEFT JOIN item_stat_counts published_item_stat_count
        ON published_item_stat_count.version_id=published.id
    LEFT JOIN item_effect_counts candidate_item_effect_count
        ON candidate_item_effect_count.version_id=candidate.candidate_version_id
    LEFT JOIN item_effect_counts published_item_effect_count
        ON published_item_effect_count.version_id=published.id
    LEFT JOIN item_acquisition_counts candidate_item_acquisition_count
        ON candidate_item_acquisition_count.version_id=candidate.candidate_version_id
    LEFT JOIN item_acquisition_counts published_item_acquisition_count
        ON published_item_acquisition_count.version_id=published.id
    LEFT JOIN spell_effect_counts candidate_spell_effect_count
        ON candidate_spell_effect_count.spell_version_id=candidate.candidate_version_id
    LEFT JOIN spell_effect_counts published_spell_effect_count
        ON published_spell_effect_count.spell_version_id=published.id
    LEFT JOIN spell_fact_counts candidate_spell_fact_count
        ON candidate_spell_fact_count.version_id=candidate.candidate_version_id
    LEFT JOIN spell_fact_counts published_spell_fact_count
        ON published_spell_fact_count.version_id=published.id
    LEFT JOIN item_tooltip_counts candidate_item_tooltip_count
        ON candidate_item_tooltip_count.version_id=candidate.candidate_version_id
    LEFT JOIN item_tooltip_counts published_item_tooltip_count
        ON published_item_tooltip_count.version_id=published.id
    LEFT JOIN entity_tooltip_counts candidate_entity_tooltip_count
        ON candidate_entity_tooltip_count.version_id=candidate.candidate_version_id
    LEFT JOIN entity_tooltip_counts published_entity_tooltip_count
        ON published_entity_tooltip_count.version_id=published.id
),
checks AS (
    SELECT 'candidate_snapshots'::TEXT AS check_key,
        CASE WHEN snapshot_status.snapshot_count=0
            OR snapshot_status.invalid_snapshot_count<>0 THEN 1 ELSE 0 END::BIGINT AS failed_count,
        TRUE AS blocking,
        jsonb_build_object('snapshots',snapshot_status.snapshot_count,
            'invalid_snapshots',snapshot_status.invalid_snapshot_count) AS details
    FROM snapshot_status
    UNION ALL
    SELECT 'candidate_versions',
        CASE WHEN count(*)=0 THEN 1 ELSE 0 END::BIGINT,TRUE,
        jsonb_build_object('selected_candidates',count(candidate.candidate_version_id))
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'candidate_english_names',
        count(*) FILTER (WHERE candidate.candidate_en_name=''),TRUE,
        jsonb_build_object('scope','selected entity versions')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'russian_name_regression',
        count(*) FILTER (WHERE candidate.published_version IS NOT NULL
            AND candidate.published_ru_name<>'' AND candidate.candidate_ru_name=''),TRUE,
        jsonb_build_object('scope','published Russian names retained by candidate')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'description_regression',
        count(*) FILTER (WHERE candidate.published_version IS NOT NULL AND (
            candidate.published_en_description<>'' AND candidate.candidate_en_description=''
            OR candidate.published_ru_description<>'' AND candidate.candidate_ru_description='')),
        TRUE,jsonb_build_object('scope','published descriptions retained by candidate')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'item_registry_regression',
        count(*) FILTER (WHERE candidate.entity_type='item'
            AND candidate.published_version IS NOT NULL
            AND EXISTS (SELECT 1 FROM catalog_items old_item WHERE old_item.version_id=candidate.published_version)
            AND NOT EXISTS (SELECT 1 FROM catalog_items new_item WHERE new_item.version_id=candidate.candidate_version_id)),
        TRUE,jsonb_build_object('scope','catalog_items rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'item_stats_regression',
        count(*) FILTER (WHERE candidate.entity_type='item'
            AND candidate.published_version IS NOT NULL
            AND candidate.candidate_item_stats<candidate.published_item_stats),
        TRUE,jsonb_build_object('scope','catalog_item_stats rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'item_effects_regression',
        count(*) FILTER (WHERE candidate.entity_type='item'
            AND candidate.published_version IS NOT NULL
            AND candidate.candidate_item_effects<candidate.published_item_effects),
        TRUE,jsonb_build_object('scope','catalog_item_effects rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'item_acquisition_regression',
        count(*) FILTER (WHERE candidate.entity_type='item'
            AND candidate.published_version IS NOT NULL
            AND candidate.candidate_item_acquisition<candidate.published_item_acquisition),
        TRUE,jsonb_build_object('scope','catalog_item_acquisition_sources rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'spell_registry_regression',
        count(*) FILTER (WHERE candidate.entity_type IN ('spell','talent','pvp_talent')
            AND candidate.published_version IS NOT NULL
            AND candidate.candidate_spell_facts<candidate.published_spell_facts),
        TRUE,jsonb_build_object('scope','catalog_spells rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'spell_effects_regression',
        count(*) FILTER (WHERE candidate.entity_type IN ('spell','talent','pvp_talent')
            AND candidate.published_version IS NOT NULL
            AND candidate.candidate_spell_effects<candidate.published_spell_effects),
        TRUE,jsonb_build_object('scope','catalog_spell_effects rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'item_tooltip_regression',
        count(*) FILTER (WHERE candidate.entity_type='item'
            AND candidate.published_version IS NOT NULL
            AND candidate.candidate_item_tooltips<candidate.published_item_tooltips),
        TRUE,jsonb_build_object('scope','catalog_item_tooltips rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'entity_tooltip_regression',
        count(*) FILTER (WHERE candidate.published_version IS NOT NULL
            AND candidate.candidate_entity_tooltips<candidate.published_entity_tooltips),
        TRUE,jsonb_build_object('scope','catalog_entity_tooltips rows')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'release_build_regression',
        count(*) FILTER (WHERE release_record.build_number IS NULL
            OR release_record.previous_build_number IS NOT NULL
            AND release_record.build_number<=release_record.previous_build_number),
        TRUE,jsonb_build_object('build_number',max(release_record.build_number),
            'previous_build_number',max(release_record.previous_build_number))
    FROM release_context release_record
    UNION ALL
    SELECT 'missing_russian_names',
        count(*) FILTER (WHERE candidate.candidate_ru_name=''),FALSE,
        jsonb_build_object('scope','selected entity versions; warning until source supplies Russian text')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'missing_descriptions',
        count(*) FILTER (WHERE candidate.candidate_en_description=''
            OR candidate.candidate_ru_description=''),FALSE,
        jsonb_build_object('scope','selected entity versions; warning when source has no description')
    FROM candidate_metrics candidate
    UNION ALL
    SELECT 'missing_cached_media',
        count(*) FILTER (WHERE candidate.entity_type IN ('item','spell','currency','mount','battle_pet','achievement')
            AND NOT candidate.has_cached_media),FALSE,
        jsonb_build_object('scope','selected entity versions; cache is filled by the media worker')
    FROM candidate_metrics candidate
)
SELECT check_key,failed_count,blocking,details
FROM checks
WHERE failed_count<>0 OR check_key IN ('candidate_snapshots','candidate_versions');
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS catalog_release_quality_gate(UUID);
