package catalogtaxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// RebuildIcons refreshes the canonical entity icon projection without running
// the substantially more expensive taxonomy and tooltip rebuilds.
func (i *Indexer) RebuildIcons(ctx context.Context) (Result, error) {
	var result Result
	err := pgx.BeginFunc(ctx, i.db, func(tx pgx.Tx) error {
		var err error
		result.Icons, err = rebuildEntityIcons(ctx, tx)
		return err
	})
	return result, err
}

func rebuildEntityIcons(ctx context.Context, tx pgx.Tx) (int64, error) {
	written, err := carryForwardOfficialIcons(ctx, tx)
	if err != nil {
		return 0, err
	}
	command, err := tx.Exec(ctx, `
		WITH spell_icons AS MATERIALIZED (
			SELECT DISTINCT ON (raw.build_id,(raw.payload->>'SpellID')::bigint)
				raw.build_id,(raw.payload->>'SpellID')::bigint AS spell_id,
				NULLIF(raw.payload->>'SpellIconFileDataID','')::bigint AS file_data_id,
				raw.source_artifact_id
			FROM catalog_db2_rows raw
			WHERE raw.table_name='SpellMisc' AND raw.locale='en_US'
			  AND raw.payload->>'SpellID' ~ '^[1-9][0-9]*$'
			  AND raw.payload->>'SpellIconFileDataID' ~ '^[1-9][0-9]*$'
			ORDER BY raw.build_id,(raw.payload->>'SpellID')::bigint,
				COALESCE(NULLIF(raw.payload->>'DifficultyID','')::int,0),raw.row_id
		), item_icons AS MATERIALIZED (
			SELECT raw.build_id,raw.row_id AS item_id,
				NULLIF(raw.payload->>'IconFileDataID','')::bigint AS file_data_id,
				raw.source_artifact_id
			FROM catalog_db2_rows raw
			WHERE raw.table_name='Item' AND raw.locale='en_US'
			  AND raw.payload->>'IconFileDataID' ~ '^[1-9][0-9]*$'
		), creature_icons AS MATERIALIZED (
			SELECT DISTINCT ON (version.build_id,entity.external_id)
				version.build_id,entity.external_id,info.portrait_file_data_id AS file_data_id,
				COALESCE(raw_info.source_artifact_id,version.source_artifact_id) AS source_artifact_id
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			JOIN catalog_creature_displays display ON display.version_id=version.id
			JOIN catalog_creature_display_info info ON info.build_id=version.build_id
				AND info.external_id=display.display_external_id
			LEFT JOIN catalog_db2_rows raw_info ON raw_info.build_id=version.build_id
				AND raw_info.table_name='CreatureDisplayInfo' AND raw_info.locale='en_US'
				AND raw_info.row_id=info.external_id
			WHERE entity.entity_type='creature' AND entity.deleted_at IS NULL
			  AND info.portrait_file_data_id IS NOT NULL
			ORDER BY version.build_id,entity.external_id,display.probability DESC,display.slot,info.external_id
		), talent_spell_icons AS MATERIALIZED (
			-- Talents imported from Battle.net carry no icon of their own; the
			-- icon of the spell they grant is the official one (DB2 SpellMisc).
			SELECT DISTINCT ON (talent.id)
				talent.id AS talent_id,spell_icon.icon_name,spell_icon.file_data_id,
				spell_icon.source_artifact_id,spell_icon.asset_source_artifact_id
			FROM game_entities talent
			JOIN game_entity_versions talent_version ON talent_version.id=talent.latest_version_id
			JOIN catalog_entity_icons spell_icon ON spell_icon.build_id=talent_version.build_id
				AND spell_icon.entity_type='spell'
				AND spell_icon.external_id=CASE
					WHEN talent_version.payload #>> '{raidbots,spellId}' ~ '^[1-9][0-9]*$'
						THEN (talent_version.payload #>> '{raidbots,spellId}')::bigint
					WHEN talent_version.payload #>> '{spell,id}' ~ '^[1-9][0-9]*$'
						THEN (talent_version.payload #>> '{spell,id}')::bigint
				END
			WHERE talent.entity_type IN ('talent','pvp_talent') AND talent.deleted_at IS NULL
			  AND NULLIF(BTRIM(talent_version.payload #>> '{raidbots,icon}'),'') IS NULL
			  AND NULLIF(BTRIM(talent_version.payload #>> '{raidbots,spellIcon}'),'') IS NULL
			ORDER BY talent.id,spell_icon.file_data_id NULLS LAST
		), candidates AS MATERIALIZED (
			SELECT entity.id,entity.entity_type,entity.external_id,version.build_id,
				COALESCE(item.source_artifact_id,
					CASE WHEN direct.file_data_id IS NOT NULL THEN direct_proof.source_artifact_id END,
					spell.source_artifact_id,creature.source_artifact_id,talent_icon.source_artifact_id,
					-- Raidbots-only entities (talents, gems, consumables) carry no
					-- DB2 icon row: prefer a proven artifact observed for the
					-- version (a re-import records the new proof against the
					-- unchanged version) over the version's original artifact.
					direct_proof.source_artifact_id,version.source_artifact_id) AS source_artifact_id,
				COALESCE(direct.file_data_id,item.file_data_id,spell.file_data_id,creature.file_data_id,talent_icon.file_data_id) AS file_data_id,
				COALESCE(NULLIF(BTRIM(version.payload #>> '{raidbots,icon}'),''),talent_icon.icon_name) AS raidbots_icon,
				NULLIF(BTRIM(version.payload #>> '{raidbots,spellIcon}'),'') AS raidbots_spell_icon
			FROM game_entities entity
			JOIN game_entity_versions version ON version.id=entity.latest_version_id
			LEFT JOIN talent_spell_icons talent_icon ON talent_icon.talent_id=entity.id
			LEFT JOIN catalog_source_artifacts version_artifact ON version_artifact.id=version.source_artifact_id
			LEFT JOIN LATERAL (
				SELECT artifact.id AS source_artifact_id
				FROM catalog_entity_version_artifacts observation
				JOIN catalog_source_artifacts artifact ON artifact.id=observation.source_artifact_id
				WHERE observation.version_id=version.id AND artifact.status='ready'
				  AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
				ORDER BY (artifact.artifact_key=version_artifact.artifact_key) DESC,
					(artifact.locale=version_artifact.locale) DESC,artifact.fetched_at DESC
				LIMIT 1
			) observed_proof ON true
			CROSS JOIN LATERAL (
				SELECT CASE
					WHEN version_artifact.status='ready' AND version_artifact.content_hash IS NOT NULL
						AND version_artifact.byte_size IS NOT NULL THEN version_artifact.id
					ELSE observed_proof.source_artifact_id
				END AS source_artifact_id
			) direct_proof
			CROSS JOIN LATERAL (SELECT CASE
				WHEN COALESCE(NULLIF(version.payload->>'icon_file_data_id',''),
					NULLIF(version.payload->>'InventoryIconFileID',''),NULLIF(version.payload->>'IconFileID',''),
					NULLIF(version.payload->>'IconFileDataID',''),NULLIF(version.payload->>'SpellIconFileID',''),
					NULLIF(version.payload #>> '{db2,InventoryIconFileID}',''),NULLIF(version.payload #>> '{db2,IconFileID}',''),
					NULLIF(version.payload #>> '{db2,IconFileDataID}',''),NULLIF(version.payload #>> '{db2,SpellIconFileID}','')) ~ '^[1-9][0-9]*$'
				THEN COALESCE(NULLIF(version.payload->>'icon_file_data_id',''),
					NULLIF(version.payload->>'InventoryIconFileID',''),NULLIF(version.payload->>'IconFileID',''),
					NULLIF(version.payload->>'IconFileDataID',''),NULLIF(version.payload->>'SpellIconFileID',''),
					NULLIF(version.payload #>> '{db2,InventoryIconFileID}',''),NULLIF(version.payload #>> '{db2,IconFileID}',''),
					NULLIF(version.payload #>> '{db2,IconFileDataID}',''),NULLIF(version.payload #>> '{db2,SpellIconFileID}',''))::bigint END AS file_data_id) direct
			LEFT JOIN spell_icons spell ON entity.entity_type='spell' AND spell.build_id=version.build_id
				AND spell.spell_id=entity.external_id
			LEFT JOIN item_icons item ON entity.entity_type='item' AND item.build_id=version.build_id
				AND item.item_id=entity.external_id
			LEFT JOIN creature_icons creature ON entity.entity_type='creature' AND creature.build_id=version.build_id
				AND creature.external_id=entity.external_id
			WHERE entity.deleted_at IS NULL
		), resolved AS MATERIALIZED (
			SELECT candidates.*,asset.icon_name AS file_icon,
				asset.source_artifact_id AS asset_source_artifact_id
			FROM candidates
			LEFT JOIN catalog_file_assets asset ON asset.file_data_id=candidates.file_data_id
		)
		INSERT INTO catalog_entity_icons(
			build_id,entity_type,external_id,icon_name,file_data_id,source_artifact_id,asset_source_artifact_id)
		SELECT build_id,entity_type,external_id,
			COALESCE(file_icon,raidbots_icon,raidbots_spell_icon,
				CASE WHEN file_data_id IS NOT NULL THEN file_data_id::text END),
			CASE WHEN file_icon IS NOT NULL THEN file_data_id END,source_artifact_id,
			CASE WHEN file_icon IS NOT NULL THEN asset_source_artifact_id END
		FROM resolved
		WHERE COALESCE(file_icon,raidbots_icon,raidbots_spell_icon,file_data_id::text) IS NOT NULL
		  -- An icon must cite complete source proof; a version whose only
		  -- artifact failed (for example an aborted Battle.net fetch) gets no
		  -- icon row instead of one that fails the readiness audit.
		  AND EXISTS (
			SELECT 1 FROM catalog_source_artifacts proof
			WHERE proof.id=resolved.source_artifact_id AND proof.status='ready'
			  AND proof.content_hash IS NOT NULL AND proof.byte_size IS NOT NULL
		  )
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,file_data_id=EXCLUDED.file_data_id,
			source_artifact_id=EXCLUDED.source_artifact_id,
			asset_source_artifact_id=EXCLUDED.asset_source_artifact_id
		WHERE NOT EXISTS (
			SELECT 1 FROM catalog_source_artifacts official
			WHERE official.id=catalog_entity_icons.source_artifact_id
			  AND official.source='blizzard_api'
			  AND official.status='ready'
			  AND official.content_hash IS NOT NULL
			  AND official.byte_size IS NOT NULL
		)`)
	if err != nil {
		return 0, fmt.Errorf("rebuild direct entity icons: %w", err)
	}
	written += command.RowsAffected()

	command, err = tx.Exec(ctx, `
		WITH icon_refs(entity_type,payload_key,target_type) AS (VALUES
			('mount'::text,'SourceSpellID'::text,'spell'::text),
			('toy'::text,'ItemID'::text,'item'::text),
			('talent'::text,'SpellID'::text,'spell'::text),
			('pvp_talent'::text,'SpellID'::text,'spell'::text),
			('recipe'::text,'SpellID'::text,'spell'::text)
		)
		INSERT INTO catalog_entity_icons(
			build_id,entity_type,external_id,icon_name,file_data_id,source_artifact_id,asset_source_artifact_id)
		SELECT version.build_id,entity.entity_type,entity.external_id,target_icon.icon_name,
			target_icon.file_data_id,target_icon.source_artifact_id,target_icon.asset_source_artifact_id
		FROM game_entities entity
		JOIN game_entity_versions version ON version.id=entity.latest_version_id
		JOIN icon_refs reference ON reference.entity_type=entity.entity_type
		JOIN game_entities target ON target.product_id=entity.product_id AND target.entity_type=reference.target_type
			AND target.external_id=CASE WHEN version.payload #>> ARRAY['db2',reference.payload_key] ~ '^[1-9][0-9]*$'
				THEN (version.payload #>> ARRAY['db2',reference.payload_key])::bigint END AND target.deleted_at IS NULL
		JOIN game_entity_versions target_version ON target_version.id=target.latest_version_id AND target_version.build_id=version.build_id
		JOIN catalog_entity_icons target_icon ON target_icon.build_id=target_version.build_id
			AND target_icon.entity_type=target.entity_type AND target_icon.external_id=target.external_id
		WHERE entity.deleted_at IS NULL
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,file_data_id=EXCLUDED.file_data_id,
			source_artifact_id=EXCLUDED.source_artifact_id,
			asset_source_artifact_id=EXCLUDED.asset_source_artifact_id`)
	if err != nil {
		return 0, fmt.Errorf("rebuild referenced entity icons: %w", err)
	}
	return written + command.RowsAffected(), nil
}

