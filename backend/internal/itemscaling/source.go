package itemscaling

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type db2Table struct {
	Name      string
	KeyColumn string
}

// ItemSquishEra precedes CurvePoint: only the curves an era names are kept.
var db2Tables = []db2Table{
	{TableRandPropPoints, "ID"},
	{TableDamageAmmo, "ItemLevel"}, {TableDamageOneHand, "ItemLevel"}, {TableDamageOneHandCaster, "ItemLevel"},
	{TableDamageTwoHand, "ItemLevel"}, {TableDamageTwoHandCaster, "ItemLevel"},
	{TableArmorQuality, "ID"}, {TableArmorTotal, "ItemLevel"}, {TableArmorShield, "ItemLevel"},
	{TableArmorLocation, "ID"}, {TableSquishEra, "ID"}, {TableCurvePoint, "ID"},
}

type gameTable struct {
	Name       string
	FileDataID int
}

// Client game tables (gametables/*.txt) by file data id.
var gameTables = []gameTable{
	{TableCombatRatingsMult, 1391670}, {TableStaminaMult, 1980632},
	{TableSocketCost, 1391643}, {TableSpellScaling, 1391660},
}

// SparseColumns are the ItemSparse columns the formulas read.
var SparseColumns = func() []string {
	columns := []string{"ItemLevel", "ItemSquishEraID", "PlayerLevelToItemLevelCurveID", "OverallQualityID", "InventoryType", "Flags_1", "ItemDelay", "DmgVariance"}
	for slot := 0; slot < 10; slot++ {
		index := strconv.Itoa(slot)
		columns = append(columns, "StatModifier_bonusStat_"+index, "StatPercentEditor_"+index, "StatPercentageOfSocket_"+index)
	}
	return columns
}()

// ItemFromPayloads reads an Item from its ItemSparse and Item rows. It reports
// false when a field the formulas depend on is absent or malformed.
func ItemFromPayloads(sparse, registry func(column string) string) (Item, bool) {
	ok := true
	float := func(get func(string) string, column string) float64 {
		value, err := strconv.ParseFloat(strings.TrimSpace(get(column)), 64)
		if err != nil {
			ok = false
		}
		return value
	}
	item := Item{
		ClassID:        int(float(registry, "ClassID")),
		SubclassID:     int(float(registry, "SubclassID")),
		InventoryType:  int(float(sparse, "InventoryType")),
		Quality:        int(float(sparse, "OverallQualityID")),
		ItemLevel:      int(float(sparse, "ItemLevel")),
		SquishEra:      int(float(sparse, "ItemSquishEraID")),
		LevelCurve:     int(float(sparse, "PlayerLevelToItemLevelCurveID")),
		Flags1:         int64(float(sparse, "Flags_1")),
		DelayMS:        int(float(sparse, "ItemDelay")),
		DamageVariance: float(sparse, "DmgVariance"),
	}
	for slot := range item.Stats {
		index := strconv.Itoa(slot)
		item.Stats[slot] = StatSlot{
			Type:       int(float(sparse, "StatModifier_bonusStat_"+index)),
			Allocation: float(sparse, "StatPercentEditor_"+index),
			SocketCost: float(sparse, "StatPercentageOfSocket_"+index),
		}
	}
	return item, ok
}

// parseGameTable reads a tab-separated client game table; the first column is
// the row key (level or item level).
func parseGameTable(name string, data []byte) ([]Row, error) {
	lines := strings.Split(strings.ReplaceAll(string(bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))), "\r", ""), "\n")
	if len(lines) < 2 {
		return nil, fmt.Errorf("game table %s is empty", name)
	}
	headers := strings.Split(lines[0], "\t")
	var rows []Row
	for _, line := range lines[1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) != len(headers) {
			return nil, fmt.Errorf("game table %s: row %q has %d fields, header has %d", name, fields[0], len(fields), len(headers))
		}
		key, err := strconv.ParseInt(strings.TrimSpace(fields[0]), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("game table %s: row key %q", name, fields[0])
		}
		payload := make(map[string]string, len(headers)-1)
		for index := 1; index < len(headers); index++ {
			payload[strings.TrimSpace(headers[index])] = strings.TrimSpace(fields[index])
		}
		rows = append(rows, Row{Table: name, Key: key, Payload: payload})
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("game table %s has no rows", name)
	}
	return rows, nil
}

