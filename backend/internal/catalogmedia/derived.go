package catalogmedia

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Derived media fills library records that have no icon mapping of their own
// with an image that the imported DB2 data ties to them: the item appearance
// icon of an item or transmog set, the journal portrait of an encounter, the
// journal button of an instance, the icon of a mount's source spell, or the
// official Blizzard render of an NPC's creature display. Each link records the
// DB2 rows that prove it, and the bytes go through the same cache, provenance
// and publication path as SeedOfficialIcons.

const creatureDisplayRenderOrigin = "https://render.worldofwarcraft.com/us/npcs/zoom/creature-display-"

// Render and icon CDNs tolerate a few parallel requests; Wago CASC downloads
// are serialized separately by Cache.wagoMu.
const derivedMediaWorkers = 4
const derivedMediaMaxRank = 3

const (
	DerivedModePlan   = "plan"
	DerivedModeVerify = "verify"
	DerivedModeApply  = "apply"
)

// DefaultDerivedMediaGroups have a direct, player-recognizable image source.
var DefaultDerivedMediaGroups = []string{
	"item_appearance_icon", "encounter_journal_portrait", "instance_journal_button",
	"transmog_set_item_icon", "mount_source_spell_icon", "spell_misc_icon", "creature_display_render",
}

// OptionalDerivedMediaGroups represent a record by a related entity's image
// and run only when requested by name.
var OptionalDerivedMediaGroups = []string{"map_journal_instance_button", "quest_reward_package_item_icon"}

type DerivedMediaOptions struct {
	Product     string
	Environment string
	Groups      []string
	// Limit caps unique assets downloaded in one run.
	Limit int
	Mode  string
}

type DerivedGroupResult struct {
	Group           string `json:"group"`
	PlannedEntities int64  `json:"plannedEntities"`
	PlannedAssets   int64  `json:"plannedAssets"`
	Linked          int64  `json:"linked"`
	Visible         int64  `json:"visibleAfterLink,omitempty"`
}

type DerivedMediaResult struct {
	Mode           string               `json:"mode"`
	Groups         []DerivedGroupResult `json:"groups"`
	AssetsFetched  int64                `json:"assetsFetched"`
	AssetsFailed   int64                `json:"assetsFailed"`
	AssetsSkipped  int64                `json:"assetsSkippedByLimit"`
	Bytes          int64                `json:"bytes"`
	EntitiesLinked int64                `json:"entitiesLinked"`
	FailureSample  []IconFailure        `json:"failureSample,omitempty"`
	// Entities lists planned (plan mode) or linked (verify/apply) entity IDs
	// by group so a caller can intersect them with a library audit.
	Entities map[string][]uuid.UUID `json:"-"`
}

type derivedPlanRow struct {
	Group      string
	EntityID   uuid.UUID
	EntityType string
	ExternalID int64
	BuildID    int64
	Rank       int
	MediaKind  string
	IconName   *string
	FileDataID *int64
	SourceURL  *string
	Evidence   []byte
	AssetRef   string
}

type derivedAsset struct {
	Ref        string
	MediaKind  string
	IconName   *string
	FileDataID *int64
	SourceURL  *string
}

type derivedFetch struct {
	Asset derivedAsset
	Icon  cachedIcon
	Err   error
}

// derivedEvidenceBuild picks the DB2 build that proves a mapping: the
// entity's own published build, else the newest build not after it, else the
// newest build that has the table at all.
func derivedEvidenceBuild(table string) string {
	return `SELECT available.build_id FROM derived_db2_builds available
		WHERE available.table_name='` + table + `'
		ORDER BY available.build_id=target.build_id DESC,
			available.build_number<=target.build_number DESC,available.build_number DESC
		LIMIT 1`
}

var derivedGroupTables = map[string][]string{
	"item_appearance_icon":           {"Item", "ItemModifiedAppearance", "ItemAppearance"},
	"encounter_journal_portrait":     {"JournalEncounterCreature"},
	"instance_journal_button":        nil,
	"transmog_set_item_icon":         {"TransmogSetItem", "ItemModifiedAppearance", "ItemAppearance", "Item"},
	"mount_source_spell_icon":        {"SpellMisc"},
	"spell_misc_icon":                {"SpellMisc"},
	"creature_display_render":        nil,
	"map_journal_instance_button":    {"JournalInstance"},
	"quest_reward_package_item_icon": nil,
}

var derivedGroupEntityTypes = map[string]string{
	"item_appearance_icon":           "item",
	"encounter_journal_portrait":     "encounter",
	"instance_journal_button":        "instance",
	"transmog_set_item_icon":         "transmog_set",
	"mount_source_spell_icon":        "mount",
	"spell_misc_icon":                "spell",
	"creature_display_render":        "creature",
	"map_journal_instance_button":    "map",
	"quest_reward_package_item_icon": "quest_reward_package",
}

