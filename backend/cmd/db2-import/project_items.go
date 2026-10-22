package main

import (
	"context"
	"fmt"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func projectCollectionsForTables(
	ctx context.Context,
	db *pgxpool.Pool,
	ic catalogimport.ImportContext,
	tables []string,
) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_collection_localizations ON COMMIT DROP AS
			WITH definitions(table_name,entity_type,name_field,description_field) AS (VALUES
				('ChrClasses','class','Name_lang','Description_lang'),
				('ChrSpecialization','specialization','Name_lang','Description_lang'),
				('CurrencyTypes','currency','Name_lang','Description_lang'),
				('Mount','mount','Name_lang','Description_lang'),
				('TransmogSet','transmog_set','Name_lang',''),
				('Achievement','achievement','Title_lang','Description_lang'),
				('Map','map','MapName_lang','MapDescription0_lang'),
				('UiMap','ui_map','Name_lang',''),
				('AreaTable','area','AreaName_lang',''),
				('Faction','faction','Name_lang','Description_lang')
			)
			SELECT raw.row_id AS external_id,definition.entity_type,raw.locale,
				raw.payload->>definition.name_field AS name,
				CASE WHEN definition.description_field='' THEN '' ELSE COALESCE(raw.payload->>definition.description_field,'') END AS description,
				raw.payload AS db2,raw.content_hash,raw.source_url,raw.source_artifact_id
			FROM catalog_db2_rows raw JOIN definitions definition ON definition.table_name=raw.table_name
			WHERE raw.build_id=$1 AND raw.locale IN ('en_US','ru_RU')
			  AND (COALESCE(cardinality($2::text[]),0)=0 OR raw.table_name=ANY($2::text[]))
			  AND NULLIF(BTRIM(raw.payload->>definition.name_field),'') IS NOT NULL
			UNION ALL
			SELECT toy.row_id,'toy',toy.locale,item.payload->>'Display_lang','',
				toy.payload||jsonb_build_object('item',item.payload),toy.content_hash,toy.source_url,toy.source_artifact_id
			FROM catalog_db2_rows toy JOIN catalog_db2_rows item ON item.build_id=toy.build_id
				AND item.table_name='ItemSparse' AND item.locale=toy.locale AND item.row_id=(toy.payload->>'ItemID')::bigint
			WHERE toy.build_id=$1 AND toy.table_name='Toy' AND toy.locale IN ('en_US','ru_RU')
			  AND (COALESCE(cardinality($2::text[]),0)=0 OR toy.table_name=ANY($2::text[]))
			  AND NULLIF(BTRIM(item.payload->>'Display_lang'),'') IS NOT NULL
			UNION ALL
			SELECT pet.row_id,'battle_pet',pet.locale,creature.payload->>'Name_lang',COALESCE(pet.payload->>'Description_lang',''),
				pet.payload||jsonb_build_object('creature',creature.payload),pet.content_hash,pet.source_url,pet.source_artifact_id
			FROM catalog_db2_rows pet JOIN catalog_db2_rows creature ON creature.build_id=pet.build_id
				AND creature.table_name='Creature' AND creature.locale=pet.locale AND creature.row_id=(pet.payload->>'CreatureID')::bigint
			WHERE pet.build_id=$1 AND pet.table_name='BattlePetSpecies' AND pet.locale IN ('en_US','ru_RU')
			  AND (COALESCE(cardinality($2::text[]),0)=0 OR pet.table_name=ANY($2::text[]))
			  AND NULLIF(BTRIM(creature.payload->>'Name_lang'),'') IS NOT NULL`, ic.BuildID, tables); err != nil {
			return fmt.Errorf("stage DB2 collections: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_collections ON COMMIT DROP AS
			WITH candidates AS (
				SELECT external_id,entity_type,name,description,db2,
					content_hash,source_url,source_artifact_id
				FROM projected_collection_localizations
				WHERE locale='en_US' AND entity_type<>'ui_map'
				UNION ALL
				SELECT raw.row_id,'ui_map',COALESCE(raw.payload->>'Name_lang',''),'',raw.payload,
					raw.content_hash,raw.source_url,raw.source_artifact_id
				FROM catalog_db2_rows raw
				WHERE raw.build_id=$1 AND raw.table_name='UiMap' AND raw.locale='en_US'
				  AND (COALESCE(cardinality($2::text[]),0)=0 OR raw.table_name=ANY($2::text[]))
			)
			SELECT DISTINCT ON (entity_type,external_id) external_id,entity_type,name,description,db2,
				content_hash,source_url,source_artifact_id
			FROM candidates
			ORDER BY entity_type,external_id`, ic.BuildID, tables); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
				first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
			SELECT $1,$2,entity_type,external_id,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name,'[^[:alnum:]]+','-','g'))),''),entity_type||'-'||external_id),
				$3,$3,NULL,now() FROM projected_collections
			ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,
				deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert collection entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT entity.id,$2,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=entity.id AND old.build_id=$2),0)+1,projected.content_hash,
				jsonb_build_object('name',projected.name,'description',projected.description,'db2',projected.db2,
					'registry_only',projected.entity_type='ui_map' AND btrim(projected.name)=''),
				projected.source_url,$3,projected.source_artifact_id
			FROM projected_collections projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=projected.entity_type AND entity.external_id=projected.external_id
			WHERE NOT EXISTS(SELECT 1 FROM game_entity_versions old WHERE old.entity_id=entity.id
				AND old.build_id=$2 AND old.content_hash=projected.content_hash)`, ic.ProductID, ic.BuildID, ic.SnapshotID)
		if err != nil {
			return fmt.Errorf("insert collection versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_collection_versions ON COMMIT DROP AS
			SELECT projected.*,entity.id AS entity_id,version.id AS version_id
			FROM projected_collections projected JOIN game_entities entity ON entity.product_id=$1
				AND entity.entity_type=projected.entity_type AND entity.external_id=projected.external_id
			JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
				AND candidate.build_id=$2 AND candidate.content_hash=projected.content_hash
				ORDER BY candidate.revision DESC LIMIT 1) version ON true`,
			ic.ProductID, ic.BuildID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version_id,source_artifact_id
			FROM projected_collection_versions
			WHERE source_artifact_id IS NOT NULL
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING`); err != nil {
			return fmt.Errorf("observe collection version artifacts: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
			SELECT version.version_id,localized.locale,
				COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),localized.entity_type||'-'||localized.external_id),
				localized.name,localized.description,localized.db2
			FROM projected_collection_localizations localized
			JOIN projected_collection_versions version ON version.entity_type=localized.entity_type
				AND version.external_id=localized.external_id
			ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
				description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize collection entities: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_icons(build_id,entity_type,external_id,icon_name,source_artifact_id)
			SELECT $1,projected.entity_type,projected.external_id,asset.icon_name,projected.source_artifact_id
			FROM projected_collections projected
			JOIN catalog_file_assets asset ON asset.file_data_id=CASE projected.entity_type
				WHEN 'class' THEN NULLIF(projected.db2->>'IconFileDataID','')::bigint
				WHEN 'specialization' THEN NULLIF(projected.db2->>'SpellIconFileID','')::bigint END
			WHERE projected.entity_type IN ('class','specialization')
			ON CONFLICT(build_id,entity_type,external_id) DO UPDATE SET
				icon_name=EXCLUDED.icon_name,source_artifact_id=EXCLUDED.source_artifact_id`, ic.BuildID); err != nil {
			return fmt.Errorf("project class and specialization icons: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities entity
			SET latest_version_id=projected.version_id,updated_at=now()
			FROM projected_collection_versions projected
			WHERE entity.id=projected.entity_id
			  AND COALESCE((
				SELECT current_build.build_number
				FROM game_entity_versions current_version
				JOIN game_builds current_build ON current_build.id=current_version.build_id
				WHERE current_version.id=entity.latest_version_id
			  ),0) <= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1)`,
			ic.BuildID); err != nil {
			return fmt.Errorf("activate staged collection entities: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectItems(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) (int64, error) {
	var projected int64
	err := pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_items ON COMMIT DROP AS
				SELECT sparse.row_id AS external_id,sparse.source_url,sparse.source_artifact_id,sparse.snapshot_id AS source_snapshot_id,
					sparse.source_artifact_id AS sparse_source_artifact_id,core.source_artifact_id AS core_source_artifact_id,
					item_description.source_artifact_id AS item_description_source_artifact_id,
					false AS registry_only,
					sparse.payload->>'Display_lang' AS name_en,
					COALESCE(NULLIF(sparse_ru.payload->>'Display_lang',''),sparse.payload->>'Display_lang') AS name_ru,
					COALESCE(NULLIF(sparse.payload->>'Description_lang',''),item_description.payload->>'Description_lang','') AS description_en,
					COALESCE(NULLIF(sparse_ru.payload->>'Description_lang',''),NULLIF(item_description_ru.payload->>'Description_lang',''),NULLIF(item_description.payload->>'Description_lang',''),sparse.payload->>'Description_lang','') AS description_ru,
					sparse.payload AS db2_en,COALESCE(sparse_ru.payload,sparse.payload) AS db2_ru,
				COALESCE(core.payload,'{}'::jsonb) AS db2_core,
				CASE WHEN COALESCE(NULLIF(core.payload->>'ClassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'ClassID','')::int ELSE NULL END AS class_id,
				CASE WHEN COALESCE(NULLIF(core.payload->>'SubclassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'SubclassID','')::int ELSE NULL END AS subclass_id,
				CASE WHEN COALESCE(NULLIF(core.payload->>'InventoryType','')::int,-1)>=0
					THEN NULLIF(core.payload->>'InventoryType','')::int ELSE NULL END AS core_inventory_type,
				COALESCE(NULLIF(core.payload->>'IconFileDataID','')::bigint,0) AS icon_file_data_id
				FROM catalog_db2_rows sparse
				LEFT JOIN catalog_db2_rows sparse_ru ON sparse_ru.build_id=sparse.build_id AND sparse_ru.table_name='ItemSparse' AND sparse_ru.locale='ru_RU' AND sparse_ru.row_id=sparse.row_id
				LEFT JOIN catalog_db2_rows core ON core.build_id=sparse.build_id AND core.table_name='Item' AND core.locale='en_US' AND core.row_id=sparse.row_id
				LEFT JOIN catalog_db2_rows item_description ON item_description.build_id=sparse.build_id AND item_description.table_name='ItemNameDescription' AND item_description.locale='en_US' AND item_description.row_id=NULLIF(sparse.payload->>'ItemNameDescriptionID','')::bigint
				LEFT JOIN catalog_db2_rows item_description_ru ON item_description_ru.build_id=sparse.build_id AND item_description_ru.table_name='ItemNameDescription' AND item_description_ru.locale='ru_RU' AND item_description_ru.row_id=NULLIF(sparse.payload->>'ItemNameDescriptionID','')::bigint
			WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
			  AND NULLIF(BTRIM(sparse.payload->>'Display_lang'),'') IS NOT NULL
			UNION ALL
				SELECT core.row_id,core.source_url,core.source_artifact_id,core.snapshot_id,
					NULL::uuid,core.source_artifact_id,NULL::uuid,true,
				''::text,''::text,''::text,''::text,'{}'::jsonb,'{}'::jsonb,core.payload,
				CASE WHEN COALESCE(NULLIF(core.payload->>'ClassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'ClassID','')::int ELSE NULL END,
				CASE WHEN COALESCE(NULLIF(core.payload->>'SubclassID','')::int,-1)>=0
					THEN NULLIF(core.payload->>'SubclassID','')::int ELSE NULL END,
				CASE WHEN COALESCE(NULLIF(core.payload->>'InventoryType','')::int,-1)>=0
					THEN NULLIF(core.payload->>'InventoryType','')::int ELSE NULL END,
				COALESCE(NULLIF(core.payload->>'IconFileDataID','')::bigint,0)
			FROM catalog_db2_rows core
			WHERE core.build_id=$1 AND core.table_name='Item' AND core.locale='en_US'
			  AND NOT EXISTS (SELECT 1 FROM catalog_db2_rows sparse
				WHERE sparse.build_id=core.build_id AND sparse.table_name='ItemSparse'
				  AND sparse.locale='en_US' AND sparse.row_id=core.row_id
				  AND NULLIF(BTRIM(sparse.payload->>'Display_lang'),'') IS NOT NULL)`, ic.BuildID); err != nil {
			return fmt.Errorf("stage items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			ALTER TABLE projected_items ADD COLUMN payload_en JSONB;
			UPDATE projected_items SET payload_en=CASE WHEN registry_only THEN jsonb_build_object(
				'id',external_id,'registry_only',true,'enrichment_status','client_registry',
				'item_class',jsonb_build_object('id',class_id),'item_subclass',jsonb_build_object('id',subclass_id),
				'inventory_type',jsonb_build_object('type',core_inventory_type),
				'icon_file_data_id',icon_file_data_id,'db2',db2_core
			) ELSE jsonb_build_object(
				'id',external_id,'name',name_en,'description',description_en,
				'level',COALESCE(NULLIF(db2_en->>'ItemLevel','')::int,0),
				'required_level',CASE
					WHEN COALESCE(NULLIF(db2_en->>'RequiredLevel','')::int,-1)>=0
					THEN NULLIF(db2_en->>'RequiredLevel','')::int
					ELSE NULL
				END,
				'max_count',COALESCE(NULLIF(db2_en->>'MaxCount','')::int,0),
				'purchase_price',COALESCE(NULLIF(db2_en->>'BuyPrice','')::bigint,0),
				'sell_price',COALESCE(NULLIF(db2_en->>'SellPrice','')::bigint,0),
				'inventory_type',jsonb_build_object('type',COALESCE(db2_en->>'InventoryType','0')),
				'quality',jsonb_build_object('type',COALESCE(db2_en->>'OverallQualityID','0')),
				'item_class',jsonb_build_object('id',class_id),'item_subclass',jsonb_build_object('id',subclass_id),
				'icon_file_data_id',icon_file_data_id,'db2',db2_en,'db2_item',db2_core
			) END;
			ALTER TABLE projected_items ADD COLUMN content_hash BYTEA;
			UPDATE projected_items SET content_hash=digest(convert_to(payload_en::text,'UTF8'),'sha256');
			CREATE UNIQUE INDEX projected_items_id_idx ON projected_items(external_id)`); err != nil {
			return fmt.Errorf("prepare items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entities (product_id,namespace_id,entity_type,external_id,canonical_slug,first_seen_build_id,last_seen_build_id)
			SELECT $1,$2,'item',external_id,COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'item-'||external_id),$3,$3
			FROM projected_items
			ON CONFLICT (product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
				canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now()`, ic.ProductID, ic.NamespaceID, ic.BuildID); err != nil {
			return fmt.Errorf("upsert item entities: %w", err)
		}
		command, err := tx.Exec(ctx, `
			INSERT INTO game_entity_versions (entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
			SELECT e.id,$2,COALESCE((SELECT MAX(old.revision) FROM game_entity_versions old
				WHERE old.entity_id=e.id AND old.build_id=$2),0)+1,
				p.content_hash,p.payload_en,p.source_url,p.source_snapshot_id,p.source_artifact_id
			FROM projected_items p JOIN game_entities e ON e.product_id=$1 AND e.entity_type='item' AND e.external_id=p.external_id
			WHERE NOT EXISTS (SELECT 1 FROM game_entity_versions old
				WHERE old.entity_id=e.id AND old.build_id=$2 AND old.content_hash=p.content_hash)`,
			ic.ProductID, ic.BuildID)
		if err != nil {
			return fmt.Errorf("insert missing item versions: %w", err)
		}
		projected = command.RowsAffected()
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE projected_item_versions ON COMMIT DROP AS
			SELECT p.*,e.id AS entity_id,v.id AS version_id
			FROM projected_items p
			JOIN game_entities e ON e.product_id=$1 AND e.entity_type='item' AND e.external_id=p.external_id
			JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
				WHERE candidate.entity_id=e.id AND candidate.build_id=$2 AND candidate.content_hash=p.content_hash
				ORDER BY candidate.revision DESC LIMIT 1) v ON true`,
			ic.ProductID, ic.BuildID); err != nil {
			return fmt.Errorf("map projected item versions: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO game_entity_localizations (version_id,locale,slug,name,description,attributes)
			SELECT version_id,'en_US',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_en,'[^[:alnum:]]+','-','g'))),''),'item-'||external_id),
				name_en,description_en,jsonb_build_object('id',external_id,'name',name_en,'description',description_en,'db2',db2_en)
			FROM projected_item_versions WHERE NOT registry_only
			UNION ALL
			SELECT version_id,'ru_RU',COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(name_ru,'[^[:alnum:]]+','-','g'))),''),'item-'||external_id),
				name_ru,description_ru,jsonb_build_object('id',external_id,'name',name_ru,'description',description_ru,'db2',db2_ru)
			FROM projected_item_versions WHERE NOT registry_only
			ON CONFLICT (version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,attributes=EXCLUDED.attributes`); err != nil {
			return fmt.Errorf("localize projected items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_items (version_id,quality,item_level,required_level,inventory_type,item_class_id,item_subclass_id,max_count,purchase_price,sell_price,is_equippable,is_stackable)
			SELECT version_id,CASE WHEN registry_only THEN NULL ELSE db2_en->>'OverallQualityID' END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'ItemLevel','')::int,0) END,
				CASE WHEN COALESCE(NULLIF(db2_en->>'RequiredLevel','')::int,-1)>=0
					THEN NULLIF(db2_en->>'RequiredLevel','')::int ELSE NULL END,
				COALESCE(db2_en->>'InventoryType',core_inventory_type::text),class_id,subclass_id,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'MaxCount','')::int,0) END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'BuyPrice','')::bigint,0) END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'SellPrice','')::bigint,0) END,
				CASE WHEN registry_only THEN core_inventory_type>0 ELSE COALESCE(NULLIF(db2_en->>'InventoryType','')::int,0)>0 END,
				CASE WHEN registry_only THEN NULL ELSE COALESCE(NULLIF(db2_en->>'Stackable','')::int,0)>1 END
			FROM projected_item_versions
			ON CONFLICT (version_id) DO UPDATE SET quality=EXCLUDED.quality,item_level=EXCLUDED.item_level,required_level=EXCLUDED.required_level,
				inventory_type=EXCLUDED.inventory_type,item_class_id=EXCLUDED.item_class_id,item_subclass_id=EXCLUDED.item_subclass_id,
				max_count=EXCLUDED.max_count,purchase_price=EXCLUDED.purchase_price,sell_price=EXCLUDED.sell_price,
				is_equippable=EXCLUDED.is_equippable,is_stackable=EXCLUDED.is_stackable`); err != nil {
			return fmt.Errorf("project typed items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id)
			SELECT DISTINCT version_id,source_artifact_id
			FROM (
				SELECT version_id,sparse_source_artifact_id AS source_artifact_id FROM projected_item_versions
				UNION ALL
				SELECT version_id,core_source_artifact_id FROM projected_item_versions
				UNION ALL
				SELECT version_id,item_description_source_artifact_id FROM projected_item_versions
			) observations
			WHERE source_artifact_id IS NOT NULL
			ON CONFLICT(version_id,source_artifact_id) DO NOTHING`); err != nil {
			return fmt.Errorf("observe item version artifacts: %w", err)
		}
		if _, err := tx.Exec(ctx, itemDetailsProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID); err != nil {
			return fmt.Errorf("project item details: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE game_entities e SET latest_version_id=p.version_id,updated_at=now()
			FROM projected_item_versions p
			WHERE e.id=p.entity_id AND COALESCE((SELECT b.build_number FROM game_entity_versions current_version JOIN game_builds b ON b.id=current_version.build_id WHERE current_version.id=e.latest_version_id),0)
				<= (SELECT b.build_number FROM game_builds b WHERE b.id=$1)`, ic.BuildID); err != nil {
			return fmt.Errorf("activate projected items: %w", err)
		}
		return nil
	})
	return projected, err
}

func projectJournalEntities(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) error {
	_, err := db.Exec(ctx, journalEntityProjectionSQL, pgx.QueryExecModeSimpleProtocol,
		ic.BuildID, ic.ProductID, ic.SnapshotID, ic.NamespaceID)
	if err != nil {
		return fmt.Errorf("project journal entities: %w", err)
	}
	return nil
}

func projectItemDetails(ctx context.Context, db *pgxpool.Pool, ic catalogimport.ImportContext) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, itemDetailsProjectionSQL, pgx.QueryExecModeSimpleProtocol, ic.BuildID, ic.ProductID); err != nil {
			return fmt.Errorf("project item details: %w", err)
		}
		return nil
	})
}

const itemDetailsProjectionSQL = `
	INSERT INTO catalog_journal_instances(build_id,journal_instance_id,map_id,area_id,covenant_id,flags)
	SELECT build_id,row_id,NULLIF(COALESCE(NULLIF(payload->>'MapID','')::int,0),0),
		NULLIF(COALESCE(NULLIF(payload->>'AreaID','')::int,0),0),NULLIF(COALESCE(NULLIF(payload->>'CovenantID','')::int,0),0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='JournalInstance' AND locale='en_US'
	ON CONFLICT(build_id,journal_instance_id) DO UPDATE SET map_id=EXCLUDED.map_id,area_id=EXCLUDED.area_id,
		covenant_id=EXCLUDED.covenant_id,flags=EXCLUDED.flags;

	INSERT INTO catalog_journal_instance_localizations(build_id,journal_instance_id,locale,name,description)
	SELECT build_id,row_id,locale,payload->>'Name_lang',COALESCE(payload->>'Description_lang','')
	FROM catalog_db2_rows WHERE build_id=$1 AND table_name='JournalInstance' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'Name_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,journal_instance_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

	INSERT INTO catalog_journal_encounters(build_id,journal_encounter_id,journal_instance_id,dungeon_encounter_id,
		ui_map_id,order_index,difficulty_mask,flags)
	SELECT encounter.build_id,encounter.row_id,(encounter.payload->>'JournalInstanceID')::bigint,
		NULLIF(COALESCE(NULLIF(encounter.payload->>'DungeonEncounterID','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(encounter.payload->>'UiMapID','')::int,0),0),
		COALESCE(NULLIF(encounter.payload->>'OrderIndex','')::int,0),
		COALESCE(NULLIF(encounter.payload->>'DifficultyMask','')::bigint,0),COALESCE(NULLIF(encounter.payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows encounter
	JOIN catalog_journal_instances instance ON instance.build_id=encounter.build_id
		AND instance.journal_instance_id=(encounter.payload->>'JournalInstanceID')::bigint
	WHERE encounter.build_id=$1 AND encounter.table_name='JournalEncounter' AND encounter.locale='en_US'
	ON CONFLICT(build_id,journal_encounter_id) DO UPDATE SET journal_instance_id=EXCLUDED.journal_instance_id,
		dungeon_encounter_id=EXCLUDED.dungeon_encounter_id,ui_map_id=EXCLUDED.ui_map_id,
		order_index=EXCLUDED.order_index,difficulty_mask=EXCLUDED.difficulty_mask,flags=EXCLUDED.flags;

	INSERT INTO catalog_journal_encounter_localizations(build_id,journal_encounter_id,locale,name,description)
	SELECT encounter.build_id,encounter.row_id,encounter.locale,encounter.payload->>'Name_lang',
		COALESCE(encounter.payload->>'Description_lang','')
	FROM catalog_db2_rows encounter
	JOIN catalog_journal_encounters typed ON typed.build_id=encounter.build_id AND typed.journal_encounter_id=encounter.row_id
	WHERE encounter.build_id=$1 AND encounter.table_name='JournalEncounter' AND encounter.locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(encounter.payload->>'Name_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,journal_encounter_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

	DELETE FROM catalog_item_acquisition_sources source USING game_entity_versions version
	WHERE source.version_id=version.id AND version.build_id=$1 AND source.source_type IN ('encounter','crafting_recipe');
	INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,context_id,journal_instance_id,difficulty_mask,attributes,source_artifact_id)
	SELECT item_version.id,'encounter',(journal_item.payload->>'JournalEncounterID')::bigint,journal_item.row_id,
		encounter.journal_instance_id,COALESCE(NULLIF(journal_item.payload->>'DifficultyMask','')::bigint,0),journal_item.payload,journal_item.source_artifact_id
	FROM catalog_db2_rows journal_item
	JOIN game_entities item ON item.product_id=$2 AND item.entity_type='item'
		AND item.external_id=(journal_item.payload->>'ItemID')::bigint AND item.deleted_at IS NULL
	JOIN LATERAL (SELECT version.id FROM game_entity_versions version
		WHERE version.entity_id=item.id AND version.build_id=$1 ORDER BY version.revision DESC LIMIT 1) item_version ON true
	JOIN catalog_journal_encounters encounter ON encounter.build_id=journal_item.build_id
		AND encounter.journal_encounter_id=(journal_item.payload->>'JournalEncounterID')::bigint
	WHERE journal_item.build_id=$1 AND journal_item.table_name='JournalEncounterItem' AND journal_item.locale='en_US'
	ON CONFLICT(version_id,source_type,source_id,context_id) DO UPDATE SET journal_instance_id=EXCLUDED.journal_instance_id,
		difficulty_mask=EXCLUDED.difficulty_mask,attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id;

	INSERT INTO catalog_item_acquisition_sources(version_id,source_type,source_id,context_id,source_entity_id,attributes,source_artifact_id)
	SELECT item_version.id,'crafting_recipe',recipe.external_id,0,recipe.id,
		jsonb_build_object('output_source',output.source),output.source_artifact_id
	FROM catalog_recipe_outputs output
	JOIN game_entities item ON item.product_id=$2 AND item.entity_type='item' AND item.external_id=output.item_external_id
		AND item.deleted_at IS NULL
	JOIN LATERAL (SELECT version.id FROM game_entity_versions version
		WHERE version.entity_id=item.id AND version.build_id=$1 ORDER BY version.revision DESC LIMIT 1) item_version ON true
	JOIN game_entity_versions recipe_version ON recipe_version.id=output.recipe_version_id AND recipe_version.build_id=$1
	JOIN game_entities recipe ON recipe.id=recipe_version.entity_id AND recipe.entity_type='recipe' AND recipe.product_id=$2
	ON CONFLICT(version_id,source_type,source_id,context_id) DO UPDATE SET source_entity_id=EXCLUDED.source_entity_id,
		attributes=EXCLUDED.attributes,source_artifact_id=EXCLUDED.source_artifact_id;

	INSERT INTO catalog_item_classes(build_id,class_id,db2_row_id,price_modifier,flags)
	SELECT build_id,(payload->>'ClassID')::int,row_id,COALESCE(NULLIF(payload->>'PriceModifier','')::numeric,0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0)
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemClass' AND locale='en_US'
	ON CONFLICT(build_id,class_id) DO UPDATE SET db2_row_id=EXCLUDED.db2_row_id,
		price_modifier=EXCLUDED.price_modifier,flags=EXCLUDED.flags;

	INSERT INTO catalog_item_class_localizations(build_id,class_id,locale,name)
	SELECT build_id,(payload->>'ClassID')::int,locale,payload->>'ClassName_lang'
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemClass' AND locale IN ('en_US','ru_RU')
	  AND NULLIF(BTRIM(payload->>'ClassName_lang'),'') IS NOT NULL
	ON CONFLICT(build_id,class_id,locale) DO UPDATE SET name=EXCLUDED.name;

	INSERT INTO catalog_item_subclasses(build_id,class_id,subclass_id,db2_row_id,auction_house_sort_order,
		prerequisite_proficiency,postrequisite_proficiency,flags,display_flags)
	SELECT build_id,(payload->>'ClassID')::int,(payload->>'SubClassID')::int,row_id,
		COALESCE(NULLIF(payload->>'AuctionHouseSortOrder','')::int,0),
		COALESCE(NULLIF(payload->>'PrerequisiteProficiency','')::int,0),
		COALESCE(NULLIF(payload->>'PostrequisiteProficiency','')::int,0),
		COALESCE(NULLIF(payload->>'Flags','')::bigint,0),COALESCE(NULLIF(payload->>'DisplayFlags','')::bigint,0)
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemSubClass' AND locale='en_US'
	  AND COALESCE(NULLIF(payload->>'ClassID','')::int,-1)>=0
	  AND COALESCE(NULLIF(payload->>'SubClassID','')::int,-1)>=0
	ON CONFLICT(build_id,class_id,subclass_id) DO UPDATE SET db2_row_id=EXCLUDED.db2_row_id,
		auction_house_sort_order=EXCLUDED.auction_house_sort_order,
		prerequisite_proficiency=EXCLUDED.prerequisite_proficiency,
		postrequisite_proficiency=EXCLUDED.postrequisite_proficiency,flags=EXCLUDED.flags,display_flags=EXCLUDED.display_flags;

	INSERT INTO catalog_item_subclass_localizations(build_id,class_id,subclass_id,locale,name,verbose_name)
	SELECT build_id,(payload->>'ClassID')::int,(payload->>'SubClassID')::int,locale,
		COALESCE(NULLIF(payload->>'DisplayName_lang',''),NULLIF(payload->>'VerboseName_lang','')),
		COALESCE(payload->>'VerboseName_lang','')
	FROM catalog_db2_rows
	WHERE build_id=$1 AND table_name='ItemSubClass' AND locale IN ('en_US','ru_RU')
	  AND COALESCE(NULLIF(payload->>'ClassID','')::int,-1)>=0
	  AND COALESCE(NULLIF(payload->>'SubClassID','')::int,-1)>=0
	  AND COALESCE(NULLIF(BTRIM(payload->>'DisplayName_lang'),''),NULLIF(BTRIM(payload->>'VerboseName_lang'),'')) IS NOT NULL
	ON CONFLICT(build_id,class_id,subclass_id,locale) DO UPDATE SET name=EXCLUDED.name,verbose_name=EXCLUDED.verbose_name;

	DELETE FROM catalog_item_stats stats USING game_entity_versions version
	WHERE stats.version_id=version.id AND version.build_id=$1;
	INSERT INTO catalog_item_stats(version_id,slot,stat_type,percent_editor,socket_percentage,source_artifact_id)
	SELECT item_version.id,slot::smallint,(sparse.payload->>('StatModifier_bonusStat_'||slot))::int,
		COALESCE(NULLIF(sparse.payload->>('StatPercentEditor_'||slot),'')::numeric,0),
		COALESCE(NULLIF(sparse.payload->>('StatPercentageOfSocket_'||slot),'')::numeric,0),
		sparse.source_artifact_id
	FROM catalog_db2_rows sparse
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item' AND entity.external_id=sparse.row_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	CROSS JOIN generate_series(0,9) slot
	WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
	  AND COALESCE(NULLIF(sparse.payload->>('StatModifier_bonusStat_'||slot),'')::int,-1)>=0;

	DELETE FROM catalog_item_sockets sockets USING game_entity_versions version
	WHERE sockets.version_id=version.id AND version.build_id=$1;
	INSERT INTO catalog_item_sockets(version_id,slot,socket_type)
	SELECT item_version.id,slot::smallint,(sparse.payload->>('SocketType_'||slot))::int
	FROM catalog_db2_rows sparse
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item' AND entity.external_id=sparse.row_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	CROSS JOIN generate_series(0,2) slot
	WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
	  AND COALESCE(NULLIF(sparse.payload->>('SocketType_'||slot),'')::int,0)>0;

	INSERT INTO catalog_item_requirements(version_id,required_level,required_skill_id,required_skill_rank,
		required_ability_id,min_faction_id,min_reputation,required_holiday_id,required_transmog_holiday_id,
		allowable_class_mask,allowable_race_mask_0,allowable_race_mask_1)
	SELECT item_version.id,GREATEST(COALESCE(NULLIF(sparse.payload->>'RequiredLevel','')::int,0),0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredSkill','')::int,0),0),
		COALESCE(NULLIF(sparse.payload->>'RequiredSkillRank','')::int,0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredAbility','')::bigint,0),0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'MinFactionID','')::int,0),0),
		COALESCE(NULLIF(sparse.payload->>'MinReputation','')::int,0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredHoliday','')::int,0),0),
		NULLIF(COALESCE(NULLIF(sparse.payload->>'RequiredTransmogHoliday','')::int,0),0),
		COALESCE(NULLIF(sparse.payload->>'AllowableClass','')::bigint,0),
		COALESCE(NULLIF(sparse.payload->>'AllowableRaces_0','')::bigint,0),
		COALESCE(NULLIF(sparse.payload->>'AllowableRaces_1','')::bigint,0)
	FROM catalog_db2_rows sparse
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item' AND entity.external_id=sparse.row_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	WHERE sparse.build_id=$1 AND sparse.table_name='ItemSparse' AND sparse.locale='en_US'
	ON CONFLICT(version_id) DO UPDATE SET required_level=EXCLUDED.required_level,
		required_skill_id=EXCLUDED.required_skill_id,required_skill_rank=EXCLUDED.required_skill_rank,
		required_ability_id=EXCLUDED.required_ability_id,min_faction_id=EXCLUDED.min_faction_id,
		min_reputation=EXCLUDED.min_reputation,required_holiday_id=EXCLUDED.required_holiday_id,
		required_transmog_holiday_id=EXCLUDED.required_transmog_holiday_id,
		allowable_class_mask=EXCLUDED.allowable_class_mask,allowable_race_mask_0=EXCLUDED.allowable_race_mask_0,
		allowable_race_mask_1=EXCLUDED.allowable_race_mask_1;

	DELETE FROM catalog_item_effects effects USING game_entity_versions version
	WHERE effects.version_id=version.id AND version.build_id=$1;
	WITH item_effect_links AS (
		SELECT (link.payload->>'ItemID')::bigint AS item_id,effect.row_id AS item_effect_id,
			effect.payload,link.source_artifact_id
		FROM catalog_db2_rows link
		JOIN catalog_db2_rows effect ON effect.build_id=link.build_id AND effect.table_name='ItemEffect'
			AND effect.locale='en_US' AND effect.row_id=(link.payload->>'ItemEffectID')::bigint
		WHERE link.build_id=$1 AND link.table_name='ItemXItemEffect' AND link.locale='en_US'
		  AND link.payload->>'ItemID' ~ '^[1-9][0-9]*$'
		UNION ALL
		SELECT (effect.payload->>'ParentItemID')::bigint,effect.row_id,effect.payload,effect.source_artifact_id
		FROM catalog_db2_rows effect
		WHERE effect.build_id=$1 AND effect.table_name='ItemEffect' AND effect.locale='en_US'
		  AND effect.payload->>'ParentItemID' ~ '^[1-9][0-9]*$'
		  AND NOT EXISTS (
			SELECT 1 FROM catalog_db2_rows link
			WHERE link.build_id=effect.build_id AND link.table_name='ItemXItemEffect' AND link.locale='en_US'
			  AND link.payload->>'ItemEffectID' ~ '^[1-9][0-9]*$'
			  AND (link.payload->>'ItemEffectID')::bigint=effect.row_id
		  )
	)
	INSERT INTO catalog_item_effects(version_id,item_effect_id,slot,spell_id,trigger_type,charges,cooldown_ms,
		category_cooldown_ms,spell_category_id,specialization_id,player_condition_id,source_artifact_id,
		spell_name,spell_target_status)
	SELECT item_version.id,effect.item_effect_id,COALESCE(NULLIF(effect.payload->>'LegacySlotIndex','')::smallint,0),
		(effect.payload->>'SpellID')::bigint,COALESCE(NULLIF(effect.payload->>'TriggerType','')::int,0),
		COALESCE(NULLIF(effect.payload->>'Charges','')::int,0),COALESCE(NULLIF(effect.payload->>'CoolDownMSec','')::int,0),
		COALESCE(NULLIF(effect.payload->>'CategoryCoolDownMSec','')::int,0),
		COALESCE(NULLIF(effect.payload->>'SpellCategoryID','')::int,0),
		COALESCE(NULLIF(effect.payload->>'ChrSpecializationID','')::int,0),
		COALESCE(NULLIF(effect.payload->>'PlayerConditionID','')::int,0),effect.source_artifact_id,
		COALESCE(NULLIF(BTRIM(spell_name.payload->>'Name_lang'),''),''),
		CASE WHEN spell_name.row_id IS NULL THEN 'unavailable_in_build' ELSE 'resolved' END
	FROM item_effect_links effect
	LEFT JOIN catalog_db2_rows spell_name ON spell_name.build_id=$1
		AND spell_name.table_name='SpellName' AND spell_name.locale='en_US'
		AND spell_name.row_id=(effect.payload->>'SpellID')::bigint
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='item'
		AND entity.external_id=effect.item_id
	JOIN LATERAL (SELECT candidate.id FROM game_entity_versions candidate
		WHERE candidate.entity_id=entity.id AND candidate.build_id=$1
		ORDER BY candidate.revision DESC LIMIT 1) item_version ON true
	WHERE COALESCE(NULLIF(effect.payload->>'SpellID','')::bigint,0)>0
	ON CONFLICT(version_id,item_effect_id) DO UPDATE SET slot=EXCLUDED.slot,spell_id=EXCLUDED.spell_id,
		trigger_type=EXCLUDED.trigger_type,charges=EXCLUDED.charges,cooldown_ms=EXCLUDED.cooldown_ms,
		category_cooldown_ms=EXCLUDED.category_cooldown_ms,spell_category_id=EXCLUDED.spell_category_id,
		specialization_id=EXCLUDED.specialization_id,player_condition_id=EXCLUDED.player_condition_id,
		source_artifact_id=EXCLUDED.source_artifact_id,spell_name=EXCLUDED.spell_name,
		spell_target_status=EXCLUDED.spell_target_status;`

const journalEntityProjectionSQL = `
	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
		first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
	SELECT $2,$4,'instance',instance.journal_instance_id,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),'instance-'||instance.journal_instance_id),
		$1,$1,NULL,now()
	FROM catalog_journal_instances instance
	JOIN catalog_journal_instance_localizations localized ON localized.build_id=instance.build_id
		AND localized.journal_instance_id=instance.journal_instance_id AND localized.locale='en_US'
	WHERE instance.build_id=$1
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,raw.content_hash,
		jsonb_build_object('name',localized.name,'description',localized.description,'db2',raw.payload),
		raw.source_url,$3,raw.source_artifact_id
	FROM catalog_journal_instances instance
	JOIN catalog_journal_instance_localizations localized ON localized.build_id=instance.build_id
		AND localized.journal_instance_id=instance.journal_instance_id AND localized.locale='en_US'
	JOIN catalog_db2_rows raw ON raw.build_id=instance.build_id AND raw.table_name='JournalInstance'
		AND raw.locale='en_US' AND raw.row_id=instance.journal_instance_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='instance'
		AND entity.external_id=instance.journal_instance_id
	WHERE instance.build_id=$1 AND NOT EXISTS(SELECT 1 FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=raw.content_hash);

	INSERT INTO game_entities(product_id,namespace_id,entity_type,external_id,canonical_slug,
		first_seen_build_id,last_seen_build_id,deleted_at,updated_at)
	SELECT $2,$4,'encounter',encounter.journal_encounter_id,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),'encounter-'||encounter.journal_encounter_id),
		$1,$1,NULL,now()
	FROM catalog_journal_encounters encounter
	JOIN catalog_journal_encounter_localizations localized ON localized.build_id=encounter.build_id
		AND localized.journal_encounter_id=encounter.journal_encounter_id AND localized.locale='en_US'
	WHERE encounter.build_id=$1
	ON CONFLICT(product_id,entity_type,external_id) DO UPDATE SET namespace_id=EXCLUDED.namespace_id,
		canonical_slug=EXCLUDED.canonical_slug,last_seen_build_id=EXCLUDED.last_seen_build_id,deleted_at=NULL,updated_at=now();

	INSERT INTO game_entity_versions(entity_id,build_id,revision,content_hash,payload,source_url,snapshot_id,source_artifact_id)
	SELECT entity.id,$1,COALESCE((SELECT max(old.revision) FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1),0)+1,raw.content_hash,
		jsonb_build_object('name',localized.name,'description',localized.description,'db2',raw.payload),
		raw.source_url,$3,raw.source_artifact_id
	FROM catalog_journal_encounters encounter
	JOIN catalog_journal_encounter_localizations localized ON localized.build_id=encounter.build_id
		AND localized.journal_encounter_id=encounter.journal_encounter_id AND localized.locale='en_US'
	JOIN catalog_db2_rows raw ON raw.build_id=encounter.build_id AND raw.table_name='JournalEncounter'
		AND raw.locale='en_US' AND raw.row_id=encounter.journal_encounter_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='encounter'
		AND entity.external_id=encounter.journal_encounter_id
	WHERE encounter.build_id=$1 AND NOT EXISTS(SELECT 1 FROM game_entity_versions old
		WHERE old.entity_id=entity.id AND old.build_id=$1 AND old.content_hash=raw.content_hash);

	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT version.id,localized.locale,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),entity.entity_type||'-'||entity.external_id),
		localized.name,localized.description,jsonb_build_object('journal_instance_id',instance.journal_instance_id)
	FROM catalog_journal_instances instance
	JOIN catalog_journal_instance_localizations localized ON localized.build_id=instance.build_id
		AND localized.journal_instance_id=instance.journal_instance_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='instance' AND entity.external_id=instance.journal_instance_id
	JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
		AND candidate.build_id=$1 ORDER BY (candidate.snapshot_id=$3) DESC,candidate.revision DESC LIMIT 1) version ON true
	WHERE instance.build_id=$1
	ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
		description=EXCLUDED.description,attributes=EXCLUDED.attributes;

	INSERT INTO game_entity_localizations(version_id,locale,slug,name,description,attributes)
	SELECT version.id,localized.locale,
		COALESCE(NULLIF(TRIM(BOTH '-' FROM LOWER(regexp_replace(localized.name,'[^[:alnum:]]+','-','g'))),''),entity.entity_type||'-'||entity.external_id),
		localized.name,localized.description,jsonb_build_object('journal_encounter_id',encounter.journal_encounter_id,
			'journal_instance_id',encounter.journal_instance_id,'dungeon_encounter_id',encounter.dungeon_encounter_id)
	FROM catalog_journal_encounters encounter
	JOIN catalog_journal_encounter_localizations localized ON localized.build_id=encounter.build_id
		AND localized.journal_encounter_id=encounter.journal_encounter_id
	JOIN game_entities entity ON entity.product_id=$2 AND entity.entity_type='encounter' AND entity.external_id=encounter.journal_encounter_id
	JOIN LATERAL(SELECT candidate.id FROM game_entity_versions candidate WHERE candidate.entity_id=entity.id
		AND candidate.build_id=$1 ORDER BY (candidate.snapshot_id=$3) DESC,candidate.revision DESC LIMIT 1) version ON true
	WHERE encounter.build_id=$1
	ON CONFLICT(version_id,locale) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,
		description=EXCLUDED.description,attributes=EXCLUDED.attributes;

	WITH candidates AS (
		SELECT DISTINCT ON (entity.id) entity.id AS entity_id,version.id AS version_id
		FROM game_entities entity JOIN game_entity_versions version ON version.entity_id=entity.id AND version.build_id=$1
		WHERE entity.product_id=$2 AND entity.entity_type IN ('instance','encounter')
		ORDER BY entity.id,(version.snapshot_id=$3) DESC,version.revision DESC
	)
	UPDATE game_entities entity SET latest_version_id=candidate.version_id,updated_at=now()
	FROM candidates candidate
	WHERE entity.id=candidate.entity_id
	  AND COALESCE((SELECT current_build.build_number
		FROM game_entity_versions current_version
		JOIN game_builds current_build ON current_build.id=current_version.build_id
		WHERE current_version.id=entity.latest_version_id),0)
		<= (SELECT selected_build.build_number FROM game_builds selected_build WHERE selected_build.id=$1);

	UPDATE catalog_journal_instances instance SET entity_id=entity.id
	FROM game_entities entity WHERE instance.build_id=$1 AND entity.product_id=$2
		AND entity.entity_type='instance' AND entity.external_id=instance.journal_instance_id;
	UPDATE catalog_journal_encounters encounter SET entity_id=entity.id
	FROM game_entities entity WHERE encounter.build_id=$1 AND entity.product_id=$2
		AND entity.entity_type='encounter' AND entity.external_id=encounter.journal_encounter_id;
	UPDATE catalog_item_acquisition_sources source SET source_entity_id=encounter.entity_id
	FROM game_entity_versions item_version,catalog_journal_encounters encounter
	WHERE source.version_id=item_version.id AND item_version.build_id=$1 AND source.source_type='encounter'
		AND encounter.build_id=item_version.build_id AND encounter.journal_encounter_id=source.source_id;`