// Proof identifies the exact source bytes a stored table was read from.
type Proof struct {
	Table     string
	SourceURL string
	SHA256    []byte
	ByteSize  int64
	Rows      int
}

// Source is the part of the Wago client the importer needs.
type Source interface {
	Table(ctx context.Context, table, build, locale string, consume func(map[string]string) error) (url string, sha []byte, size int64, err error)
	File(ctx context.Context, fileDataID int, build string) (url string, data []byte, err error)
}

// Fetch downloads every reference table of a build and validates the set.
func Fetch(ctx context.Context, source Source, build string) ([]Row, []Proof, error) {
	var rows []Row
	var proofs []Proof
	table := func(name, locale, stored string, consume func(map[string]string) (bool, error)) error {
		count := 0
		url, sha, size, err := source.Table(ctx, name, build, locale, func(payload map[string]string) error {
			kept, err := consume(payload)
			if kept {
				count++
			}
			return err
		})
		if err != nil {
			return fmt.Errorf("fetch %s: %w", name, err)
		}
		proofs = append(proofs, Proof{Table: stored, SourceURL: url, SHA256: sha, ByteSize: size, Rows: count})
		return nil
	}
	key := func(payload map[string]string, column string) (int64, error) {
		value, err := strconv.ParseInt(payload[column], 10, 64)
		if err != nil {
			return 0, fmt.Errorf("key column %s: %w", column, err)
		}
		return value, nil
	}
	bonus := bonusSources{itemTrees: map[int64][]int64{}, nodes: map[int64][]map[string]string{}, bonuses: map[int64][]map[string]string{},
		configs: map[int64]map[string]string{}, offsets: map[int64]map[string]string{}, curvePoints: map[int64][]curvePoint{}}
	// Sources of the derived default-bonus rows; they are not stored row by row.
	type grouped struct {
		name, column string
		target       map[int64][]map[string]string
	}
	for _, group := range []grouped{{"ItemBonusTreeNode", "ParentItemBonusTreeID", bonus.nodes}, {"ItemBonus", "ParentItemBonusListID", bonus.bonuses}} {
		if err := table(group.name, "enUS", "Source_"+group.name, func(payload map[string]string) (bool, error) {
			id, err := key(payload, group.column)
			group.target[id] = append(group.target[id], payload)
			return false, err
		}); err != nil {
			return nil, nil, err
		}
	}
	for _, single := range []struct {
		name   string
		target map[int64]map[string]string
	}{{"ItemScalingConfig", bonus.configs}, {"ItemOffsetCurve", bonus.offsets}} {
		if err := table(single.name, "enUS", "Source_"+single.name, func(payload map[string]string) (bool, error) {
			id, err := key(payload, "ID")
			single.target[id] = payload
			return false, err
		}); err != nil {
			return nil, nil, err
		}
	}
	offsetCurves := map[int64]bool{}
	for _, offset := range bonus.offsets {
		offsetCurves[integer(offset, "CurveID")] = true
	}
	squishCurves := map[int64]bool{}
	type orderedPoint struct {
		order int64
		point curvePoint
	}
	offsetPoints := map[int64][]orderedPoint{}
	for _, reference := range db2Tables {
		if err := table(reference.Name, "enUS", reference.Name, func(payload map[string]string) (bool, error) {
			if reference.Name == TableSquishEra {
				squishCurves[integer(payload, "CurveID")] = true
			}
			if reference.Name == TableCurvePoint {
				curve := integer(payload, "CurveID")
				if offsetCurves[curve] {
					x, errX := number(payload, "Pos_0")
					y, errY := number(payload, "Pos_1")
					if errX != nil || errY != nil {
						return false, fmt.Errorf("curve %d point is not numeric", curve)
					}
					offsetPoints[curve] = append(offsetPoints[curve], orderedPoint{integer(payload, "OrderIndex"), curvePoint{x, y}})
				}
				if !squishCurves[curve] {
					return false, nil
				}
			}
			id, err := key(payload, reference.KeyColumn)
			if err != nil {
				return false, err
			}
			rows = append(rows, Row{Table: reference.Name, Key: id, Payload: payload})
			return true, nil
		}); err != nil {
			return nil, nil, err
		}
	}
	for curve, points := range offsetPoints {
		sort.Slice(points, func(a, b int) bool { return points[a].order < points[b].order })
		for _, point := range points {
			bonus.curvePoints[curve] = append(bonus.curvePoints[curve], point.point)
		}
	}
	if err := table("ItemXBonusTree", "enUS", TableDefaultBonus, func(payload map[string]string) (bool, error) {
		item, err := key(payload, "ItemID")
		bonus.itemTrees[item] = append(bonus.itemTrees[item], integer(payload, "ItemBonusTreeID"))
		return false, err
	}); err != nil {
		return nil, nil, err
	}
	derived := bonus.derive()
	rows = append(rows, derived...)
	proofs[len(proofs)-1].Rows = len(derived)
	for _, reference := range gameTables {
		url, data, err := source.File(ctx, reference.FileDataID, build)
		if err != nil {
			return nil, nil, fmt.Errorf("fetch %s: %w", reference.Name, err)
		}
		parsed, err := parseGameTable(reference.Name, data)
		if err != nil {
			return nil, nil, err
		}
		sum := sha256.Sum256(data)
		rows = append(rows, parsed...)
		proofs = append(proofs, Proof{Table: reference.Name, SourceURL: url, SHA256: sum[:], ByteSize: int64(len(data)), Rows: len(parsed)})
	}
	if err := table("SpellItemEnchantment", "ruRU", TableEnchantmentRU, func(payload map[string]string) (bool, error) {
		id, err := key(payload, "ID")
		if err != nil || payload["Name_lang"] == "" {
			return false, err
		}
		rows = append(rows, Row{Table: TableEnchantmentRU, Key: id, Payload: map[string]string{"Name_lang": payload["Name_lang"]}})
		return true, nil
	}); err != nil {
		return nil, nil, err
	}
	if _, err := Parse(rows); err != nil {
		return nil, nil, err
	}
	return rows, proofs, nil
}

