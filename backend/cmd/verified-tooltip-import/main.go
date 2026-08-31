package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	itemLevelPattern   = regexp.MustCompile(`<!--ilvl-->([0-9]+)`)
	damagePattern      = regexp.MustCompile(`<!--dmg-->[^0-9]*([0-9.,]+)\s*-\s*([0-9.,]+)`)
	speedPattern       = regexp.MustCompile(`<!--spd-->([0-9.,]+)`)
	dpsPattern         = regexp.MustCompile(`<!--dps-->\(([0-9.,]+)`)
	durabilityPattern  = regexp.MustCompile(`(?:Durability|Прочность):\s*([0-9]+)\s*/\s*([0-9]+)`)
	armorPattern       = regexp.MustCompile(`(?:<!--amr-->)?([0-9]+)\s+(?:Armor|Броня)`)
	statPattern        = regexp.MustCompile(`<!--(stat|rtg)([0-9]+)-->(?:\+)?([0-9.,]+)\s*([^<]+)`)
	dropPattern        = regexp.MustCompile(`whtt-droppedby">(?:Dropped by|Добывается с):\s*([^<]+)`)
	chancePattern      = regexp.MustCompile(`whtt-dropchance">(?:Drop chance|Вероятность получения):\s*([0-9.,]+)%`)
	descriptionPattern = regexp.MustCompile(`(?s)<div class="q">(.*?)</div>`)
	tagPattern         = regexp.MustCompile(`<[^>]+>`)
)

type target struct {
	versionID  string
	externalID int64
}

type tooltipResponse struct {
	Name    string `json:"name"`
	Tooltip string `json:"tooltip"`
}

type parsedTooltip struct {
	itemLevel                               *int
	damageMin, damageMax, speed, dps        *float64
	armor, durabilityCurrent, durabilityMax *int
	stats                                   []parsedStat
	dropName                                string
	dropChance                              *float64
}

type parsedStat struct {
	key, label string
	value      float64
}