// Each statement inserts candidate images for one group. priority orders
// alternatives for an entity; the planner keeps up to derivedMediaMaxRank of
// them so a missing asset can fall back to the next proven one.
var derivedGroupSQL = map[string]string{
	"item_appearance_icon": `
		WITH targets AS MATERIALIZED (
			SELECT target.entity_id,target.external_id,evidence.build_id AS evidence_build_id
			FROM derived_media_targets target
			JOIN LATERAL (` + derivedEvidenceBuild("ItemModifiedAppearance") + `) evidence ON true
			WHERE target.entity_type='item'
		), modified AS MATERIALIZED (
			SELECT row.build_id,NULLIF(row.payload->>'ItemID','')::bigint AS item_id,row.row_id,
				NULLIF(row.payload->>'ItemAppearanceID','')::bigint AS appearance_id,
				COALESCE(NULLIF(row.payload->>'OrderIndex','')::int,0) AS order_index
			FROM catalog_db2_rows row
			WHERE row.table_name='ItemModifiedAppearance' AND row.locale='en_US'
			  AND row.build_id IN (SELECT evidence_build_id FROM targets)
		)
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'item_appearance_icon',target.entity_id,0,'icon',NULLIF(item.payload->>'IconFileDataID','')::bigint,
			jsonb_build_object('db2_table','Item','db2_row',item.row_id,'db2_field','IconFileDataID','db2_build_id',item.build_id)
		FROM targets target
		JOIN catalog_db2_rows item ON item.build_id=target.evidence_build_id AND item.table_name='Item'
			AND item.locale='en_US' AND item.row_id=target.external_id
		UNION ALL
		SELECT 'item_appearance_icon',target.entity_id,1+modified.order_index,'icon',
			NULLIF(appearance.payload->>'DefaultIconFileDataID','')::bigint,
			jsonb_build_object('db2_table','ItemAppearance','db2_row',appearance.row_id,
				'db2_field','DefaultIconFileDataID','item_modified_appearance',modified.row_id,'db2_build_id',appearance.build_id)
		FROM targets target
		JOIN modified ON modified.build_id=target.evidence_build_id AND modified.item_id=target.external_id
		JOIN catalog_db2_rows appearance ON appearance.build_id=modified.build_id AND appearance.table_name='ItemAppearance'
			AND appearance.locale='en_US' AND appearance.row_id=modified.appearance_id`,
	"encounter_journal_portrait": `
		WITH targets AS MATERIALIZED (
			SELECT target.entity_id,target.external_id,evidence.build_id AS evidence_build_id
			FROM derived_media_targets target
			JOIN LATERAL (` + derivedEvidenceBuild("JournalEncounterCreature") + `) evidence ON true
			WHERE target.entity_type='encounter'
		), creatures AS MATERIALIZED (
			SELECT row.build_id,row.row_id,NULLIF(row.payload->>'JournalEncounterID','')::bigint AS encounter_id,
				NULLIF(row.payload->>'FileDataID','')::bigint AS file_data_id,
				COALESCE(NULLIF(row.payload->>'OrderIndex','')::int,0) AS order_index
			FROM catalog_db2_rows row
			WHERE row.table_name='JournalEncounterCreature' AND row.locale='en_US'
			  AND row.build_id IN (SELECT evidence_build_id FROM targets)
		)
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'encounter_journal_portrait',target.entity_id,creature.order_index,'portrait',creature.file_data_id,
			jsonb_build_object('db2_table','JournalEncounterCreature','db2_row',creature.row_id,
				'db2_field','FileDataID','db2_build_id',creature.build_id)
		FROM targets target
		JOIN creatures creature ON creature.build_id=target.evidence_build_id AND creature.encounter_id=target.external_id`,
	"instance_journal_button": `
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'instance_journal_button',target.entity_id,field.priority,'journal_button',
			NULLIF(target.payload #>> ARRAY['db2',field.name],'')::bigint,
			jsonb_build_object('db2_table','JournalInstance','db2_row',target.external_id,
				'db2_field',field.name,'db2_build_id',target.build_id)
		FROM derived_media_targets target
		CROSS JOIN (VALUES (0,'ButtonFileDataID'),(1,'ButtonSmallFileDataID')) field(priority,name)
		WHERE target.entity_type='instance' AND target.payload #>> ARRAY['db2',field.name] ~ '^[0-9]+$'`,
	"transmog_set_item_icon": `
		WITH targets AS MATERIALIZED (
			SELECT target.entity_id,target.external_id,evidence.build_id AS evidence_build_id
			FROM derived_media_targets target
			JOIN LATERAL (` + derivedEvidenceBuild("TransmogSetItem") + `) evidence ON true
			WHERE target.entity_type='transmog_set'
		), set_items AS MATERIALIZED (
			SELECT row.build_id,row.row_id,NULLIF(row.payload->>'TransmogSetID','')::bigint AS set_id,
				NULLIF(row.payload->>'ItemModifiedAppearanceID','')::bigint AS modified_appearance_id
			FROM catalog_db2_rows row
			WHERE row.table_name='TransmogSetItem' AND row.locale='en_US'
			  AND row.build_id IN (SELECT evidence_build_id FROM targets)
		)
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'transmog_set_item_icon',target.entity_id,
			-- The chest piece is the set's recognizable silhouette; then the
			-- other large armor slots in the order the collection UI shows them.
			CASE NULLIF(item.payload->>'InventoryType','')::int
				WHEN 5 THEN 0 WHEN 20 THEN 0 WHEN 1 THEN 1 WHEN 3 THEN 2 WHEN 7 THEN 3
				WHEN 10 THEN 4 WHEN 8 THEN 5 WHEN 6 THEN 6 WHEN 9 THEN 7 WHEN 16 THEN 8 ELSE 9 END,
			'icon',NULLIF(appearance.payload->>'DefaultIconFileDataID','')::bigint,
			jsonb_build_object('db2_table','TransmogSetItem','db2_row',set_item.row_id,
				'item_modified_appearance',modified.row_id,'item',item.row_id,'item_appearance',appearance.row_id,
				'db2_field','ItemAppearance.DefaultIconFileDataID','db2_build_id',set_item.build_id)
		FROM targets target
		JOIN set_items set_item ON set_item.build_id=target.evidence_build_id AND set_item.set_id=target.external_id
		JOIN catalog_db2_rows modified ON modified.build_id=set_item.build_id AND modified.table_name='ItemModifiedAppearance'
			AND modified.locale='en_US' AND modified.row_id=set_item.modified_appearance_id
		JOIN catalog_db2_rows appearance ON appearance.build_id=modified.build_id AND appearance.table_name='ItemAppearance'
			AND appearance.locale='en_US' AND appearance.row_id=NULLIF(modified.payload->>'ItemAppearanceID','')::bigint
		LEFT JOIN catalog_db2_rows item ON item.build_id=modified.build_id AND item.table_name='Item'
			AND item.locale='en_US' AND item.row_id=NULLIF(modified.payload->>'ItemID','')::bigint`,
	"mount_source_spell_icon": `
		WITH targets AS MATERIALIZED (
			SELECT target.entity_id,target.payload #>> '{db2,SourceSpellID}' AS spell_id,evidence.build_id AS evidence_build_id
			FROM derived_media_targets target
			JOIN LATERAL (` + derivedEvidenceBuild("SpellMisc") + `) evidence ON true
			WHERE target.entity_type='mount' AND target.payload #>> '{db2,SourceSpellID}' ~ '^[1-9][0-9]*$'
		)
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'mount_source_spell_icon',target.entity_id,0,'icon',NULLIF(misc.payload->>'SpellIconFileDataID','')::bigint,
			jsonb_build_object('db2_table','SpellMisc','db2_row',misc.row_id,'spell',target.spell_id::bigint,
				'db2_field','SpellIconFileDataID','db2_build_id',misc.build_id)
		FROM targets target
		JOIN catalog_db2_rows misc ON misc.build_id=target.evidence_build_id AND misc.table_name='SpellMisc'
			AND misc.locale='en_US' AND misc.payload->>'SpellID'=target.spell_id`,
	"spell_misc_icon": `
		WITH targets AS MATERIALIZED (
			SELECT target.entity_id,target.external_id::text AS spell_id,evidence.build_id AS evidence_build_id
			FROM derived_media_targets target
			JOIN LATERAL (` + derivedEvidenceBuild("SpellMisc") + `) evidence ON true
			WHERE target.entity_type='spell'
		)
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'spell_misc_icon',target.entity_id,0,'icon',NULLIF(misc.payload->>'SpellIconFileDataID','')::bigint,
			jsonb_build_object('db2_table','SpellMisc','db2_row',misc.row_id,
				'db2_field','SpellIconFileDataID','db2_build_id',misc.build_id)
		FROM targets target
		JOIN catalog_db2_rows misc ON misc.build_id=target.evidence_build_id AND misc.table_name='SpellMisc'
			AND misc.locale='en_US' AND misc.payload->>'SpellID'=target.spell_id`,
	"creature_display_render": `
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,source_url,evidence)
		SELECT 'creature_display_render',target.entity_id,display.slot,'zoom',
			'` + creatureDisplayRenderOrigin + `'||display.display_external_id||'.jpg',
			jsonb_build_object('db2_table','Creature','db2_row',target.external_id,'db2_field','DisplayID_'||display.slot,
				'creature_display_id',display.display_external_id,'db2_build_id',target.build_id)
		FROM derived_media_targets target
		JOIN catalog_creature_displays display ON display.version_id=target.version_id
		WHERE target.entity_type='creature'`,
	"map_journal_instance_button": `
		WITH targets AS MATERIALIZED (
			SELECT target.entity_id,target.external_id,evidence.build_id AS evidence_build_id
			FROM derived_media_targets target
			JOIN LATERAL (` + derivedEvidenceBuild("JournalInstance") + `) evidence ON true
			WHERE target.entity_type='map'
		), instances AS MATERIALIZED (
			SELECT row.build_id,row.row_id,NULLIF(row.payload->>'MapID','')::bigint AS map_id,
				NULLIF(row.payload->>'ButtonFileDataID','')::bigint AS file_data_id
			FROM catalog_db2_rows row
			WHERE row.table_name='JournalInstance' AND row.locale='en_US'
			  AND row.build_id IN (SELECT evidence_build_id FROM targets)
		)
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,file_data_id,evidence)
		SELECT 'map_journal_instance_button',target.entity_id,0,'journal_button',instance.file_data_id,
			jsonb_build_object('db2_table','JournalInstance','db2_row',instance.row_id,
				'db2_field','ButtonFileDataID','db2_build_id',instance.build_id)
		FROM targets target
		JOIN instances instance ON instance.build_id=target.evidence_build_id AND instance.map_id=target.external_id`,
	"quest_reward_package_item_icon": `
		INSERT INTO derived_media_candidates(group_key,entity_id,priority,media_kind,icon_name,file_data_id,evidence)
		SELECT 'quest_reward_package_item_icon',target.entity_id,(reward.position-1)::int,'icon',icon.icon_name,icon.file_data_id,
			jsonb_build_object('db2_table','QuestPackageItem','db2_row',reward.value->'row_id',
				'item',(reward.value->>'item_external_id')::bigint,'db2_build_id',target.build_id)
		FROM derived_media_targets target
		CROSS JOIN LATERAL jsonb_array_elements(target.payload->'items') WITH ORDINALITY reward(value,position)
		JOIN LATERAL (
			SELECT icon.icon_name,icon.file_data_id
			FROM game_builds build
			JOIN catalog_entity_icons icon ON icon.build_id=build.id AND icon.entity_type='item'
				AND icon.external_id=(reward.value->>'item_external_id')::bigint
			WHERE build.product_id=$1
			ORDER BY build.id=target.build_id DESC,build.build_number DESC
			LIMIT 1
		) icon ON true
		WHERE target.entity_type='quest_reward_package' AND reward.value->>'item_external_id' ~ '^[1-9][0-9]*$'`,
}

