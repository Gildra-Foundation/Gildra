package main

import (
	"context"
	"fmt"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func projectQuests(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		command, err := tx.Exec(ctx, `
			INSERT INTO catalog_quest_registry(build_id,quest_id,unique_bit_flag,ui_details_theme_id,has_client_task,enrichment_status)
			SELECT $1,quest_id,MAX(unique_bit_flag),NULLIF(MAX(theme_id),0),BOOL_OR(has_task),
				CASE WHEN BOOL_OR(has_task) THEN 'client_task' ELSE 'registry_only' END
			FROM (
				SELECT row_id AS quest_id,COALESCE(NULLIF(payload->>'UniqueBitFlag','')::bigint,0) AS unique_bit_flag,
					COALESCE(NULLIF(payload->>'UiQuestDetailsThemeID','')::int,0) AS theme_id,false AS has_task
				FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestV2' AND locale='en_US'
				UNION ALL SELECT row_id,COALESCE(NULLIF(payload->>'UniqueBitFlag','')::bigint,0),0,true
				FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestV2CliTask' AND locale='en_US'
				UNION ALL SELECT (payload->>'QuestID')::bigint,0,0,false FROM catalog_db2_rows
				WHERE build_id=$1 AND table_name IN ('QuestObjective','QuestLineXQuest','QuestPOIBlob') AND locale='en_US'
				  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
			) quests GROUP BY quest_id
			ON CONFLICT(build_id,quest_id) DO UPDATE SET unique_bit_flag=EXCLUDED.unique_bit_flag,
				ui_details_theme_id=EXCLUDED.ui_details_theme_id,has_client_task=EXCLUDED.has_client_task,
				enrichment_status=CASE WHEN catalog_quest_registry.enrichment_status='blizzard_api' THEN 'blizzard_api' ELSE EXCLUDED.enrichment_status END`,
			ic.BuildID)
		if err != nil {
			return fmt.Errorf("project quest registry: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, questDetailsProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID); err != nil {
			return fmt.Errorf("project quest details: %w", err)
		}
		if _, err := tx.Exec(ctx, questEntitiesProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID, ic.NamespaceID, ic.SnapshotID); err != nil {
			return fmt.Errorf("project named quest entities: %w", err)
		}
		if _, err := tx.Exec(ctx, questPackageEntitiesProjectionSQL, pgx.QueryExecModeSimpleProtocol,
			ic.BuildID, ic.ProductID, ic.NamespaceID); err != nil {
			return fmt.Errorf("project quest reward package entities: %w", err)
		}
		return nil
	})
	return projected, err
}

