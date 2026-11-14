package catalogtaxonomy

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// RebuildAchievements is a source-only projection: no network calls and no
// writes to published/rollback builds. The normal tooltip and graph stages
// also invoke it, so a graph rebuild cannot discard achievement relationships.
func (i *Indexer) RebuildAchievements(ctx context.Context) (Result, error) {
	var result Result
	err := i.projectionTransaction(ctx, func(tx pgx.Tx) error { var err error; result, err = rebuildAchievements(ctx, tx); return err })
	return result, err
}
func rebuildAchievements(ctx context.Context, tx pgx.Tx) (Result, error) {
	var result Result
	rows, err := tx.Query(ctx, `SELECT id,product_id FROM game_builds WHERE id IN (`+projectionBuilds+`) ORDER BY build_number,id`)
	if err != nil {
		return result, err
	}
	type build struct {
		id      int64
		product int16
	}
	var builds []build
	for rows.Next() {
		var b build
		if err := rows.Scan(&b.id, &b.product); err != nil {
			rows.Close()
			return result, err
		}
		builds = append(builds, b)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for _, b := range builds {
		r, err := projectAchievementBuild(ctx, tx, b.id, b.product)
		if err != nil {
			return result, fmt.Errorf("project achievements build %d: %w", b.id, err)
		}
		result.Tooltips += r.Tooltips
		result.Links += r.Links
		result.Categories += r.Categories
		result.Assignments += r.Assignments
	}
	return result, nil
}
func loadAchievementSource(ctx context.Context, tx pgx.Tx, buildID int64) (*achievementSource, error) {
	s := newAchievementSource()
	rows, err := tx.Query(ctx, `SELECT table_name,row_id,locale,payload,COALESCE(source_artifact_id::text,'') FROM catalog_db2_rows WHERE build_id=$1 AND table_name IN ('Achievement','Achievement_Category','CriteriaTree','Criteria') AND locale IN ('en_US','ru_RU')`, buildID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var table string
		var row achievementRaw
		if err := rows.Scan(&table, &row.ID, &row.Locale, &row.Fields, &row.Artifact); err != nil {
			return nil, err
		}
		s.add(table, row)
	}
	s.index()
	return s, rows.Err()
}

type achievementVersion struct {
	ID, Entity, SourceURL string
	ExternalID            int64
	Payload               achievementFields
}
type achievementLink struct {
	Target, Relation string
	Nodes            []int64
}

func projectAchievementBuild(ctx context.Context, tx pgx.Tx, buildID int64, productID int16) (Result, error) {
	var result Result
	source, err := loadAchievementSource(ctx, tx, buildID)
	if err != nil {
		return result, err
	}
	if len(source.rows["Achievement"]) == 0 {
		return result, nil
	}
	rows, err := tx.Query(ctx, `SELECT v.id::text,e.id::text,e.external_id,COALESCE(v.source_url,''),v.payload FROM game_entities e JOIN game_entity_versions v ON v.id=e.latest_version_id WHERE e.product_id=$1 AND e.entity_type='achievement' AND e.deleted_at IS NULL AND v.build_id=$2`, productID, buildID)
	if err != nil {
		return result, err
	}
	var versions []achievementVersion
	for rows.Next() {
		var v achievementVersion
		if err := rows.Scan(&v.ID, &v.Entity, &v.ExternalID, &v.SourceURL, &v.Payload); err != nil {
			rows.Close()
			return result, err
		}
		versions = append(versions, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	if len(versions) == 0 {
		return result, nil
	}
	nextIDs := map[int64][]int64{}
	for id, locales := range source.rows["Achievement"] {
		if previous := locales["en_US"].Fields.number("Supercedes"); previous > 0 {
			nextIDs[previous] = append(nextIDs[previous], id)
		}
	}
	wanted := map[achievementTargetKey]bool{}
	for _, locales := range source.rows["Criteria"] {
		r := locales["en_US"]
		kind := achievementCriterionTarget(r.Fields.number("Type"))
		if kind != "" && r.Fields.number("Asset") > 0 {
			wanted[achievementTargetKey{kind, r.Fields.number("Asset")}] = true
		}
	}
	for id, locales := range source.rows["Achievement"] {
		r := locales["en_US"]
		wanted[achievementTargetKey{"achievement", id}] = true
		for field, kind := range map[string]string{"RewardItemID": "item", "RewardTitleID": "title", "RewardMountID": "mount", "RewardSpellID": "spell"} {
			if n := r.Fields.number(field); n > 0 {
				wanted[achievementTargetKey{kind, n}] = true
			}
		}
	}
	// RewardItemID -> ItemXItemEffect -> ItemEffect.SpellID -> Mount.SourceSpellID.
	// No matching on translated reward names, and no guessing from an item ID.
	mountRewards := map[int64][]int64{}
	rewardArtifacts := map[int64][]string{}
	rewardRows, err := tx.Query(ctx, `WITH rewards AS MATERIALIZED (SELECT row_id,(payload->>'RewardItemID')::bigint item_id FROM catalog_db2_rows WHERE build_id=$1 AND table_name='Achievement' AND locale='en_US' AND payload->>'RewardItemID' ~ '^[1-9][0-9]*$'), item_spells AS MATERIALIZED (
 SELECT (x.payload->>'ItemID')::bigint item_id,(effect.payload->>'SpellID')::bigint spell_id,x.source_artifact_id x_artifact,effect.source_artifact_id effect_artifact
 FROM catalog_db2_rows x JOIN catalog_db2_rows effect ON effect.build_id=x.build_id AND effect.table_name='ItemEffect' AND effect.locale='en_US' AND effect.row_id=(x.payload->>'ItemEffectID')::bigint
 WHERE x.build_id=$1 AND x.table_name='ItemXItemEffect' AND x.locale='en_US'
 ) SELECT DISTINCT reward.row_id,mount.row_id,array_remove(ARRAY[item_spells.x_artifact::text,item_spells.effect_artifact::text,mount.source_artifact_id::text],NULL) FROM rewards reward JOIN item_spells ON item_spells.item_id=reward.item_id JOIN catalog_db2_rows mount ON mount.build_id=$1 AND mount.table_name='Mount' AND mount.locale='en_US' AND (mount.payload->>'SourceSpellID')::bigint=item_spells.spell_id`, buildID)
	if err != nil {
		return result, err
	}
	for rewardRows.Next() {
		var achievement, mount int64
		var artifacts []string
		if err := rewardRows.Scan(&achievement, &mount, &artifacts); err != nil {
			rewardRows.Close()
			return result, err
		}
		if !slices.Contains(mountRewards[achievement], mount) {
			mountRewards[achievement] = append(mountRewards[achievement], mount)
		}
		rewardArtifacts[achievement] = append(rewardArtifacts[achievement], artifacts...)
		wanted[achievementTargetKey{"mount", mount}] = true
	}
	err = rewardRows.Err()
	rewardRows.Close()
	if err != nil {
		return result, err
	}
	keys := make([]achievementTargetKey, 0, len(wanted))
	for key := range wanted {
		keys = append(keys, key)
	}
	encoded, err := json.Marshal(keys)
	if err != nil {
		return result, err
	}
	refs := map[achievementTargetKey]map[string]achievementReference{}
	targetRows, err := tx.Query(ctx, `SELECT e.id::text,e.entity_type,e.external_id,locale.locale,COALESCE(NULLIF(l.slug,''),en.slug,e.canonical_slug,''),COALESCE(NULLIF(l.name,''),en.name,''),COALESCE(NULLIF(l.description,''),en.description,''),CASE WHEN NULLIF(l.name,'') IS NOT NULL THEN locale.locale ELSE 'en_US' END,CASE WHEN NULLIF(l.description,'') IS NOT NULL THEN locale.locale ELSE 'en_US' END
 FROM jsonb_to_recordset($1::jsonb) wanted(type text,id bigint)
 JOIN game_entities e ON e.product_id=$2 AND e.entity_type=wanted.type AND e.external_id=wanted.id AND e.deleted_at IS NULL
 JOIN LATERAL (SELECT v.id FROM game_entity_versions v WHERE v.entity_id=e.id AND v.build_id=$3 ORDER BY v.revision DESC LIMIT 1) v ON true
 CROSS JOIN (VALUES ('en_US'),('ru_RU')) locale(locale)
 LEFT JOIN game_entity_localizations l ON l.version_id=v.id AND l.locale=locale.locale
 LEFT JOIN game_entity_localizations en ON en.version_id=v.id AND en.locale='en_US'`, encoded, productID, buildID)
	if err != nil {
		return result, err
	}
	for targetRows.Next() {
		var ref achievementReference
		var locale string
		if err := targetRows.Scan(&ref.ID, &ref.Type, &ref.ExternalID, &locale, &ref.Slug, &ref.Name, &ref.Description, &ref.NameLocale, &ref.DescriptionLocale); err != nil {
			targetRows.Close()
			return result, err
		}
		key := achievementTargetKey{ref.Type, ref.ExternalID}
		if refs[key] == nil {
			refs[key] = map[string]achievementReference{}
		}
		refs[key][locale] = ref
	}
	err = targetRows.Err()
	targetRows.Close()
	if err != nil {
		return result, err
	}
	definitions := []Definition{{EntityType: "achievement", Facet: "group", Slug: "categorys", Path: "categorys", NameEN: "Achievement categories", NameRU: "Категории достижений"}}
	for id, locales := range source.rows["Achievement_Category"] {
		en, ok := locales["en_US"]
		if !ok {
			continue
		}
		chain, err := source.categoryChain(id)
		if err != nil {
			return result, err
		}
		parent := "categorys"
		if len(chain) > 1 {
			parent = achievementCategoryPath(chain[1])
		}
		ru := locales["ru_RU"].Fields.text("Name_lang")
		if ru == "" {
			ru = en.Fields.text("Name_lang")
		}
		definitions = append(definitions, Definition{EntityType: "achievement", Facet: "category", Slug: fmt.Sprintf("category-%d", id), Path: achievementCategoryPath(id), ParentPath: parent, NameEN: en.Fields.text("Name_lang"), NameRU: ru, SortOrder: int16(en.Fields.number("Ui_order")), Attributes: map[string]any{"field": "Category", "value": id, "parent": en.Fields.number("Parent")}})
	}
	categoryIDs, err := upsertDefinitions(ctx, tx, productID, definitions)
	if err != nil {
		return result, err
	}
	result.Categories = int64(len(categoryIDs))
	if _, err := tx.Exec(ctx, `CREATE TEMP TABLE achievement_tooltip_stage(version_id uuid,locale text,plain_text text,blocks jsonb,source_url text) ON COMMIT DROP;
 CREATE TEMP TABLE achievement_link_stage(source_entity_id uuid,target_entity_id uuid,build_id bigint,relation_type text,attributes jsonb) ON COMMIT DROP;
 CREATE TEMP TABLE achievement_category_stage(version_id uuid,category_id bigint) ON COMMIT DROP;
 CREATE TEMP TABLE achievement_artifact_stage(version_id uuid,source_artifact_id uuid) ON COMMIT DROP;`); err != nil {
		return result, err
	}
	var tooltipRows, linkRows, categoryRows, artifactRows [][]any
	for _, v := range versions {
		en, ok := source.get("Achievement", v.ExternalID, "en_US")
		if !ok {
			continue
		}
		artifacts := map[string]bool{}
		for _, artifact := range rewardArtifacts[v.ExternalID] {
			artifacts[artifact] = true
		}
		links := map[string]*achievementLink{}
		addLink := func(ref achievementReference, relation string, node int64) {
			key := relation + ":" + ref.ID
			l := links[key]
			if l == nil {
				l = &achievementLink{Target: ref.ID, Relation: relation}
				links[key] = l
			}
			if node > 0 {
				l.Nodes = append(l.Nodes, node)
			}
		}
		root, err := source.criteriaRoot(v.ExternalID, map[int64]bool{})
		if err != nil {
			return result, err
		}
		chain, err := source.categoryChain(en.Fields.number("Category"))
		if err != nil {
			return result, err
		}
		for _, id := range chain {
			categoryRows = append(categoryRows, []any{v.ID, categoryIDs[categoryKey("achievement", achievementCategoryPath(id))]})
		}
		categoryRows = append(categoryRows, []any{v.ID, categoryIDs[categoryKey("achievement", "categorys")]})
		for _, locale := range []string{"en_US", "ru_RU"} {
			localized, ok := source.get("Achievement", v.ExternalID, locale)
			if !ok {
				continue
			}
			if localized.Artifact != "" {
				artifacts[localized.Artifact] = true
			}
			tree, err := source.tree(root, locale, refs, artifacts, map[int64]bool{})
			if err != nil {
				return result, err
			}
			var visit func(*achievementCriterion)
			visit = func(n *achievementCriterion) {
				if n == nil {
					return
				}
				if n.Target != nil && locale == "en_US" {
					addLink(*n.Target, "achievement_criteria", n.ID)
				}
				for _, child := range n.Children {
					visit(child)
				}
			}
			visit(tree)
			rewards := []achievementReference{}
			for field, kind := range map[string]string{"RewardItemID": "item", "RewardTitleID": "title", "RewardMountID": "mount", "RewardSpellID": "spell"} {
				if ref, exists := refs[achievementTargetKey{kind, en.Fields.number(field)}][locale]; exists {
					rewards = append(rewards, ref)
					if locale == "en_US" {
						addLink(ref, "achievement_reward", 0)
					}
				}
			}
			for _, id := range mountRewards[v.ExternalID] {
				if ref, exists := refs[achievementTargetKey{"mount", id}][locale]; exists {
					rewards = append(rewards, ref)
					if locale == "en_US" {
						addLink(ref, "achievement_reward", 0)
					}
				}
			}
			sort.Slice(rewards, func(i, j int) bool {
				if rewards[i].Type != rewards[j].Type {
					return rewards[i].Type < rewards[j].Type
				}
				return rewards[i].ExternalID < rewards[j].ExternalID
			})
			info := map[string]any{"type": "achievement_info", "points": en.Fields.number("Points"), "faction": achievementSide(en.Fields.number("Faction")), "account_wide": en.Fields.number("Flags")&0x20000 != 0, "reward_text": localized.Fields.text("Reward_lang"), "rewards": rewards, "criteria": tree}
			if previous, exists := refs[achievementTargetKey{"achievement", en.Fields.number("Supercedes")}][locale]; exists {
				info["previous"] = previous
				if locale == "en_US" {
					addLink(previous, "achievement_supersedes", 0)
				}
			}
			next := []achievementReference{}
			// Reverse lookup comes from Supercedes, not numerical achievement IDs.
			for _, other := range nextIDs[v.ExternalID] {
				if ref, exists := refs[achievementTargetKey{"achievement", other}][locale]; exists {
					next = append(next, ref)
				}
			}
			sort.Slice(next, func(i, j int) bool { return next[i].ExternalID < next[j].ExternalID })
			info["next"] = next
			cats := []map[string]any{}
			for _, id := range chain {
				cat, _ := source.get("Achievement_Category", id, locale)
				if cat.Fields == nil {
					cat, _ = source.get("Achievement_Category", id, "en_US")
				}
				if cat.Artifact != "" {
					artifacts[cat.Artifact] = true
				}
				cats = append(cats, map[string]any{"id": id, "name": cat.Fields.text("Name_lang"), "path": achievementCategoryPath(id), "parent_id": cat.Fields.number("Parent")})
			}
			info["categories"] = cats
			blocks := []any{map[string]any{"type": "name", "text": localized.Fields.text("Title_lang")}}
			if description := localized.Fields.text("Description_lang"); description != "" {
				blocks = append(blocks, map[string]any{"type": "description", "text": description})
			}
			blocks = append(blocks, info)
			blockJSON, err := json.Marshal(blocks)
			if err != nil {
				return result, err
			}
			plain := strings.Join([]string{localized.Fields.text("Title_lang"), localized.Fields.text("Description_lang"), achievementTreeText(tree), localized.Fields.text("Reward_lang")}, "\n")
			tooltipRows = append(tooltipRows, []any{v.ID, locale, plain, blockJSON, v.SourceURL})
		}
		for _, l := range links {
			sort.Slice(l.Nodes, func(i, j int) bool { return l.Nodes[i] < l.Nodes[j] })
			attrs, err := json.Marshal(map[string]any{"source": "db2_achievement", "criteria_tree_ids": l.Nodes})
			if err != nil {
				return result, err
			}
			linkRows = append(linkRows, []any{v.Entity, l.Target, buildID, l.Relation, attrs})
		}
		for artifact := range artifacts {
			artifactRows = append(artifactRows, []any{v.ID, artifact})
		}
	}
	for _, stage := range []struct {
		name    string
		columns []string
		rows    [][]any
	}{
		{"achievement_tooltip_stage", []string{"version_id", "locale", "plain_text", "blocks", "source_url"}, tooltipRows},
		{"achievement_link_stage", []string{"source_entity_id", "target_entity_id", "build_id", "relation_type", "attributes"}, linkRows},
		{"achievement_category_stage", []string{"version_id", "category_id"}, categoryRows},
		{"achievement_artifact_stage", []string{"version_id", "source_artifact_id"}, artifactRows},
	} {
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{stage.name}, stage.columns, pgx.CopyFromRows(stage.rows)); err != nil {
			return result, err
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO catalog_entity_tooltips(version_id,locale,plain_text,blocks,content_hash,source_url)
 SELECT version_id,locale,plain_text,blocks,digest(convert_to(plain_text||blocks::text,'UTF8'),'sha256'),source_url FROM achievement_tooltip_stage
 ON CONFLICT(version_id,locale) DO UPDATE SET plain_text=EXCLUDED.plain_text,blocks=EXCLUDED.blocks,content_hash=EXCLUDED.content_hash,source_url=EXCLUDED.source_url,generated_at=now();
 DELETE FROM game_entity_links WHERE build_id=$1 AND attributes->>'source'='db2_achievement';
 INSERT INTO game_entity_links(source_entity_id,target_entity_id,build_id,relation_type,attributes) SELECT * FROM achievement_link_stage ON CONFLICT DO NOTHING;
 DELETE FROM game_entity_categories c USING game_entity_versions v,game_entities e WHERE c.version_id=v.id AND v.entity_id=e.id AND v.build_id=$1 AND e.entity_type='achievement' AND c.source='gildra_classifier';
 INSERT INTO game_entity_categories(version_id,category_id,source,confidence) SELECT DISTINCT version_id,category_id,'gildra_classifier',1 FROM achievement_category_stage ON CONFLICT DO NOTHING;
 INSERT INTO catalog_entity_version_artifacts(version_id,source_artifact_id) SELECT DISTINCT version_id,source_artifact_id FROM achievement_artifact_stage ON CONFLICT DO NOTHING;
 DROP TABLE achievement_tooltip_stage,achievement_link_stage,achievement_category_stage,achievement_artifact_stage;`, pgx.QueryExecModeSimpleProtocol, buildID)
	if err != nil {
		return result, err
	}
	result.Tooltips = int64(len(tooltipRows))
	result.Links = int64(len(linkRows))
	result.Assignments = int64(len(categoryRows))
	return result, nil
}