func carryForwardOfficialIcons(ctx context.Context, tx pgx.Tx) (int64, error) {
	command, err := tx.Exec(ctx, `
		WITH candidates AS (
			SELECT DISTINCT ON (target_version.build_id,entity.entity_type,entity.external_id)
				target_version.build_id,entity.entity_type,entity.external_id,
				source_icon.icon_name,source_icon.file_data_id,source_icon.source_artifact_id,
				source_icon.asset_source_artifact_id,source_build.build_number
			FROM game_entities entity
			JOIN game_entity_versions target_version ON target_version.id=entity.latest_version_id
			JOIN game_builds target_build ON target_build.id=target_version.build_id
			JOIN catalog_entity_icons source_icon ON source_icon.entity_type=entity.entity_type
				AND source_icon.external_id=entity.external_id
			JOIN game_builds source_build ON source_build.id=source_icon.build_id
			JOIN catalog_source_artifacts artifact ON artifact.id=source_icon.source_artifact_id
			WHERE entity.deleted_at IS NULL AND artifact.source='blizzard_api'
			  -- Carry only icons whose artifact carries complete proof; an
			  -- aborted Battle.net fetch must not propagate to newer builds.
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL AND artifact.byte_size IS NOT NULL
			  AND source_build.product_id=entity.product_id
			  AND source_build.build_number<=target_build.build_number
			ORDER BY target_version.build_id,entity.entity_type,entity.external_id,source_build.build_number DESC
		)
		INSERT INTO catalog_entity_icons(
			build_id,entity_type,external_id,icon_name,file_data_id,source_artifact_id,asset_source_artifact_id)
		SELECT build_id,entity_type,external_id,icon_name,file_data_id,source_artifact_id,
			asset_source_artifact_id FROM candidates
		ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
			icon_name=EXCLUDED.icon_name,file_data_id=EXCLUDED.file_data_id,
			source_artifact_id=EXCLUDED.source_artifact_id,
			asset_source_artifact_id=EXCLUDED.asset_source_artifact_id`)
	if err != nil {
		return 0, fmt.Errorf("carry official icons to active build: %w", err)
	}
	return command.RowsAffected(), nil
}