func normalizeDerivedGroups(groups []string) ([]string, error) {
	if len(groups) == 0 {
		return append([]string(nil), DefaultDerivedMediaGroups...), nil
	}
	seen := make(map[string]bool, len(groups))
	result := make([]string, 0, len(groups))
	for _, group := range groups {
		group = strings.TrimSpace(group)
		switch group {
		case "", "default":
			for _, name := range DefaultDerivedMediaGroups {
				if !seen[name] {
					seen[name] = true
					result = append(result, name)
				}
			}
			continue
		case "all":
			for _, name := range append(append([]string(nil), DefaultDerivedMediaGroups...), OptionalDerivedMediaGroups...) {
				if !seen[name] {
					seen[name] = true
					result = append(result, name)
				}
			}
			continue
		}
		if _, ok := derivedGroupSQL[group]; !ok {
			return nil, fmt.Errorf("unknown derived media group %q", group)
		}
		if !seen[group] {
			seen[group] = true
			result = append(result, group)
		}
	}
	return result, nil
}

// SeedDerivedMedia plans, verifies or applies derived images. Plan reads only.
// Verify downloads into this cache's directory and links inside a transaction
// that is rolled back, reporting how many entities the public API would then
// show with an image. Apply commits the links under the media cache lock.
func (c *Cache) SeedDerivedMedia(ctx context.Context, options DerivedMediaOptions) (DerivedMediaResult, error) {
	product := strings.TrimSpace(options.Product)
	mode := strings.TrimSpace(options.Mode)
	result := DerivedMediaResult{Mode: mode, Entities: map[string][]uuid.UUID{}}
	if product == "" {
		return result, errors.New("catalog product is required")
	}
	if mode != DerivedModePlan && mode != DerivedModeVerify && mode != DerivedModeApply {
		return result, errors.New("derived media mode must be plan, verify or apply")
	}
	if options.Limit < 1 || options.Limit > 50000 {
		return result, errors.New("derived media limit must be between 1 and 50000")
	}
	groups, err := normalizeDerivedGroups(options.Groups)
	if err != nil {
		return result, err
	}

	if mode == DerivedModeApply {
		environment := strings.TrimSpace(options.Environment)
		if environment != "development" && environment != "staging" && environment != "production" {
			return result, errors.New("invalid media cache environment")
		}
		// Hold the shared media cache lock on one connection for the whole
		// run: catalog-media-cache writes the same table and volume.
		conn, err := c.db.Acquire(ctx)
		if err != nil {
			return result, fmt.Errorf("acquire media cache lock connection: %w", err)
		}
		defer conn.Release()
		var locked bool
		if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext('gildra_media_cache:'||$1))`, environment).Scan(&locked); err != nil {
			return result, fmt.Errorf("acquire media cache lock: %w", err)
		}
		if !locked {
			return result, errors.New("another media cache run is active")
		}
		defer conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock(hashtext('gildra_media_cache:'||$1))`, environment) //nolint:errcheck
	}

	var productID int16
	var buildVersion string
	if err := c.db.QueryRow(ctx, `
		SELECT product.id,build.version
		FROM game_products product
		JOIN LATERAL (
			SELECT candidate.version FROM game_builds candidate
			WHERE candidate.product_id=product.id
			ORDER BY candidate.build_number DESC,candidate.id DESC LIMIT 1
		) build ON true
		WHERE product.slug=$1`, product).Scan(&productID, &buildVersion); err != nil {
		return result, fmt.Errorf("find current %s build: %w", product, err)
	}

	plan, err := c.planDerivedMedia(ctx, productID, groups)
	if err != nil {
		return result, err
	}
	byGroup := make(map[string]*DerivedGroupResult, len(groups))
	for _, group := range groups {
		result.Groups = append(result.Groups, DerivedGroupResult{Group: group})
	}
	for index := range result.Groups {
		byGroup[result.Groups[index].Group] = &result.Groups[index]
	}
	plannedEntities := make(map[string]map[uuid.UUID]bool)
	plannedAssets := make(map[string]map[string]bool)
	for _, row := range plan {
		if plannedEntities[row.Group] == nil {
			plannedEntities[row.Group] = map[uuid.UUID]bool{}
			plannedAssets[row.Group] = map[string]bool{}
		}
		if !plannedEntities[row.Group][row.EntityID] {
			plannedEntities[row.Group][row.EntityID] = true
			if mode == DerivedModePlan {
				result.Entities[row.Group] = append(result.Entities[row.Group], row.EntityID)
			}
		}
		if row.Rank == 0 {
			plannedAssets[row.Group][row.AssetRef] = true
		}
	}
	for group, entities := range plannedEntities {
		byGroup[group].PlannedEntities = int64(len(entities))
		byGroup[group].PlannedAssets = int64(len(plannedAssets[group]))
	}
	if mode == DerivedModePlan {
		return result, nil
	}

	links, err := c.fetchDerivedAssets(ctx, plan, product, buildVersion, options.Limit, &result)
	if err != nil {
		return result, err
	}
	if len(links) == 0 {
		return result, nil
	}
	err = pgx.BeginFunc(ctx, c.db, func(tx pgx.Tx) error {
		linked, err := c.linkDerivedMedia(ctx, tx, productID, links)
		if err != nil {
			return err
		}
		for group, entities := range linked {
			byGroup[group].Linked = int64(len(entities))
			result.EntitiesLinked += int64(len(entities))
			result.Entities[group] = entities
		}
		if mode == DerivedModeVerify {
			if err := countVisibleDerivedMedia(ctx, tx, linked, byGroup); err != nil {
				return err
			}
			return errDerivedVerifyRollback
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_published_source_dependencies()`); err != nil {
			return fmt.Errorf("refresh published source dependencies: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_media_previews($1)`, productID); err != nil {
			return fmt.Errorf("refresh library media previews: %w", err)
		}
		if _, err := tx.Exec(ctx, `SELECT refresh_catalog_library_media_coverage($1)`, productID); err != nil {
			return fmt.Errorf("refresh library media coverage: %w", err)
		}
		return nil
	})
	if errors.Is(err, errDerivedVerifyRollback) {
		err = nil
	}
	return result, err
}