const questDetailsProjectionSQL = `
	INSERT INTO catalog_quest_localizations(build_id,quest_id,locale,title,bullet_text,source)
	SELECT build_id,row_id,locale,COALESCE(payload->>'QuestTitle_lang',''),COALESCE(payload->>'BulletText_lang',''),'db2_client_task'
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='QuestV2CliTask' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'QuestTitle_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,quest_id,locale) DO UPDATE SET title=EXCLUDED.title,bullet_text=EXCLUDED.bullet_text,
		source=CASE WHEN catalog_quest_localizations.source='blizzard_api' THEN 'blizzard_api' ELSE EXCLUDED.source END;

	INSERT INTO catalog_quest_details(build_id,quest_id,quest_info_id,content_tuning_id,covenant_id,start_item_id,
		breadcrumb_quest_id,condition_id,world_state_expression_id,class_mask,race_mask_0,race_mask_1,flags)
	SELECT build_id,row_id,NULLIF(COALESCE(NULLIF(payload->>'QuestInfoID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'ContentTuningID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'CovenantID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'StartItem','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'BreadCrumbID','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'ConditionID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'WorldStateExpressionID','')::int,0),0),
		COALESCE(NULLIF(payload->>'FiltClasses','')::bigint,0),
		COALESCE(NULLIF(payload->>'FiltRaceMasks_0','')::bigint,0),COALESCE(NULLIF(payload->>'FiltRaceMasks_1','')::bigint,0),payload
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestV2CliTask' AND locale='en_US'
	ON CONFLICT(build_id,quest_id) DO UPDATE SET quest_info_id=EXCLUDED.quest_info_id,
		content_tuning_id=EXCLUDED.content_tuning_id,covenant_id=EXCLUDED.covenant_id,start_item_id=EXCLUDED.start_item_id,
		breadcrumb_quest_id=EXCLUDED.breadcrumb_quest_id,condition_id=EXCLUDED.condition_id,
		world_state_expression_id=EXCLUDED.world_state_expression_id,class_mask=EXCLUDED.class_mask,
		race_mask_0=EXCLUDED.race_mask_0,race_mask_1=EXCLUDED.race_mask_1,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_objectives(build_id,quest_id,objective_id,objective_type,object_id,amount,order_index,storage_index,flags)
	SELECT build_id,(payload->>'QuestID')::bigint,row_id,COALESCE(NULLIF(payload->>'Type','')::int,0),
		NULLIF(COALESCE(NULLIF(payload->>'ObjectID','')::bigint,0),0),GREATEST(COALESCE(NULLIF(payload->>'Amount','')::int,0),0),
		COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),COALESCE(NULLIF(payload->>'StorageIndex','')::int,0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestObjective' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ON CONFLICT(build_id,quest_id,objective_id) DO UPDATE SET objective_type=EXCLUDED.objective_type,
		object_id=EXCLUDED.object_id,amount=EXCLUDED.amount,order_index=EXCLUDED.order_index,
		storage_index=EXCLUDED.storage_index,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_objective_localizations(build_id,quest_id,objective_id,locale,description)
	SELECT build_id,(payload->>'QuestID')::bigint,row_id,locale,COALESCE(payload->>'Description_lang','')
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestObjective' AND locale IN ('en_US','ru_RU')
	  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ON CONFLICT(build_id,quest_id,objective_id,locale) DO UPDATE SET description=EXCLUDED.description;

	INSERT INTO catalog_quest_lines(build_id,quest_line_id,completion_condition_id,player_condition_id,flags)
	SELECT build_id,row_id,NULLIF(COALESCE(NULLIF(payload->>'CompletionPlayerConditionID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'PlayerConditionID','')::int,0),0),COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestLine' AND locale='en_US'
	ON CONFLICT(build_id,quest_line_id) DO UPDATE SET completion_condition_id=EXCLUDED.completion_condition_id,
		player_condition_id=EXCLUDED.player_condition_id,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_line_localizations(build_id,quest_line_id,locale,name,description)
	SELECT build_id,row_id,locale,payload->>'Name_lang',COALESCE(payload->>'Description_lang','')
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestLine' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'Name_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,quest_line_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

	INSERT INTO catalog_quest_line_entries(build_id,quest_line_id,quest_id,order_index,flags)
	SELECT DISTINCT ON (build_id,(payload->>'QuestLineID')::bigint,(payload->>'QuestID')::bigint)
		build_id,(payload->>'QuestLineID')::bigint,(payload->>'QuestID')::bigint,
		COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestLineXQuest' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'QuestLineID','')::bigint,0)>0 AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ORDER BY build_id,(payload->>'QuestLineID')::bigint,(payload->>'QuestID')::bigint,
		COALESCE(NULLIF(payload->>'OrderIndex','')::int,0),row_id
	ON CONFLICT(build_id,quest_line_id,quest_id) DO UPDATE SET order_index=EXCLUDED.order_index,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_poi_blobs(build_id,quest_id,blob_id,map_id,ui_map_id,objective_id,objective_index,
		player_condition_id,navigation_condition_id,flags)
	SELECT build_id,(payload->>'QuestID')::bigint,row_id,NULLIF(COALESCE(NULLIF(payload->>'MapID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'UiMapID','')::int,0),0),NULLIF(COALESCE(NULLIF(payload->>'ObjectiveID','')::bigint,0),0),
		COALESCE(NULLIF(payload->>'ObjectiveIndex','')::int,0),NULLIF(COALESCE(NULLIF(payload->>'PlayerConditionID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'NavigationPlayerConditionID','')::int,0),0),COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='QuestPOIBlob' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'QuestID','')::bigint,0)>0
	ON CONFLICT(build_id,blob_id) DO UPDATE SET quest_id=EXCLUDED.quest_id,map_id=EXCLUDED.map_id,ui_map_id=EXCLUDED.ui_map_id,
		objective_id=EXCLUDED.objective_id,objective_index=EXCLUDED.objective_index,
		player_condition_id=EXCLUDED.player_condition_id,navigation_condition_id=EXCLUDED.navigation_condition_id,flags=EXCLUDED.flags;

	INSERT INTO catalog_quest_poi_points(build_id,blob_id,point_id,x,y,z)
	SELECT point.build_id,(point.payload->>'QuestPOIBlobID')::bigint,point.row_id,(point.payload->>'X')::double precision,
		(point.payload->>'Y')::double precision,COALESCE(NULLIF(point.payload->>'Z','')::double precision,0)
	FROM catalog_db2_rows point
	JOIN catalog_quest_poi_blobs blob ON blob.build_id=point.build_id AND blob.blob_id=(point.payload->>'QuestPOIBlobID')::bigint
	WHERE point.build_id=$1 AND point.table_name='QuestPOIPoint' AND point.locale='en_US'
	  AND COALESCE(NULLIF(point.payload->>'QuestPOIBlobID','')::bigint,0)>0
	ON CONFLICT(build_id,blob_id,point_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,z=EXCLUDED.z;

	INSERT INTO catalog_quest_package_items(build_id,row_id,package_id,item_external_id,item_entity_id,
		quantity,display_type,source_artifact_id,attributes)
	SELECT package.build_id,package.row_id,(package.payload->>'PackageID')::bigint,
		(package.payload->>'ItemID')::bigint,item.id,(package.payload->>'ItemQuantity')::numeric,
		COALESCE(NULLIF(package.payload->>'DisplayType','')::smallint,0),package.source_artifact_id,package.payload
	FROM catalog_db2_rows package
	JOIN game_builds build ON build.id=package.build_id
	LEFT JOIN game_entities item ON item.product_id=build.product_id AND item.entity_type='item'
		AND item.external_id=(package.payload->>'ItemID')::bigint AND item.deleted_at IS NULL
	WHERE package.build_id=$1 AND package.table_name='QuestPackageItem' AND package.locale='en_US'
	  AND package.payload->>'PackageID' ~ '^[1-9][0-9]*$'
	  AND package.payload->>'ItemID' ~ '^[1-9][0-9]*$'
	  AND package.payload->>'ItemQuantity' ~ '^[1-9][0-9]*(\.[0-9]+)?$'
	ON CONFLICT(build_id,row_id) DO UPDATE SET package_id=EXCLUDED.package_id,
		item_external_id=EXCLUDED.item_external_id,item_entity_id=EXCLUDED.item_entity_id,
		quantity=EXCLUDED.quantity,display_type=EXCLUDED.display_type,
		source_artifact_id=EXCLUDED.source_artifact_id,attributes=EXCLUDED.attributes;`