// Store replaces the reference tables of one build atomically.
func Store(ctx context.Context, db *pgxpool.Pool, buildID int64, rows []Row, proofs []Proof) error {
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_item_reference_sources WHERE build_id=$1`, buildID); err != nil {
			return fmt.Errorf("clear item reference tables: %w", err)
		}
		for _, proof := range proofs {
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_item_reference_sources(build_id,table_name,source_url,content_sha256,byte_size,row_count)
				VALUES($1,$2,$3,$4,$5,$6)`, buildID, proof.Table, proof.SourceURL, proof.SHA256, proof.ByteSize, proof.Rows); err != nil {
				return fmt.Errorf("record %s source: %w", proof.Table, err)
			}
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"catalog_item_reference_rows"}, []string{"build_id", "table_name", "row_key", "payload"},
			pgx.CopyFromSlice(len(rows), func(index int) ([]any, error) {
				payload, err := json.Marshal(rows[index].Payload)
				if err != nil {
					return nil, err
				}
				return []any{buildID, rows[index].Table, rows[index].Key, payload}, nil
			}))
		if err != nil {
			return fmt.Errorf("store item reference rows: %w", err)
		}
		return nil
	})
}

// ErrNotImported means the build has no reference tables yet.
var ErrNotImported = errors.New("item reference tables are not imported for this build")

// Load reads the reference tables of a build.
func Load(ctx context.Context, db *pgxpool.Pool, buildID int64) (*Tables, error) {
	result, err := db.Query(ctx, `SELECT table_name,row_key,payload FROM catalog_item_reference_rows WHERE build_id=$1`, buildID)
	if err != nil {
		return nil, fmt.Errorf("load item reference tables: %w", err)
	}
	defer result.Close()
	var rows []Row
	for result.Next() {
		var row Row
		var payload []byte
		if err := result.Scan(&row.Table, &row.Key, &payload); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payload, &row.Payload); err != nil {
			return nil, fmt.Errorf("%s row %d: %w", row.Table, row.Key, err)
		}
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotImported
	}
	return Parse(rows)
}