// errDerivedVerifyRollback ends a transaction that must not commit.
var errDerivedVerifyRollback = errors.New("derived media transaction rolled back")

func (c *Cache) planDerivedMedia(ctx context.Context, productID int16, groups []string) ([]derivedPlanRow, error) {
	entityTypes := make([]string, 0, len(groups))
	tables := make([]string, 0)
	for _, group := range groups {
		entityTypes = append(entityTypes, derivedGroupEntityTypes[group])
		tables = append(tables, derivedGroupTables[group]...)
	}
	var plan []derivedPlanRow
	// The plan only writes temporary tables; the transaction is always rolled
	// back so planning leaves the catalog untouched.
	err := pgx.BeginFunc(ctx, c.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SET LOCAL max_parallel_workers_per_gather=0; SET LOCAL jit=off`); err != nil {
			return fmt.Errorf("configure derived media plan: %w", err)
		}
		// Targets are published library records with no image of their own:
		// no cached or remote media (remote rows belong to the cache worker)
		// and no icon mapping (SeedOfficialIcons owns those).
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE derived_media_targets ON COMMIT DROP AS
			SELECT entity.id AS entity_id,entity.entity_type,entity.external_id,
				published.id AS version_id,published.build_id,build.build_number,published.payload
			FROM game_entities entity
			JOIN game_entity_versions published ON published.id=entity.published_version_id
			JOIN game_builds build ON build.id=published.build_id
			WHERE entity.product_id=$1 AND entity.deleted_at IS NULL AND entity.entity_type=ANY($2::text[])
			  AND NOT EXISTS (
				SELECT 1 FROM catalog_entity_media media
				WHERE media.entity_id=entity.id AND media.cache_status IN ('cached','remote')
			  )
			  AND NOT EXISTS (
				SELECT 1 FROM catalog_entity_icons icon
				WHERE icon.build_id=published.build_id AND icon.entity_type=entity.entity_type
				  AND icon.external_id=entity.external_id
			  )`, productID, entityTypes); err != nil {
			return fmt.Errorf("stage derived media targets: %w", err)
		}
		if _, err := tx.Exec(ctx, `ANALYZE derived_media_targets`); err != nil {
			return fmt.Errorf("analyze derived media targets: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE derived_db2_builds ON COMMIT DROP AS
			SELECT source.table_name,build.id AS build_id,build.build_number
			FROM game_builds build
			CROSS JOIN unnest($2::text[]) AS source(table_name)
			WHERE build.product_id=$1 AND EXISTS (
				SELECT 1 FROM catalog_db2_rows row
				WHERE row.build_id=build.id AND row.table_name=source.table_name AND row.locale='en_US'
			)`, productID, tables); err != nil {
			return fmt.Errorf("find derived media DB2 builds: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			CREATE TEMP TABLE derived_media_candidates(
				group_key text NOT NULL,
				entity_id uuid NOT NULL,
				priority integer NOT NULL,
				media_kind text NOT NULL,
				icon_name text,
				file_data_id bigint,
				source_url text,
				evidence jsonb NOT NULL
			) ON COMMIT DROP`); err != nil {
			return fmt.Errorf("create derived media candidates: %w", err)
		}
		for _, group := range groups {
			statement := derivedGroupSQL[group]
			var args []any
			if strings.Contains(statement, "$1") {
				args = append(args, productID)
			}
			if _, err := tx.Exec(ctx, statement, args...); err != nil {
				return fmt.Errorf("plan derived media group %s: %w", group, err)
			}
		}
		// A FileDataID listed in wow-listfile has an icon name, which lets the
		// official render and the filename mirror serve it before CASC.
		if _, err := tx.Exec(ctx, `
			UPDATE derived_media_candidates SET file_data_id=NULL WHERE file_data_id<=0;
			UPDATE derived_media_candidates candidate
			SET icon_name=regexp_replace(regexp_replace(lower(asset.icon_name),'[[:space:]]+','','g'),'_+','_','g')
			FROM catalog_file_assets asset
			WHERE candidate.icon_name IS NULL AND candidate.media_kind='icon'
			  AND asset.file_data_id=candidate.file_data_id AND asset.icon_name IS NOT NULL;
			UPDATE derived_media_candidates SET icon_name=lower(icon_name) WHERE icon_name IS NOT NULL;
			UPDATE derived_media_candidates SET icon_name=NULL WHERE icon_name !~ '^[a-z0-9_]+$'`); err != nil {
			return fmt.Errorf("resolve derived media icon names: %w", err)
		}
		rows, err := tx.Query(ctx, `
			WITH candidates AS (
				SELECT candidate.*,target.entity_type,target.external_id,target.build_id,
					CASE WHEN candidate.source_url IS NOT NULL THEN 'url:'||candidate.source_url
						WHEN candidate.icon_name IS NOT NULL THEN 'icon:'||candidate.icon_name
						WHEN candidate.file_data_id IS NOT NULL THEN 'fdid:'||candidate.media_kind||':'||candidate.file_data_id
					END AS asset_ref
				FROM derived_media_candidates candidate
				JOIN derived_media_targets target ON target.entity_id=candidate.entity_id
			), unique_assets AS (
				SELECT DISTINCT ON (entity_id,asset_ref) *
				FROM candidates WHERE asset_ref IS NOT NULL
				ORDER BY entity_id,asset_ref,priority,evidence::text
			), ranked AS (
				SELECT unique_assets.*,
					(row_number() OVER (PARTITION BY entity_id ORDER BY priority,asset_ref))::int-1 AS rank
				FROM unique_assets
			)
			SELECT group_key,entity_id,entity_type,external_id,build_id,rank,media_kind,
				icon_name,file_data_id,source_url,evidence,asset_ref
			FROM ranked WHERE rank<$1
			ORDER BY rank,group_key,entity_id`, derivedMediaMaxRank)
		if err != nil {
			return fmt.Errorf("list derived media plan: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var row derivedPlanRow
			if err := rows.Scan(&row.Group, &row.EntityID, &row.EntityType, &row.ExternalID, &row.BuildID,
				&row.Rank, &row.MediaKind, &row.IconName, &row.FileDataID, &row.SourceURL,
				&row.Evidence, &row.AssetRef); err != nil {
				return fmt.Errorf("scan derived media plan: %w", err)
			}
			plan = append(plan, row)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return errDerivedVerifyRollback
	})
	if errors.Is(err, errDerivedVerifyRollback) {
		err = nil
	}
	return plan, err
}

type derivedLink struct {
	Row   derivedPlanRow
	Icon  cachedIcon
	Asset derivedAsset
}

// fetchDerivedAssets downloads alternatives rank by rank: an entity whose
// first proven image is unavailable gets its next one, and an asset shared by
// many entities is downloaded once.
func (c *Cache) fetchDerivedAssets(
	ctx context.Context,
	plan []derivedPlanRow,
	product string,
	buildVersion string,
	limit int,
	result *DerivedMediaResult,
) ([]derivedLink, error) {
	outcomes := make(map[string]derivedFetch)
	resolved := make(map[uuid.UUID]bool)
	links := make([]derivedLink, 0)
	budget := limit
	for rank := 0; rank < derivedMediaMaxRank; rank++ {
		pending := make([]derivedAsset, 0)
		queued := make(map[string]bool)
		for _, row := range plan {
			if row.Rank != rank || resolved[row.EntityID] {
				continue
			}
			if _, done := outcomes[row.AssetRef]; done || queued[row.AssetRef] {
				continue
			}
			queued[row.AssetRef] = true
			pending = append(pending, derivedAsset{
				Ref: row.AssetRef, MediaKind: row.MediaKind, IconName: row.IconName,
				FileDataID: row.FileDataID, SourceURL: row.SourceURL,
			})
		}
		if len(pending) > budget {
			result.AssetsSkipped += int64(len(pending) - budget)
			pending = pending[:budget]
		}
		budget -= len(pending)
		for outcome := range c.fetchDerivedBatch(ctx, pending, product, buildVersion) {
			outcomes[outcome.Asset.Ref] = outcome
			if outcome.Err != nil {
				result.AssetsFailed++
				if len(result.FailureSample) < officialIconFailureSampleLimit {
					result.FailureSample = append(result.FailureSample, IconFailure{Name: outcome.Asset.Ref, Error: truncateError(outcome.Err)})
				}
				continue
			}
			result.AssetsFetched++
			result.Bytes += outcome.Icon.CachedSize
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for _, row := range plan {
			if row.Rank != rank || resolved[row.EntityID] {
				continue
			}
			outcome, ok := outcomes[row.AssetRef]
			if !ok || outcome.Err != nil {
				continue
			}
			resolved[row.EntityID] = true
			links = append(links, derivedLink{Row: row, Icon: outcome.Icon, Asset: outcome.Asset})
		}
		if budget <= 0 {
			break
		}
	}
	return links, nil
}

func (c *Cache) fetchDerivedBatch(ctx context.Context, assets []derivedAsset, product, buildVersion string) <-chan derivedFetch {
	results := make(chan derivedFetch)
	jobs := make(chan derivedAsset)
	workerCount := min(derivedMediaWorkers, len(assets))
	var workers sync.WaitGroup
	workers.Add(workerCount)
	for range workerCount {
		go func() {
			defer workers.Done()
			for asset := range jobs {
				outcome := derivedFetch{Asset: asset}
				outcome.Icon, outcome.Err = c.fetchDerivedAsset(ctx, asset, product, buildVersion)
				select {
				case results <- outcome:
				case <-ctx.Done():
					return
				}
			}
		}()
	}
	go func() {
		defer close(jobs)
		for _, asset := range assets {
			select {
			case jobs <- asset:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		workers.Wait()
		close(results)
	}()
	return results
}

func (c *Cache) fetchDerivedAsset(ctx context.Context, asset derivedAsset, product, buildVersion string) (cachedIcon, error) {
	switch {
	case asset.SourceURL != nil:
		return c.fetchCreatureDisplayRender(ctx, *asset.SourceURL)
	case asset.IconName != nil:
		return c.fetchIcon(ctx, iconCandidate{Name: *asset.IconName, FileDataID: asset.FileDataID}, product, buildVersion)
	case asset.FileDataID != nil && asset.MediaKind == "icon":
		return c.fetchWagoCASCIcon(ctx, iconCandidate{FileDataID: asset.FileDataID}, product, buildVersion)
	case asset.FileDataID != nil:
		return c.fetchWagoCASCTexture(ctx, *asset.FileDataID, product, buildVersion, asset.MediaKind == "journal_button")
	default:
		return cachedIcon{}, errors.New("derived media asset has no source")
	}
}

func (c *Cache) fetchCreatureDisplayRender(ctx context.Context, sourceURL string) (cachedIcon, error) {
	if !strings.HasPrefix(sourceURL, creatureDisplayRenderOrigin) {
		return cachedIcon{}, errors.New("creature render URL is outside the official render origin")
	}
	displayID := strings.TrimSuffix(strings.TrimPrefix(sourceURL, creatureDisplayRenderOrigin), ".jpg")
	if _, err := strconv.ParseInt(displayID, 10, 64); err != nil {
		return cachedIcon{}, errors.New("creature render URL has no display ID")
	}
	key, mimeType, size, hash, err := c.fetch(ctx, sourceURL)
	if err != nil {
		return cachedIcon{}, err
	}
	picture, err := c.decodeCachedImage(key)
	if err != nil {
		return cachedIcon{}, err
	}
	model, blank := renderModelBounds(picture)
	if blank {
		// Invisible trigger and credit models render as an empty backdrop;
		// treat that as no render so the next display slot can be tried.
		return cachedIcon{}, errors.New("creature render is an empty backdrop")
	}
	render := cachedIcon{
		Source:         "blizzard_api",
		AssetKey:       "creature_display_" + displayID + "_zoom",
		ArtifactKey:    "npcs/zoom/creature-display-" + displayID + ".jpg",
		SourceURL:      sourceURL,
		SourceSize:     size,
		SourceHash:     hash,
		CacheKey:       key,
		CachedMIMEType: mimeType,
		CachedSize:     size,
		CachedHash:     hash,
		Width:          picture.Bounds().Dx(),
		Height:         picture.Bounds().Dy(),
		Conversion:     "identity",
	}
	// Library cards show a 48 px square: crop the wide backdrop to a square
	// around the model so the creature, not the empty stage, fills it.
	frame := squareFrame(model, picture.Bounds())
	if frame.Dx()*frame.Dy()*10 >= picture.Bounds().Dx()*picture.Bounds().Dy()*9 {
		return render, nil
	}
	cropped := image.NewRGBA(image.Rect(0, 0, frame.Dx(), frame.Dy()))
	draw.Draw(cropped, cropped.Bounds(), picture, frame.Min, draw.Src)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, cropped, &jpeg.Options{Quality: 92}); err != nil {
		return cachedIcon{}, fmt.Errorf("encode cropped render: %w", err)
	}
	croppedKey, croppedSize, croppedHash, err := c.cacheImageBytes(output.Bytes(), "image/jpeg")
	if err != nil {
		return cachedIcon{}, err
	}
	render.CacheKey, render.CachedSize, render.CachedHash = croppedKey, croppedSize, croppedHash
	render.Width, render.Height = frame.Dx(), frame.Dy()
	render.Conversion = "jpeg_crop_to_model"
	return render, nil
}

func (c *Cache) decodeCachedImage(key string) (image.Image, error) {
	file, err := c.root.Open(filepath.FromSlash(key))
	if err != nil {
		return nil, err
	}
	defer file.Close()
	picture, _, err := image.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("decode cached render: %w", err)
	}
	return picture, nil
}

// renderModelBounds finds the pixels that differ noticeably from the
// top-left backdrop colour. A render is blank when fewer than 0.2% of the
// sampled pixels do.
func renderModelBounds(picture image.Image) (image.Rectangle, bool) {
	bounds := picture.Bounds()
	if bounds.Empty() {
		return image.Rectangle{}, true
	}
	backdropR, backdropG, backdropB, _ := picture.At(bounds.Min.X, bounds.Min.Y).RGBA()
	const tolerance = 24 << 8
	differs := func(a, b uint32) bool { return a > b+tolerance || b > a+tolerance }
	step := max(1, min(bounds.Dx(), bounds.Dy())/150)
	sampled, distinct := 0, 0
	model := image.Rectangle{}
	for y := bounds.Min.Y; y < bounds.Max.Y; y += step {
		for x := bounds.Min.X; x < bounds.Max.X; x += step {
			r, g, b, _ := picture.At(x, y).RGBA()
			sampled++
			if differs(r, backdropR) || differs(g, backdropG) || differs(b, backdropB) {
				distinct++
				model = model.Union(image.Rect(x, y, x+step, y+step))
			}
		}
	}
	return model.Intersect(bounds), distinct*500 < sampled
}

// squareFrame returns the smallest square inside bounds that holds the model
// with an 8% margin on each side, centred on it.
func squareFrame(model, bounds image.Rectangle) image.Rectangle {
	side := max(model.Dx(), model.Dy())
	side += side * 16 / 100
	side = min(side, bounds.Dx(), bounds.Dy())
	centerX := (model.Min.X + model.Max.X) / 2
	centerY := (model.Min.Y + model.Max.Y) / 2
	minX := min(max(centerX-side/2, bounds.Min.X), bounds.Max.X-side)
	minY := min(max(centerY-side/2, bounds.Min.Y), bounds.Max.Y-side)
	return image.Rect(minX, minY, minX+side, minY+side)
}

// fetchWagoCASCTexture converts a non-icon interface texture (journal portrait
// or button) to PNG. Journal buttons sit in a power-of-two canvas with a
// transparent margin, which is trimmed so the card shows only the artwork.
func (c *Cache) fetchWagoCASCTexture(ctx context.Context, fileDataID int64, product, buildVersion string, trim bool) (cachedIcon, error) {
	sourceURL, err := wagoCASCIconURL(fileDataID, product, buildVersion)
	if err != nil {
		return cachedIcon{}, err
	}
	conversion := "blp2_to_png"
	raw, err := c.downloadWagoCASC(ctx, sourceURL)
	if err != nil {
		unpinnedURL := wagoCASCOrigin + strconv.FormatInt(fileDataID, 10)
		raw, err = c.downloadWagoCASC(ctx, unpinnedURL)
		if err != nil {
			return cachedIcon{}, err
		}
		sourceURL = unpinnedURL
		conversion = "blp2_to_png_unpinned_casc"
	}
	pngData, width, height, err := decodeBLP2PNG(raw)
	if err != nil {
		return cachedIcon{}, err
	}
	if trim {
		pngData, width, height, err = trimTransparentPNG(pngData)
		if err != nil {
			return cachedIcon{}, err
		}
		conversion += "_trimmed"
	}
	cacheKey, cachedSize, cachedHash, err := c.cacheImageBytes(pngData, "image/png")
	if err != nil {
		return cachedIcon{}, err
	}
	sourceHash := sha256.Sum256(raw)
	return cachedIcon{
		iconCandidate:  iconCandidate{FileDataID: &fileDataID},
		Source:         "wago_tools",
		AssetKey:       "wago_casc_texture_png",
		ArtifactKey:    "casc/" + buildVersion + "/" + strconv.FormatInt(fileDataID, 10) + ".blp",
		SourceURL:      sourceURL,
		SourceSize:     int64(len(raw)),
		SourceHash:     sourceHash[:],
		CacheKey:       cacheKey,
		CachedMIMEType: "image/png",
		CachedSize:     cachedSize,
		CachedHash:     cachedHash,
		Width:          width,
		Height:         height,
		Conversion:     conversion,
	}, nil
}

func trimTransparentPNG(data []byte) ([]byte, int, int, error) {
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, 0, 0, fmt.Errorf("decode PNG for trim: %w", err)
	}
	bounds := decoded.Bounds()
	visible := image.Rectangle{}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if _, _, _, alpha := decoded.At(x, y).RGBA(); alpha > 0 {
				visible = visible.Union(image.Rect(x, y, x+1, y+1))
			}
		}
	}
	if visible.Empty() {
		return nil, 0, 0, errors.New("texture is fully transparent")
	}
	if visible == bounds {
		return data, bounds.Dx(), bounds.Dy(), nil
	}
	cropped := image.NewNRGBA(image.Rect(0, 0, visible.Dx(), visible.Dy()))
	for y := 0; y < visible.Dy(); y++ {
		for x := 0; x < visible.Dx(); x++ {
			cropped.Set(x, y, decoded.At(visible.Min.X+x, visible.Min.Y+y))
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, cropped); err != nil {
		return nil, 0, 0, err
	}
	return output.Bytes(), visible.Dx(), visible.Dy(), nil
}