func main() {
	if err := run(); err != nil {
		slog.Error("verified tooltip import failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, locale, ids, entityType string
	var limit int
	var delay time.Duration
	var confirm bool
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&locale, "locale", "ru_RU", "en_US or ru_RU")
	flag.StringVar(&ids, "ids", "", "optional comma-separated item IDs")
	flag.StringVar(&entityType, "entity-type", "item", "item or talent-spell")
	flag.IntVar(&limit, "limit", 100, "maximum items; 0 imports all missing items")
	flag.DurationVar(&delay, "delay", 200*time.Millisecond, "delay between requests")
	flag.BoolVar(&confirm, "confirm", false, "fetch and persist verified tooltips")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	if locale != "en_US" && locale != "ru_RU" {
		return fmt.Errorf("unsupported locale %q", locale)
	}
	if entityType != "item" && entityType != "talent-spell" {
		return fmt.Errorf("unsupported entity type %q", entityType)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	targets, err := loadTargets(ctx, db, entityType, locale, ids, limit)
	if err != nil {
		return err
	}
	if !confirm {
		fmt.Printf("{\"dry_run\":true,\"targets\":%d,\"locale\":%q}\n", len(targets), locale)
		return nil
	}
	client := &http.Client{Timeout: 20 * time.Second}
	var imported, skipped int
	for index, item := range targets {
		if index > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}
		kind := "item"
		suffix := "&bonus=0"
		if entityType == "talent-spell" {
			kind, suffix = "spell", ""
		}
		sourceURL := fmt.Sprintf("https://nether.wowhead.com/tooltip/%s/%d?dataEnv=1&locale=%d%s", kind, item.externalID, map[string]int{"en_US": 0, "ru_RU": 7}[locale], suffix)
		body, err := fetch(ctx, client, sourceURL)
		if err != nil {
			slog.Warn("skip tooltip", "item", item.externalID, "error", err)
			skipped++
			continue
		}
		var response tooltipResponse
		if err := json.Unmarshal(body, &response); err != nil || response.Tooltip == "" {
			skipped++
			continue
		}
		if entityType == "talent-spell" {
			if err := saveSpell(ctx, db, item, locale, sourceURL, response.Name, response.Tooltip); err != nil {
				slog.Warn("skip spell tooltip", "spell", item.externalID, "error", err)
				skipped++
				continue
			}
		} else if err := save(ctx, db, item, locale, sourceURL, response.Tooltip, parseTooltip(response.Tooltip)); err != nil {
			return err
		}
		imported++
		if imported%100 == 0 {
			slog.Info("verified tooltip progress", "imported", imported, "remaining", len(targets)-index-1)
		}
	}
	fmt.Printf("{\"imported\":%d,\"skipped\":%d,\"locale\":%q}\n", imported, skipped, locale)
	return nil
}

func loadTargets(ctx context.Context, db *pgxpool.Pool, entityType, locale, ids string, limit int) ([]target, error) {
	requested := make([]int64, 0)
	for _, raw := range strings.Split(ids, ",") {
		if value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64); err == nil && value > 0 {
			requested = append(requested, value)
		}
	}
	query := `SELECT e.latest_version_id::text,e.external_id FROM game_entities e
		WHERE e.entity_type='item' AND e.deleted_at IS NULL AND e.latest_version_id IS NOT NULL
		  AND (cardinality($1::bigint[])=0 OR e.external_id=ANY($1))
		  AND NOT EXISTS (SELECT 1 FROM catalog_verified_tooltips verified WHERE verified.version_id=e.latest_version_id
			AND verified.locale=$2 AND verified.source='wowhead_tooltip' AND verified.variant_key='base')
		ORDER BY e.external_id LIMIT CASE WHEN $3=0 THEN 2147483647 ELSE $3 END`
	if entityType == "talent-spell" {
		query = `SELECT DISTINCT spell.id::text,e.external_id
			FROM catalog_talent_spell_links link
			JOIN game_entity_versions spell ON spell.id=link.spell_version_id
			JOIN game_entities e ON e.latest_version_id=spell.id AND e.entity_type='spell' AND e.deleted_at IS NULL
			WHERE (cardinality($1::bigint[])=0 OR e.external_id=ANY($1))
			  AND NOT EXISTS (SELECT 1 FROM catalog_verified_spell_descriptions verified
				WHERE verified.spell_version_id=spell.id AND verified.locale=$2 AND verified.source='wowhead_tooltip')
			ORDER BY e.external_id LIMIT CASE WHEN $3=0 THEN 2147483647 ELSE $3 END`
	}
	rows, err := db.Query(ctx, query, requested, locale, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]target, 0)
	for rows.Next() {
		var item target
		if err := rows.Scan(&item.versionID, &item.externalID); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func saveSpell(ctx context.Context, db *pgxpool.Pool, spell target, locale, sourceURL, name, raw string) error {
	match := descriptionPattern.FindStringSubmatch(raw)
	if len(match) < 2 {
		return fmt.Errorf("spell %d has no rendered description", spell.externalID)
	}
	description := cleanText(match[1])
	if description == "" {
		return fmt.Errorf("spell %d has an empty rendered description", spell.externalID)
	}
	hash := sha256.Sum256([]byte(raw))
	_, err := db.Exec(ctx, `INSERT INTO catalog_verified_spell_descriptions(spell_version_id,locale,source,name,description,source_url,content_hash)
		VALUES($1,$2,'wowhead_tooltip',$3,$4,$5,$6)
		ON CONFLICT(spell_version_id,locale,source) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
		source_url=EXCLUDED.source_url,content_hash=EXCLUDED.content_hash,fetched_at=now()`, spell.versionID, locale, name, description, sourceURL, hash[:])
	return err
}

func fetch(ctx context.Context, client *http.Client, sourceURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GildraDataImporter/1.0 (+https://gildra.net)")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %s", resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

func parseTooltip(raw string) parsedTooltip {
	result := parsedTooltip{}
	result.itemLevel = parseIntMatch(itemLevelPattern, raw)
	result.damageMin, result.damageMax = parseFloatPair(damagePattern, raw)
	result.speed = parseFloatMatch(speedPattern, raw)
	result.dps = parseFloatMatch(dpsPattern, raw)
	result.durabilityCurrent, result.durabilityMax = parseIntPair(durabilityPattern, raw)
	result.armor = parseIntMatch(armorPattern, raw)
	for _, match := range statPattern.FindAllStringSubmatch(raw, -1) {
		value, err := parseNumber(match[3])
		if err != nil {
			continue
		}
		result.stats = append(result.stats, parsedStat{key: match[1] + match[2], label: cleanText(match[4]), value: value})
	}
	if match := dropPattern.FindStringSubmatch(raw); len(match) > 1 {
		result.dropName = cleanText(match[1])
	}
	result.dropChance = parseFloatMatch(chancePattern, raw)
	return result
}

func save(ctx context.Context, db *pgxpool.Pool, item target, locale, sourceURL, raw string, parsed parsedTooltip) error {
	hash := sha256.Sum256([]byte(raw))
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_verified_tooltips(version_id,locale,source,variant_key,source_url,raw_html,content_hash)
			VALUES($1,$2,'wowhead_tooltip','base',$3,$4,$5) ON CONFLICT(version_id,locale,source,variant_key) DO UPDATE SET
			source_url=EXCLUDED.source_url,raw_html=EXCLUDED.raw_html,content_hash=EXCLUDED.content_hash,fetched_at=now()`, item.versionID, locale, sourceURL, raw, hash[:]); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_verified_item_details(version_id,locale,source,variant_key,item_level,damage_min,damage_max,weapon_speed,damage_per_second,armor,durability_current,durability_max)
			VALUES($1,$2,'wowhead_tooltip','base',$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(version_id,locale,source,variant_key) DO UPDATE SET
			item_level=EXCLUDED.item_level,damage_min=EXCLUDED.damage_min,damage_max=EXCLUDED.damage_max,weapon_speed=EXCLUDED.weapon_speed,
			damage_per_second=EXCLUDED.damage_per_second,armor=EXCLUDED.armor,durability_current=EXCLUDED.durability_current,durability_max=EXCLUDED.durability_max`,
			item.versionID, locale, parsed.itemLevel, parsed.damageMin, parsed.damageMax, parsed.speed, parsed.dps, parsed.armor, parsed.durabilityCurrent, parsed.durabilityMax); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_verified_item_stats WHERE version_id=$1 AND locale=$2 AND source='wowhead_tooltip' AND variant_key='base'`, item.versionID, locale); err != nil {
			return err
		}
		for _, stat := range parsed.stats {
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_verified_item_stats(version_id,locale,source,variant_key,stat_key,stat_label,value) VALUES($1,$2,'wowhead_tooltip','base',$3,$4,$5)`, item.versionID, locale, stat.key, stat.label, stat.value); err != nil {
				return err
			}
		}
		if parsed.dropName != "" {
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_verified_item_drops(version_id,locale,source,variant_key,drop_source_name,chance_percent,source_url)
			VALUES($1,$2,'wowhead_tooltip','base',$3,$4,$5) ON CONFLICT(version_id,locale,source,variant_key,drop_source_name) DO UPDATE SET chance_percent=EXCLUDED.chance_percent,source_url=EXCLUDED.source_url`, item.versionID, locale, parsed.dropName, parsed.dropChance, sourceURL); err != nil {
				return err
			}
		}
		return nil
	})
}

func cleanText(value string) string {
	return strings.TrimSpace(html.UnescapeString(tagPattern.ReplaceAllString(value, "")))
}
func parseNumber(value string) (float64, error) {
	return strconv.ParseFloat(strings.ReplaceAll(value, ",", "."), 64)
}
func parseIntMatch(pattern *regexp.Regexp, value string) *int {
	m := pattern.FindStringSubmatch(value)
	if len(m) < 2 {
		return nil
	}
	v, e := strconv.Atoi(m[1])
	if e != nil {
		return nil
	}
	return &v
}
func parseFloatMatch(pattern *regexp.Regexp, value string) *float64 {
	m := pattern.FindStringSubmatch(value)
	if len(m) < 2 {
		return nil
	}
	v, e := parseNumber(m[1])
	if e != nil {
		return nil
	}
	return &v
}
func parseIntPair(pattern *regexp.Regexp, value string) (*int, *int) {
	m := pattern.FindStringSubmatch(value)
	if len(m) < 3 {
		return nil, nil
	}
	a, _ := strconv.Atoi(m[1])
	b, _ := strconv.Atoi(m[2])
	return &a, &b
}
func parseFloatPair(pattern *regexp.Regexp, value string) (*float64, *float64) {
	m := pattern.FindStringSubmatch(value)
	if len(m) < 3 {
		return nil, nil
	}
	a, e1 := parseNumber(m[1])
	b, e2 := parseNumber(m[2])
	if e1 != nil || e2 != nil {
		return nil, nil
	}
	return &a, &b
}