const questEntitiesProjectionSQL = `
	CREATE TEMP TABLE projected_named_quests ON COMMIT DROP AS
	SELECT task.row_id AS external_id,task.source_url,task.source_artifact_id,
		task_ru.source_artifact_id AS source_artifact_ru_id,task.payload AS db2_en,
		CASE WHEN NULLIF(BTRIM(task_ru.payload->>'QuestTitle_lang'),'') IS NOT NULL
			THEN task_ru.payload ELSE '{}'::jsonb END AS db2_ru,
		task.payload->>'QuestTitle_lang' AS name_en,
		NULLIF(BTRIM(task_ru.payload->>'QuestTitle_lang'),'') AS name_ru,
		COALESCE(task.payload->>'BulletText_lang','') AS description_en,
		COALESCE(NULLIF(task_ru.payload->>'BulletText_lang',''),'') AS description_ru
	FROM catalog_db2_rows task
	LEFT JOIN catalog_db2_rows task_ru ON task_ru.build_id=task.build_id AND task_ru.table_name='QuestV2CliTask'
		AND task_ru.locale='ru_RU' AND task_ru.row_id=task.row_id
	WHERE task.build_id=$1 AND task.table_name='QuestV2CliTask' AND task.locale='en_US'
	  AND NULLIF(BTRIM(task.payload->>'QuestTitle_lang'),'') IS NOT NULL;
	ALTER TABLE projected_named_quests ADD COLUMN payload_en JSONB;
	UPDATE projected_named_quests SET payload_en=jsonb_build_object('id',external_id,'name',name_en,
		'description',description_en,'db2',db2_en);
	ALTER TABLE projected_named_quests ADD COLUMN content_hash BYTEA;
	UPDATE projected_named_quests SET content_hash=digest(convert_to(payload_en::text,'UTF8'),'sha256');
	CREATE UNIQUE INDEX projected_named_quests_id_idx ON projected_named_quests(external_id);

	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
	SELECT $2,$3,'quest',external_id,COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'quest-'||external_id),$1,$1
	FROM projected_named_quests
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,
		projected.content_hash,projected.payload_en,projected.source_url,$4,projected.source_artifact_id
	FROM projected_named_quests projected
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
	WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=projected.content_hash);

	CREATE TEMP TABLE projected_named_quest_versions ON COMMIT DROP AS
	SELECT projected.*,entity.id AS entity_id,version.id AS version_id
	FROM projected_named_quests projected
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
	JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1 AND version.content_hash=projected.content_hash;

	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'quest-'||external_id),
		name_en,description_en,jsonb_build_object('id',external_id,'name',name_en,'description',description_en,'db2',db2_en)
	FROM projected_named_quest_versions
	UNION ALL
	SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_ru,'[^[:alnum:]]+','-','g'))),''),'quest-'||external_id),
		name_ru,description_ru,jsonb_build_object('id',external_id,'name',name_ru,'description',description_ru,'db2',db2_ru)
	FROM projected_named_quest_versions
	WHERE NULLIF(BTRIM(name_ru),'') IS NOT NULL
	ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
		description=EXCLUDED.description,attributes=EXCLUDED.attributes;

	-- Record locale-specific proof.  Never claim an EN artifact proves RU: a
	-- missing RU QuestV2 row remains a raw/review record until a real RU source
	-- is imported.
	INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
	SELECT DISTINCT projected.version_id,'en_US',projected.source_artifact_id
	FROM projected_named_quest_versions projected
	WHERE projected.source_artifact_id IS NOT NULL
	UNION ALL
	SELECT DISTINCT projected.version_id,'ru_RU',projected.source_artifact_ru_id
	FROM projected_named_quest_versions projected
	WHERE projected.source_artifact_ru_id IS NOT NULL
	  AND NULLIF(BTRIM(projected.name_ru),'') IS NOT NULL
	ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING;

	UPDATE game_entities entity SET latest_version_id=projected.version_id,updated_at=now()
	FROM projected_named_quest_versions projected
	WHERE entity.id=projected.entity_id
	  AND COALESCE((SELECT current_build.build_number
		FROM game_entity_versions current_version
		JOIN game_builds current_build ON current_build.id=current_version.build_id
		WHERE current_version.id=entity.latest_version_id),0)
		<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1);

	-- QuestV2 is the authoritative client registry even when the client does
	-- not ship a localized title. Preserve those quests as source-backed
	-- entities instead of hiding them or inventing a name. A later permitted
	-- localization source can attach text to the same stable identity.
	CREATE TEMP TABLE projected_registry_quests ON COMMIT DROP AS
	SELECT registry.quest_id AS external_id,row.source_url,row.source_artifact_id,
		jsonb_build_object(
			'id',registry.quest_id,
			'registry_only',true,
			'enrichment_status',registry.enrichment_status,
			'unique_bit_flag',registry.unique_bit_flag,
			'ui_details_theme_id',registry.ui_details_theme_id,
			'has_client_task',registry.has_client_task,
			'db2',row.payload
		) AS payload
	FROM catalog_quest_registry registry
	JOIN catalog_db2_rows row ON row.build_id=registry.build_id
		AND row.table_name='QuestV2' AND row.locale='en_US' AND row.row_id=registry.quest_id
	LEFT JOIN projected_named_quests named ON named.external_id=registry.quest_id
	WHERE registry.build_id=$1 AND named.external_id IS NULL
		AND row.source_artifact_id IS NOT NULL;
	ALTER TABLE projected_registry_quests ADD COLUMN content_hash BYTEA;
	UPDATE projected_registry_quests SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256');
	CREATE UNIQUE INDEX projected_registry_quests_id_idx ON projected_registry_quests(external_id);

	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
	SELECT $2,$3,'quest',external_id,'quest-'||external_id,$1,$1
	FROM projected_registry_quests
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,
		projected.content_hash,projected.payload,projected.source_url,$4,projected.source_artifact_id
	FROM projected_registry_quests projected
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
	WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=projected.content_hash);

	UPDATE game_entities entity SET latest_version_id=version.id,updated_at=now()
	FROM projected_registry_quests projected,game_entity_versions version
	WHERE entity.product_id=$2 AND entity.entity_type='quest' AND entity.external_id=projected.external_id
		AND version.entity_id=entity.id AND version.build_id=$1 AND version.content_hash=projected.content_hash
		AND COALESCE((SELECT current_build.build_number
			FROM game_entity_versions current_version
			JOIN game_builds current_build ON current_build.id=current_version.build_id
			WHERE current_version.id=entity.latest_version_id),0)
			<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1);`