// linkDerivedMedia records one snapshot per build and source, one artifact
// per downloaded asset and one primary cached media row per entity.
func (c *Cache) linkDerivedMedia(ctx context.Context, tx pgx.Tx, productID int16, links []derivedLink) (map[string][]uuid.UUID, error) {
	type snapshotKey struct {
		BuildID int64
		Source  string
	}
	manifests := make(map[snapshotKey][]string)
	for _, link := range links {
		key := snapshotKey{link.Row.BuildID, link.Icon.Source}
		manifests[key] = append(manifests[key], fmt.Sprintf("%s:%x:%d", link.Icon.ArtifactKey, link.Icon.SourceHash, link.Icon.SourceSize))
	}
	snapshots := make(map[snapshotKey]uuid.UUID, len(manifests))
	keys := make([]snapshotKey, 0, len(manifests))
	for key := range manifests {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].BuildID == keys[j].BuildID {
			return keys[i].Source < keys[j].Source
		}
		return keys[i].BuildID < keys[j].BuildID
	})
	for _, key := range keys {
		lines := manifests[key]
		sort.Strings(lines)
		manifest := sha256.New()
		_, _ = fmt.Fprintf(manifest, "gildra-derived-media-manifest-v1:%s\n", key.Source)
		previous := ""
		count := 0
		for _, line := range lines {
			if line == previous {
				continue
			}
			previous = line
			count++
			_, _ = fmt.Fprintln(manifest, line)
		}
		var snapshotID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO catalog_snapshots(product_id,build_id,source,status,content_hash,metadata,validated_at,published_at)
			VALUES($1,$2,$3,'published',$4,
				jsonb_build_object('projection','derived_catalog_media','asset_count',$5::int),now(),now())
			ON CONFLICT(product_id,build_id,source,content_hash) WHERE content_hash IS NOT NULL
			DO UPDATE SET metadata=EXCLUDED.metadata,validated_at=now(),published_at=now()
			RETURNING id`, productID, key.BuildID, key.Source, hex.EncodeToString(manifest.Sum(nil)), count).Scan(&snapshotID); err != nil {
			return nil, fmt.Errorf("create derived media snapshot: %w", err)
		}
		snapshots[key] = snapshotID
	}

	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE derived_media_seed(
			media_id uuid PRIMARY KEY,
			group_key text NOT NULL,
			entity_id uuid NOT NULL UNIQUE,
			entity_type text NOT NULL,
			external_id bigint NOT NULL,
			build_id bigint NOT NULL,
			snapshot_id uuid NOT NULL,
			media_kind text NOT NULL,
			source text NOT NULL,
			asset_key text NOT NULL,
			artifact_key text NOT NULL,
			source_url text NOT NULL,
			file_data_id bigint,
			source_byte_size bigint NOT NULL,
			source_content_hash bytea NOT NULL,
			cache_key text NOT NULL,
			cached_mime_type text NOT NULL,
			cached_byte_size bigint NOT NULL,
			cached_content_hash bytea NOT NULL,
			width integer NOT NULL,
			height integer NOT NULL,
			attributes jsonb NOT NULL,
			artifact_id uuid
		) ON COMMIT DROP`); err != nil {
		return nil, fmt.Errorf("create derived media seed table: %w", err)
	}
	seedRows := make([][]any, 0, len(links))
	for _, link := range links {
		var evidence map[string]any
		if err := json.Unmarshal(link.Row.Evidence, &evidence); err != nil {
			return nil, fmt.Errorf("decode derived media evidence: %w", err)
		}
		attributes := map[string]any{
			"discovery": "derived_" + link.Row.Group, "evidence": evidence,
			"conversion": link.Icon.Conversion, "rank": link.Row.Rank,
		}
		if link.Asset.IconName != nil {
			attributes["icon_name"] = *link.Asset.IconName
		}
		fileDataID := link.Asset.FileDataID
		if fileDataID == nil {
			fileDataID = link.Icon.FileDataID
		}
		if fileDataID != nil {
			attributes["file_data_id"] = *fileDataID
		}
		encoded, err := json.Marshal(attributes)
		if err != nil {
			return nil, err
		}
		seedRows = append(seedRows, []any{
			uuid.New(), link.Row.Group, link.Row.EntityID, link.Row.EntityType, link.Row.ExternalID,
			link.Row.BuildID, snapshots[snapshotKey{link.Row.BuildID, link.Icon.Source}], link.Row.MediaKind,
			link.Icon.Source, link.Icon.AssetKey, link.Icon.ArtifactKey, link.Icon.SourceURL, fileDataID,
			link.Icon.SourceSize, link.Icon.SourceHash, link.Icon.CacheKey, link.Icon.CachedMIMEType,
			link.Icon.CachedSize, link.Icon.CachedHash, link.Icon.Width, link.Icon.Height, string(encoded),
		})
	}
	if copied, err := tx.CopyFrom(ctx, pgx.Identifier{"derived_media_seed"}, []string{
		"media_id", "group_key", "entity_id", "entity_type", "external_id", "build_id", "snapshot_id",
		"media_kind", "source", "asset_key", "artifact_key", "source_url", "file_data_id",
		"source_byte_size", "source_content_hash", "cache_key", "cached_mime_type",
		"cached_byte_size", "cached_content_hash", "width", "height", "attributes",
	}, pgx.CopyFromRows(seedRows)); err != nil {
		return nil, fmt.Errorf("stage derived media: %w", err)
	} else if copied != int64(len(seedRows)) {
		return nil, fmt.Errorf("stage derived media: copied %d of %d", copied, len(seedRows))
	}
	if _, err := tx.Exec(ctx, `
		WITH upserted AS (
			INSERT INTO catalog_source_artifacts(
				snapshot_id,build_id,source,artifact_key,locale,source_url,
				content_hash,byte_size,status,metadata,fetched_at
			)
			SELECT DISTINCT ON (seed.snapshot_id,seed.artifact_key)
				seed.snapshot_id,seed.build_id,seed.source,seed.artifact_key,'',seed.source_url,
				seed.source_content_hash,seed.source_byte_size,'ready',jsonb_build_object(
					'projection','derived_catalog_media','file_data_id',seed.file_data_id,
					'conversion',seed.attributes->>'conversion'
				),now()
			FROM derived_media_seed seed
			ORDER BY seed.snapshot_id,seed.artifact_key,seed.media_id
			ON CONFLICT(snapshot_id,artifact_key,locale)
			DO UPDATE SET source_url=EXCLUDED.source_url,byte_size=EXCLUDED.byte_size,
				content_hash=EXCLUDED.content_hash,status='ready',metadata=EXCLUDED.metadata,fetched_at=now()
			RETURNING id,snapshot_id,artifact_key
		)
		UPDATE derived_media_seed seed SET artifact_id=upserted.id
		FROM upserted WHERE upserted.snapshot_id=seed.snapshot_id AND upserted.artifact_key=seed.artifact_key`); err != nil {
		return nil, fmt.Errorf("record derived media provenance: %w", err)
	}
	rows, err := tx.Query(ctx, `
		INSERT INTO catalog_entity_media(
			id,build_id,entity_id,entity_type,external_id,media_kind,asset_key,locale,
			source,source_url,cached_url,file_data_id,content_hash,mime_type,width,height,
			cache_status,source_artifact_id,is_primary,attributes,cache_key,
			cached_content_hash,cached_byte_size,cached_at,cache_error
		)
		SELECT seed.media_id,seed.build_id,seed.entity_id,seed.entity_type,seed.external_id,
			seed.media_kind,seed.asset_key,'',seed.source,seed.source_url,
			$1 || '/v1/media/' || seed.media_id::text,seed.file_data_id,seed.source_content_hash,
			seed.cached_mime_type,seed.width,seed.height,'cached',seed.artifact_id,true,seed.attributes,
			seed.cache_key,seed.cached_content_hash,seed.cached_byte_size,now(),''
		FROM derived_media_seed seed
		-- Another seeder may have linked an image meanwhile; never add a
		-- second one beside it.
		WHERE NOT EXISTS (
			SELECT 1 FROM catalog_entity_media existing
			WHERE existing.entity_id=seed.entity_id AND existing.cache_status IN ('cached','remote')
		)
		ON CONFLICT ON CONSTRAINT catalog_entity_media_observation_unique DO NOTHING
		RETURNING entity_id`,
		c.publicBase)
	if err != nil {
		return nil, fmt.Errorf("link derived media: %w", err)
	}
	defer rows.Close()
	groups := make(map[uuid.UUID]string, len(links))
	for _, link := range links {
		groups[link.Row.EntityID] = link.Row.Group
	}
	linked := make(map[string][]uuid.UUID)
	for rows.Next() {
		var entityID uuid.UUID
		if err := rows.Scan(&entityID); err != nil {
			return nil, fmt.Errorf("scan derived media link: %w", err)
		}
		linked[groups[entityID]] = append(linked[groups[entityID]], entityID)
	}
	return linked, rows.Err()
}

