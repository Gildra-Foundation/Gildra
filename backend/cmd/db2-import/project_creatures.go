package main

import (
	"context"
	"fmt"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func projectCreatures(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_creatures ON COMMIT DROP AS
			SELECT creature.row_id AS external_id,creature.payload AS db2_en,
				COALESCE(creature_ru.payload,creature.payload) AS db2_ru,creature.content_hash,creature.source_url,creature.source_artifact_id
			FROM catalog_db2_rows creature
			LEFT JOIN catalog_db2_rows creature_ru ON creature_ru.build_id=creature.build_id
				AND creature_ru.table_name='Creature' AND creature_ru.locale='ru_RU' AND creature_ru.row_id=creature.row_id
			WHERE creature.build_id=$1 AND creature.table_name='Creature' AND creature.locale='en_US'
			  AND NULLIF(BTRIM(creature.payload->>'Name_lang'),'') IS NOT NULL;
			CREATE UNIQUE INDEX projected_creatures_id_idx ON projected_creatures(external_id)`, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("stage creatures: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'creature',external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'Name_lang','[^[:alnum:]]+','-','g'))),''),'creature-'||external_id),$3,$3
			FROM projected_creatures
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`,
			ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert creature entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.db2_en,p.source_url,$3,p.source_artifact_id
			FROM projected_creatures p JOIN game_entities e ON e.product_id=$1 AND e.entity_type='creature' AND e.external_id=p.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`,
			ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("version creatures: %w", err)
		}
		projected += command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_creature_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_creatures p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='creature' AND e.external_id=p.external_id
			JOIN game_entity_versions v ON v.entity_id=e.id AND v.build_id=$2 AND v.content_hash=p.content_hash;
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_en->>'Name_lang','[^[:alnum:]]+','-','g'))),''),'creature-'||external_id),
				db2_en->>'Name_lang',COALESCE(db2_en->>'Title_lang',''),db2_en FROM projected_creature_versions
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(db2_ru->>'Name_lang','[^[:alnum:]]+','-','g'))),''),'creature-'||external_id),
				COALESCE(NULLIF(db2_ru->>'Name_lang',''),db2_en->>'Name_lang'),COALESCE(NULLIF(db2_ru->>'Title_lang',''),db2_en->>'Title_lang',''),db2_ru
			FROM projected_creature_versions
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes;
			INSERT INTO catalog_creatures(version_id,classification_id,creature_type_id,creature_family_id,start_animation_state_id)
			SELECT version_id,COALESCE(NULLIF(db2_en->>'Classification','')::int,0),COALESCE(NULLIF(db2_en->>'CreatureType','')::int,0),
				COALESCE(NULLIF(db2_en->>'CreatureFamily','')::int,0),COALESCE(NULLIF(db2_en->>'StartAnimState','')::int,0)
			FROM projected_creature_versions ON CONFLICT(version_id) DO UPDATE SET classification_id=EXCLUDED.classification_id,
				creature_type_id=EXCLUDED.creature_type_id,creature_family_id=EXCLUDED.creature_family_id,start_animation_state_id=EXCLUDED.start_animation_state_id;
			INSERT INTO catalog_creature_displays(version_id,slot,display_external_id,probability,source_artifact_id)
			SELECT version_id,slot.slot,(db2_en->>format('DisplayID_%s',slot.slot))::int,
				GREATEST(0,LEAST(1,COALESCE(NULLIF(db2_en->>format('DisplayProbability_%s',slot.slot),'')::real,0))),
				source_artifact_id
			FROM projected_creature_versions CROSS JOIN generate_series(0,3) AS slot(slot)
			WHERE COALESCE(NULLIF(db2_en->>format('DisplayID_%s',slot.slot),'')::int,0)>0
			ON CONFLICT(version_id,slot) DO UPDATE SET display_external_id=EXCLUDED.display_external_id,
				probability=EXCLUDED.probability,source_artifact_id=EXCLUDED.source_artifact_id;
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_creature_versions p
			WHERE e.id=p.entity_id
			  AND COALESCE((SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$2)`, pgx.QueryExecModeSimpleProtocol, ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("project creatures: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_creature_display_info(build_id,external_id,model_external_id,portrait_file_data_id,texture_file_data_id,scale,alpha,gender,flags,source_artifact_id)
			SELECT row.build_id,row.row_id,COALESCE(NULLIF(row.payload->>'ModelID','')::int,0),
				NULLIF(COALESCE(NULLIF(row.payload->>'PortraitTextureFileDataID','')::bigint,0),0),
				NULLIF(COALESCE(NULLIF(row.payload->>'TextureVariationFileDataID_0','')::bigint,0),0),
				GREATEST(COALESCE(NULLIF(row.payload->>'CreatureModelScale','')::real,1),0.0001),
				GREATEST(0,LEAST(255,COALESCE(NULLIF(row.payload->>'CreatureModelAlpha','')::int,255))),NULLIF(row.payload->>'Gender','')::smallint,
				COALESCE(NULLIF(row.payload->>'Flags','')::bigint,0),row.source_artifact_id
			FROM catalog_db2_rows row WHERE row.build_id=$1 AND row.table_name='CreatureDisplayInfo' AND row.locale='en_US'
			  AND COALESCE(NULLIF(row.payload->>'ModelID','')::int,0)>0
			ON CONFLICT(build_id,external_id) DO UPDATE SET model_external_id=EXCLUDED.model_external_id,portrait_file_data_id=EXCLUDED.portrait_file_data_id,
				texture_file_data_id=EXCLUDED.texture_file_data_id,scale=EXCLUDED.scale,alpha=EXCLUDED.alpha,gender=EXCLUDED.gender,flags=EXCLUDED.flags,
				source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_creature_models(build_id,external_id,file_data_id,flags,walk_speed,run_speed,collision_width,collision_height,model_scale,source_artifact_id)
			SELECT row.build_id,row.row_id,(row.payload->>'FileDataID')::bigint,COALESCE(NULLIF(row.payload->>'Flags','')::bigint,0),
				NULLIF(row.payload->>'WalkSpeed','')::real,NULLIF(row.payload->>'RunSpeed','')::real,NULLIF(row.payload->>'CollisionWidth','')::real,
				NULLIF(row.payload->>'CollisionHeight','')::real,NULLIF(row.payload->>'ModelScale','')::real,row.source_artifact_id
			FROM catalog_db2_rows row WHERE row.build_id=$1 AND row.table_name='CreatureModelData' AND row.locale='en_US'
			  AND COALESCE(NULLIF(row.payload->>'FileDataID','')::bigint,0)>0
			ON CONFLICT(build_id,external_id) DO UPDATE SET file_data_id=EXCLUDED.file_data_id,flags=EXCLUDED.flags,walk_speed=EXCLUDED.walk_speed,
				run_speed=EXCLUDED.run_speed,collision_width=EXCLUDED.collision_width,collision_height=EXCLUDED.collision_height,
				model_scale=EXCLUDED.model_scale,source_artifact_id=EXCLUDED.source_artifact_id`,
			pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project creature display data: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_creature_taxa(build_id,taxon_type,external_id,icon_file_data_id,attributes,source_artifact_id)
			SELECT build_id,'type',row_id,NULL,payload,source_artifact_id FROM catalog_db2_rows WHERE build_id=$1 AND table_name='CreatureType' AND locale='en_US'
			UNION ALL
			SELECT build_id,'family',row_id,NULLIF(COALESCE(NULLIF(payload->>'IconFileID','')::bigint,0),0),payload,source_artifact_id FROM catalog_db2_rows
			WHERE build_id=$1 AND table_name='CreatureFamily' AND locale='en_US'
			ON CONFLICT(build_id,taxon_type,external_id) DO UPDATE SET icon_file_data_id=EXCLUDED.icon_file_data_id,
				attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id;
			INSERT INTO catalog_creature_taxon_localizations(build_id,taxon_type,external_id,locale,name)
			SELECT build_id,CASE table_name WHEN 'CreatureType' THEN 'type' ELSE 'family' END,row_id,locale,payload->>'Name_lang'
			FROM catalog_db2_rows WHERE build_id=$1 AND table_name IN ('CreatureType','CreatureFamily') AND locale IN ('en_US','ru_RU')
			  AND NULLIF(BTRIM(payload->>'Name_lang'),'') IS NOT NULL
			ON CONFLICT(build_id,taxon_type,external_id,locale) DO UPDATE SET name=EXCLUDED.name;
			INSERT INTO catalog_creature_difficulties(version_id,difficulty_row_id,faction_template_id,content_tuning_id,flags,source_artifact_id)
			SELECT creature.latest_version_id,row.row_id,COALESCE(NULLIF(row.payload->>'FactionTemplateID','')::int,0),
				COALESCE(NULLIF(row.payload->>'ContentTuningID','')::int,0),row.payload,row.source_artifact_id
			FROM catalog_db2_rows row JOIN game_entities creature ON creature.product_id=$2 AND creature.entity_type='creature'
			  AND creature.external_id=(row.payload->>'CreatureID')::bigint
			WHERE row.build_id=$1 AND row.table_name='CreatureDifficulty' AND row.locale='en_US'
			ON CONFLICT(version_id,difficulty_row_id) DO UPDATE SET faction_template_id=EXCLUDED.faction_template_id,
				content_tuning_id=EXCLUDED.content_tuning_id,flags=EXCLUDED.flags,
				source_artifact_id=EXCLUDED.source_artifact_id`, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID); err != nil {
			return fmt.Errorf("project creature taxonomy: %w", err)
		}
		return nil
	})
	return projected, err
}