const questPackageEntitiesProjectionSQL = `
	CREATE TEMP TABLE projected_quest_reward_packages ON COMMIT DROP AS
	SELECT package.package_id AS external_id,
		jsonb_build_object(
			'id',package.package_id,
			'kind','quest_reward_package',
			'items',jsonb_agg(jsonb_build_object(
				'row_id',package.row_id,
				'item_external_id',package.item_external_id,
				'quantity',package.quantity,
				'display_type',package.display_type,
				'source_artifact_id',package.source_artifact_id
			) ORDER BY package.display_type,package.row_id)
		) AS payload,
		(array_agg(artifact.source_url ORDER BY package.row_id))[1] AS source_url,
		(array_agg(package.source_artifact_id ORDER BY package.row_id))[1] AS source_artifact_id,
		(array_agg(artifact.snapshot_id ORDER BY package.row_id))[1] AS snapshot_id
	FROM catalog_quest_package_items package
	JOIN catalog_source_artifacts artifact ON artifact.id=package.source_artifact_id
	WHERE package.build_id=$1
	GROUP BY package.package_id;
	ALTER TABLE projected_quest_reward_packages ADD COLUMN content_hash BYTEA;
	UPDATE projected_quest_reward_packages
	SET content_hash=digest(convert_to(payload::text,'UTF8'),'sha256');
	CREATE UNIQUE INDEX projected_quest_reward_packages_id_idx
	ON projected_quest_reward_packages(external_id);

	INSERT INTO game_entities(
		product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id
	)
	SELECT $2,$3,'quest_reward_package',external_id,'quest-reward-package-'||external_id,$1,$1
	FROM projected_quest_reward_packages
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET
		namespace_id=EXCLUDED.namespace_id,
		last_seen_build_id=EXCLUDED.last_seen_build_id,
		deleted_at=NULL,
		updated_at=now();

	INSERT INTO game_entity_versions(
		entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id
	)
	SELECT entity.id,$1,
		COALESCE((SELECT max(previous.revision) FROM game_entity_versions previous
			WHERE previous.entity_id=entity.id AND previous.build_id=$1),0)+1,
		projected.content_hash,projected.payload,projected.source_url,projected.snapshot_id,projected.source_artifact_id
	FROM projected_quest_reward_packages projected
	JOIN game_entities entity ON entity.product_id=$2
		AND entity.entity_type='quest_reward_package'
		AND entity.external_id=projected.external_id
	WHERE NOT EXISTS (
		SELECT 1 FROM game_entity_versions previous
		WHERE previous.entity_id=entity.id AND previous.build_id=$1
		  AND previous.content_hash=projected.content_hash
	);

	CREATE TEMP TABLE projected_quest_reward_package_versions ON COMMIT DROP AS
	SELECT projected.*,entity.id AS entity_id,version.id AS version_id
	FROM projected_quest_reward_packages projected
	JOIN game_entities entity ON entity.product_id=$2
		AND entity.entity_type='quest_reward_package'
		AND entity.external_id=projected.external_id
	JOIN LATERAL (
		SELECT candidate.id
		FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		  AND candidate.content_hash=projected.content_hash
		ORDER BY candidate.revision DESC
		LIMIT 1
	) version ON true;

	INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
	SELECT DISTINCT projected.version_id,package.source_artifact_id
	FROM projected_quest_reward_package_versions projected
	JOIN catalog_quest_package_items package ON package.build_id=$1
		AND package.package_id=projected.external_id
	WHERE package.source_artifact_id IS NOT NULL
	ON CONFLICT(version_id,source_artifact_id) DO NOTHING;

	-- Packages are client entities but have no localized title column in
	-- QuestPackageItem.  Expose a deterministic, source-backed label instead
	-- of leaving them nameless in the public library.  Russian uses the exact
	-- English fallback until a permitted localized source is available.
	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT projected.version_id,'en_US','quest-reward-package-'||projected.external_id,
		'Quest reward package #'||projected.external_id,'',
		jsonb_build_object('generated_label',true,'source','QuestPackageItem')
	FROM projected_quest_reward_package_versions projected
	UNION ALL
	SELECT projected.version_id,'ru_RU','quest-reward-package-'||projected.external_id,
		'Quest reward package #'||projected.external_id,'',
		jsonb_build_object('generated_label',true,'source','QuestPackageItem','fallback_locale','en_US')
	FROM projected_quest_reward_package_versions projected
	ON CONFLICT(version_id,locale) DO UPDATE SET
		slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,
		attributes=EXCLUDED.attributes;

	INSERT INTO catalog_entity_localization_artifacts(version_id,locale,source_artifact_id)
	SELECT DISTINCT projected.version_id,localized.locale,projected.source_artifact_id
	FROM projected_quest_reward_package_versions projected
	CROSS JOIN (VALUES ('en_US'::text),('ru_RU'::text)) localized(locale)
	WHERE projected.source_artifact_id IS NOT NULL
	ON CONFLICT(version_id,locale,source_artifact_id) DO NOTHING;

	UPDATE game_entities entity
	SET latest_version_id=projected.version_id,updated_at=now()
	FROM projected_quest_reward_package_versions projected
	WHERE entity.id=projected.entity_id
	  AND COALESCE((
		SELECT build.build_number
		FROM game_entity_versions current_version
		JOIN game_builds build ON build.id=current_version.build_id
		WHERE current_version.id=entity.latest_version_id
	  ),0)<=(SELECT build.build_number FROM game_builds build WHERE build.id=$1);`

func projectQuestRewardPackages(
	ctx context.Context,
	db *pgxpool.Pool,
	ic catalogimport.ImportContext,
) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, questPackageEntitiesProjectionSQL, pgx.QueryExecModeSimpleProtocol,
			ic.BuildID, ic.ProductID, ic.NamespaceID); err != nil {
			return fmt.Errorf("project quest reward package entities: %w", err)
		}
		return tx.QueryRow(ctx, `
			SELECT count(*)
			FROM game_entities entity
			JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1
			WHERE entity.product_id=$2 AND entity.entity_type='quest_reward_package'`,
			ic.BuildID, ic.ProductID).Scan(&projected)
	})
	return projected, err
}