// countVisibleDerivedMedia applies the public API's image selection
// (catalog.Service.cachedIconURLs) to the linked entities.
func countVisibleDerivedMedia(ctx context.Context, tx pgx.Tx, linked map[string][]uuid.UUID, byGroup map[string]*DerivedGroupResult) error {
	for group, entities := range linked {
		var visible int64
		if err := tx.QueryRow(ctx, `
			SELECT count(DISTINCT media.entity_id)
			FROM catalog_entity_media media
			JOIN game_entities entity ON entity.id=media.entity_id
			JOIN game_entity_versions published ON published.id=entity.published_version_id
			JOIN game_builds published_build ON published_build.id=published.build_id
			  AND published_build.product_id=entity.product_id
			JOIN game_builds media_build ON media_build.id=media.build_id
			  AND media_build.product_id=entity.product_id
			JOIN catalog_source_artifacts artifact ON artifact.id=media.source_artifact_id
			JOIN catalog_published_source_dependencies dependency ON dependency.source=media.source
			WHERE media.entity_id=ANY($1::uuid[])
			  AND media.cache_status='cached' AND NULLIF(media.cached_url,'') IS NOT NULL
			  AND media.cached_content_hash IS NOT NULL AND media.cached_byte_size IS NOT NULL
			  AND artifact.status='ready' AND artifact.content_hash IS NOT NULL
			  AND artifact.byte_size IS NOT NULL
			  AND media_build.build_number<=published_build.build_number`, entities).Scan(&visible); err != nil {
			return fmt.Errorf("count visible derived media: %w", err)
		}
		byGroup[group].Visible = visible
	}
	return nil
}
