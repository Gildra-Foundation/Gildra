package catalog

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestResolveDescriptionTextUsesOnlyLoadedDB2Values(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		321291: {Effects: map[int]spellEffectValue{2: {BasePoints: 20}}},
		321973: {Effects: map[int]spellEffectValue{1: {BasePoints: 800}}},
		322098: {DurationMS: 7000, Effects: map[int]spellEffectValue{}},
		390628: {DurationMS: 10000, Effects: map[int]spellEffectValue{}},
	}
	raw := "Target dies within $322098d, granting ${$321973s1/100}. Below $s2%. Once every $390628d."
	got := resolveDescriptionText(raw, 321291, values, "en_US")
	want := "Target dies within 7 sec, granting 8. Below 20%. Once every 10 sec."
	if got != want {
		t.Fatalf("unexpected resolved description\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextAppliesArithmeticOperators(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {Effects: map[int]spellEffectValue{1: {BasePoints: 10000}, 2: {BasePoints: 150}}},
	}
	for _, test := range []struct {
		name, raw, want string
	}{
		{name: "divide", raw: "${$s1/1000} sec", want: "10 sec"},
		{name: "negative divide", raw: "${$s1/-1000} sec", want: "-10 sec"},
		{name: "subtract", raw: "${$s2-20}", want: "130"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := resolveDescriptionText(test.raw, 42, values, "en_US"); got != test.want {
				t.Fatalf("unexpected arithmetic resolution\nwant: %s\n got: %s", test.want, got)
			}
		})
	}
}

func TestResolveDescriptionTextHandlesMidnightTemplateVariants(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {
			Effects: map[int]spellEffectValue{
				1: {BasePoints: 10},
				2: {BasePoints: 40},
				3: {BasePoints: 25},
			},
			Enchantments: map[int]spellEnchantmentValue{1: {
				Effects: map[int]float64{1: 25}, ItemLevelMin: 0, ItemLevelMax: 320,
			}},
		},
		77: {Effects: map[int]spellEffectValue{2: {BasePoints: 7}}},
	}
	for _, test := range []struct{ raw, want string }{
		{"Restores ${$M1*10} mana.", "Restores 100 mana."},
		{"Restores ${$s2-$s2%$s3} health.", "Restores 30 health."},
		{"Cannot be applied below $ecim.", "Cannot be applied below 320."},
		{"Damage increased by $77S2%.", "Damage increased by 7%."},
		{"Returns you to $z; unavailable above $ctrmax5997.", "Returns you to your home location; unavailable above the maximum level."},
		{"Deals ${$s1*$<rolemult>} damage.", "Deals a role-adjusted value of damage."},
	} {
		if got := resolveDescriptionText(test.raw, 42, values, "en_US"); got != test.want {
			t.Fatalf("%q resolved to %q, want %q", test.raw, got, test.want)
		}
	}
}

func TestResolveDescriptionTextExplainsUnresolvedSourceMacros(t *testing.T) {
	got := resolveDescriptionText("Ticks every $123t, up to $456u targets; see $@spelldesc789.", 0, nil, "en_US")
	want := "Ticks every an effect-defined interval, up to the maximum stack count targets; see the linked spell's effect."
	if got != want {
		t.Fatalf("unexpected readable fallback\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextAppliesChainedArithmeticWithDuration(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {DurationMS: 20000, Effects: map[int]spellEffectValue{
			1: {Coefficient: 0.8},
			3: {Coefficient: 0.6},
		}},
	}
	got := resolveDescriptionText("Restores ${$m1/5*$d} health and ${$m3/5*$d} mana; bonus ${$m1*.9}.", 42, values, "en_US")
	want := "Restores 3.2 × SP health and 2.4 × SP mana; bonus 0.72 × SP."
	if got != want {
		t.Fatalf("unexpected chained expression\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextUsesScalingFormulaInsteadOfFakeZero(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		17: {Effects: map[int]spellEffectValue{1: {Coefficient: 1.65}}},
	}
	if got := resolveDescriptionText("Absorbs $s1 damage.", 17, values, "en_US"); got != "Absorbs 1.65 × SP damage." {
		t.Fatalf("unexpected scaling description: %q", got)
	}
	if got := resolveDescriptionText("Deals $s2 damage.", 17, values, "en_US"); got != "Deals a game-defined value damage." {
		t.Fatalf("missing values must remain readable: %q", got)
	}
}

func TestResolveDescriptionTextMakesUnknownTokensReadable(t *testing.T) {
	raw := "Deals $s4 damage over $999999d."
	if got := resolveDescriptionText(raw, 123, map[int64]spellDescriptionValues{}, "en_US"); got != "Deals a game-defined value damage over a game-defined value." {
		t.Fatalf("unknown values must be readable: %q", got)
	}
}

func TestResolveDescriptionTextResolvesSpellDescriptionReferences(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		10: {Description: "$@spelldesc20"},
		20: {Description: "Deals $s1 damage.", Effects: map[int]spellEffectValue{1: {BasePoints: 7}}},
	}
	if got := resolveDescriptionText("$@spelldesc10", 0, values, "en_US"); got != "Deals 7 damage." {
		t.Fatalf("unexpected nested description: %q", got)
	}
}

func TestResolveDescriptionTextResolvesSpellNameAndZeroBasedEffectAliases(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {Effects: map[int]spellEffectValue{1: {BasePoints: 12}}},
		77: {Name: "Arcane Nova"},
	}
	got := resolveDescriptionText("Grants $s0 for $42s0 sec with $@spellname77 $@spellicon77.", 42, values, "en_US")
	want := "Grants 12 for 12 sec with Arcane Nova ."
	if got != want {
		t.Fatalf("unexpected macro resolution\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextRendersBothConditionalBranches(t *testing.T) {
	got := resolveDescriptionText("Base.$?a157642[Empowered $s1.][]", 157642, map[int64]spellDescriptionValues{
		157642: {Name: "Improved Fireball", Effects: map[int]spellEffectValue{1: {BasePoints: 20}}},
	}, "en_US")
	want := "Base. If «Improved Fireball»: Empowered 20."
	if got != want {
		t.Fatalf("unexpected conditional description\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextRendersRussianConditionalBranches(t *testing.T) {
	values := map[int64]spellDescriptionValues{42: {Name: "Улучшение"}}
	got := resolveDescriptionText("База.$?s42[Усиление][Без усиления]", 0, values, "ru_RU")
	want := "База. Если доступно «Улучшение»: Усиление; иначе: Без усиления"
	if got != want {
		t.Fatalf("unexpected Russian conditional description\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextKeepsNonSpellConditionsReadable(t *testing.T) {
	got := resolveDescriptionText("Value.$?diff15|diff16[Heroic][Normal]", 0, nil, "en_US")
	want := "Value. If «condition diff15|diff16»: Heroic; otherwise: Normal"
	if got != want {
		t.Fatalf("unexpected generic conditional description\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextResolvesMaxDurationAndTick(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {
			DurationMS:    2000,
			MaxDurationMS: 8000,
			Effects:       map[int]spellEffectValue{2: {AmplitudeMS: 3000}},
		},
	}
	got := resolveDescriptionText("Lasts $d (up to $D); ticks every $t2.", 42, values, "en_US")
	if got != "Lasts 2 sec (up to 8 sec); ticks every 3 sec." {
		t.Fatalf("unexpected duration resolution: %q", got)
	}
	got = resolveDescriptionText("Ticks every $1217960t2.", 1217961, map[int64]spellDescriptionValues{
		1217960: {Effects: map[int]spellEffectValue{2: {AmplitudeMS: 2000}}},
	}, "en_US")
	if got != "Ticks every 2 sec." {
		t.Fatalf("unexpected referenced tick resolution: %q", got)
	}
}

func TestResolveDescriptionTextResolvesCapitalMagnitude(t *testing.T) {
	got := resolveDescriptionText("Lasts $M2 min.", 1262057, map[int64]spellDescriptionValues{
		1262057: {Effects: map[int]spellEffectValue{2: {BasePoints: 60}}},
	}, "en_US")
	if got != "Lasts 60 min." {
		t.Fatalf("unexpected capital magnitude resolution: %q", got)
	}
}

func TestResolveDescriptionTextResolvesCapitalEffect(t *testing.T) {
	got := resolveDescriptionText("+$S1 profession skill", 1234159, map[int64]spellDescriptionValues{
		1234159: {Effects: map[int]spellEffectValue{1: {BasePoints: 5}}},
	}, "en_US")
	if got != "+5 profession skill" {
		t.Fatalf("unexpected capital effect resolution: %q", got)
	}
}

func TestResolveDescriptionTextResolvesPeriodicOutput(t *testing.T) {
	got := resolveDescriptionText("Heals $o1 over $d.", 42, map[int64]spellDescriptionValues{
		42: {DurationMS: 5000, Effects: map[int]spellEffectValue{1: {Coefficient: 0.159}}},
	}, "en_US")
	if got != "Heals 0.159 × SP over 5 sec." {
		t.Fatalf("unexpected periodic output resolution: %q", got)
	}
}

func TestResolveDescriptionTextResolvesEnchantmentEffect(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		1236094: {Enchantments: map[int]spellEnchantmentValue{1: {
			Effects: map[int]float64{1: 20}, ItemLevelMin: 10, ItemLevelMax: 120,
		}}},
	}
	got := resolveDescriptionText("Deals $ec1s1 Fire damage.", 1236094, values, "en_US")
	if got != "Deals 20 Fire damage." {
		t.Fatalf("unexpected enchantment effect resolution: %q", got)
	}
	got = resolveDescriptionText("Increases haste by $ec1; valid for levels $ecim through $ecix.", 1236094, values, "en_US")
	if got != "Increases haste by 20; valid for levels 10 through 120." {
		t.Fatalf("unexpected enchantment value resolution: %q", got)
	}
	got = resolveDescriptionText("Increases Intellect by $ec1 and Stamina by $ec2.", 1236094, map[int64]spellDescriptionValues{
		1236094: {Enchantments: map[int]spellEnchantmentValue{1: {Effects: map[int]float64{1: 5, 2: 7}}}},
	}, "en_US")
	if got != "Increases Intellect by 5 and Stamina by 7." {
		t.Fatalf("unexpected multi-effect enchantment resolution: %q", got)
	}
}

func TestResolveDescriptionTextRendersPrimaryStatToken(t *testing.T) {
	if got := resolveDescriptionText("Increases $pri.", 0, nil, "en_US"); got != "Increases your primary stat." {
		t.Fatalf("unexpected English primary stat: %q", got)
	}
	if got := resolveDescriptionText("Увеличивает $pri.", 0, nil, "ru_RU"); got != "Увеличивает основную характеристику." {
		t.Fatalf("unexpected Russian primary stat: %q", got)
	}
}

func TestResolveDescriptionTextResolvesIndexedDurationsAndExplicitMagnitude(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {DurationMS: 30000},
		77: {DurationMS: 5000, Effects: map[int]spellEffectValue{1: {BasePoints: 3}}},
	}
	got := resolveDescriptionText("Lasts $d1, then $77d1; has $77M1 charges.", 42, values, "en_US")
	want := "Lasts 30 sec, then 5 sec; has 3 charges."
	if got != want {
		t.Fatalf("unexpected indexed macro resolution\nwant: %s\n got: %s", want, got)
	}
}

func TestResolveDescriptionTextRendersAlternativeConditionals(t *testing.T) {
	got := resolveDescriptionText("Gain $?(a1)[Strength]?(a2)[Agility][Strength or Agility].", 0, nil, "en_US")
	want := "Gain if «a1»: Strength; otherwise, if «a2»: Agility; otherwise: Strength or Agility."
	if got != want {
		t.Fatalf("unexpected alternative conditional: %q", got)
	}
}

func TestResolveDescriptionTextExplainsHealingRoleAdjustedValues(t *testing.T) {
	got := resolveDescriptionText("Heals ${$<healingrolemult>*$s1}.", 0, nil, "en_US")
	if got != "Heals a role-adjusted value of." {
		t.Fatalf("unexpected healing role resolution: %q", got)
	}
}

func TestResolveDescriptionTextExplainsRoleAdjustedValues(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		1236094: {Enchantments: map[int]spellEnchantmentValue{1: {
			Effects: map[int]float64{1: 20, 2: 35},
		}}},
	}
	got := resolveDescriptionText("Deals ${$<rolemult>*$ec1s1} Fire damage before detonating for ${$<rolemult>*$ec1s2}.", 1236094, values, "en_US")
	if got != "Deals a role-adjusted value of Fire damage before detonating for a role-adjusted value of." {
		t.Fatalf("unexpected role-adjusted English resolution: %q", got)
	}
	got = resolveDescriptionText("Наносит ${$<rolemult>*$ec1s1} ед. урона.", 1236094, values, "ru_RU")
	if got != "Наносит величину, зависящую от роли ед. урона." {
		t.Fatalf("unexpected role-adjusted Russian resolution: %q", got)
	}
}

func TestReferencedSpellIDsIncludesExplicitTickSpell(t *testing.T) {
	got := referencedSpellIDs([]string{"Ticks every $1217960t2."}, 0)
	if len(got) != 1 || got[0] != 1217960 {
		t.Fatalf("explicit tick reference was not discovered: %#v", got)
	}
}

func TestResolveDescriptionTextResolvesSpellRadius(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		42: {Effects: map[int]spellEffectValue{
			1: {Radius: 12},
			2: {Radius: 7.5},
		}},
	}
	got := resolveDescriptionText("Affects enemies within $A1 yards and $a2 yards.", 42, values, "en_US")
	if got != "Affects enemies within 12 yards and 7.5 yards." {
		t.Fatalf("unexpected radius resolution: %q", got)
	}
}

func TestBlockSpellIDOverridesEntityContext(t *testing.T) {
	if got := blockSpellIDOrDefault(214870, 0); got != 214870 {
		t.Fatalf("block spell id was not selected: %d", got)
	}
	if got := blockSpellIDOrDefault(0, 133); got != 133 {
		t.Fatalf("entity spell id fallback was not selected: %d", got)
	}
}

func TestEntityHasDescriptionTemplates(t *testing.T) {
	if !entityHasDescriptionTemplates(&Entity{Description: "Deals $s1 damage."}) {
		t.Fatal("expected description token to be detected")
	}
	if !entityHasDescriptionTemplates(&Entity{Localizations: map[string]EntityLocalization{
		"ru_RU": {Description: "Урон на $d."},
	}}) {
		t.Fatal("expected localized token to be detected")
	}
	if entityHasDescriptionTemplates(&Entity{Description: "Deals damage."}) {
		t.Fatal("did not expect a clean description to require resolution")
	}
}

func TestDescriptionLocaleDoesNotMixFallbackEnglishWithRussianUnits(t *testing.T) {
	if got := descriptionLocale("Deals damage for $10d.", "ru_RU"); got != "en_US" {
		t.Fatalf("expected English fallback, got %q", got)
	}
	if got := descriptionLocale("Наносит урон в течение $10d.", "ru_RU"); got != "ru_RU" {
		t.Fatalf("expected Russian text, got %q", got)
	}
}

func TestResolveDescriptionTextResolvesMidnightFuryPvpValues(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		199261: {DurationMS: 15000, PowerCostMaxPct: 10, MaxStacks: 5, Effects: map[int]spellEffectValue{1: {BasePoints: 10}, 2: {BasePoints: 10}}},
		213915: {Effects: map[int]spellEffectValue{1: {BasePoints: 100}, 2: {BasePoints: 10000}, 3: {BasePoints: 2}}},
		424654: {DurationMS: 5000, Effects: map[int]spellEffectValue{1: {BasePoints: 1}, 2: {BasePoints: 10000}}},
		424655: {DurationMS: 5000, Effects: map[int]spellEffectValue{1: {BasePoints: -20}}},
	}
	if got := resolveDescriptionText("Вы расходуете $m2% здоровья, увеличивая урон на $m1% на $d. Эффект суммируется до $u раз.", 199261, values, "ru_RU"); got != "Вы расходуете 10% здоровья, увеличивая урон на 10% на 15 сек. Эффект суммируется до 5 раз." {
		t.Fatalf("death wish mismatch: %q", got)
	}
	if got := resolveDescriptionText("Отражает $s3 $lследующее направленное в вас заклинание:следующих направленных в вас заклинания:следующих направленных в вас заклинаний; и увеличивает восстановление на ${$s2/1000} сек.", 213915, values, "ru_RU"); got != "Отражает 2 следующих направленных в вас заклинания и увеличивает восстановление на 10 сек." {
		t.Fatalf("rebound mismatch: %q", got)
	}
	values[1219209] = spellDescriptionValues{DurationMS: 5000, Effects: map[int]spellEffectValue{1: {BasePoints: -50, Radius: 12}}}
	if got := resolveDescriptionText("Сокращает время действия на $1219209s1% в радиусе $1219209A1 м в течение $1219209d.", 1227751, values, "ru_RU"); got != "Сокращает время действия на -50% в радиусе 12 м в течение 5 сек." {
		t.Fatalf("berserker roar mismatch: %q", got)
	}
}

func TestMidnightToolRawEffectFallback(t *testing.T) {
	c := os.Getenv("MIDNIGHT_TEST_PG_CONTAINER")
	if c == "" {
		t.Skip("isolated PostgreSQL required")
	}
	q := `WITH catalog_spell_effects AS (
 SELECT 0::int effect_index,0::numeric base_points,0::numeric coefficient,0::numeric attack_power_coefficient,
  0::int amplitude_ms,'{}'::jsonb attributes,0::int spell_version_id,0::int difficulty_id,'db2'::text source WHERE false
 ),catalog_db2_rows(build_id,table_name,locale,payload) AS (VALUES
 (92,'SpellEffect','en_US','{"SpellID":"1234161","EffectIndex":"0","DifficultyID":"0","EffectBasePointsF":"8","EffectBonusCoefficient":"0"}'::jsonb),
 (93,'SpellEffect','en_US','{"SpellID":"1234161","EffectIndex":"0","DifficultyID":"0","EffectBasePointsF":"999"}'::jsonb))
 SELECT effect.base_points FROM (VALUES(1,92)) version(id,build_id)
 CROSS JOIN (VALUES(1234161)) entity(external_id) CROSS JOIN LATERAL (` + descriptionEffectRows + `) effect;`
	cmd := exec.Command("sudo", "-n", "docker", "exec", "-i", c, "psql", "-U", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1")
	cmd.Stdin = strings.NewReader(q)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	points, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil || points != 8 {
		t.Fatalf("%v %s", err, out)
	}
	values := map[int64]spellDescriptionValues{1234161: {Effects: map[int]spellEffectValue{1: {BasePoints: points}}}}
	for _, tc := range []struct{ locale, raw, want string }{
		{"en_US", "+$S1 Midnight Herbalism Skill", "+8 Midnight Herbalism Skill"},
		{"ru_RU", "+$S1 к навыку травничества Midnight", "+8 к навыку травничества Midnight"},
	} {
		if got := resolveDescriptionText(tc.raw, 1234161, values, tc.locale); got != tc.want {
			t.Fatalf("got %s want %s", got, tc.want)
		}
	}
}

func TestItemEffectPlainTextKeepsOwningSpellContext(t *testing.T) {
	for _, tc := range []struct{ locale, raw, want string }{
		{"en_US", "Gain $s1 power.", "Gain 8 power."},
		{"ru_RU", "Повышает силу на $s1.", "Повышает силу на 8."},
	} {
		t.Run(tc.locale, func(t *testing.T) {
			build := int64(92)
			value := spellDescriptionValues{Effects: map[int]spellEffectValue{1: {BasePoints: 8}}}
			cache := &spellValueCache{entries: map[spellValueKey]map[int64]*spellDescriptionValues{
				{"wow", tc.locale, build}: {42: &value},
			}}
			entity := &Entity{Type: "item", Product: "wow", Locale: tc.locale, BuildID: &build,
				Tooltip: &Tooltip{PlainText: tc.raw, Blocks: []map[string]any{{"type": "effect", "spell_id": int64(42), "text": tc.raw}}}}
			if err := resolveEntityDescriptions(context.Background(), cache, entity); err != nil {
				t.Fatal(err)
			}
			if entity.Tooltip.PlainText != tc.want || entity.Tooltip.Blocks[0]["text"] != tc.want {
				t.Fatalf("%+v", entity.Tooltip)
			}
		})
	}
}

func TestEnchantmentDescriptionUsesLinkedSpell(t *testing.T) {
	entity := Entity{Type: "enchantment", ExternalID: 8110, Payload: map[string]any{"raidbots": map[string]any{"spellId": float64(123)}}}
	if got := descriptionSpellID(entity); got != 123 {
		t.Fatalf("got %d", got)
	}
}

func TestStaticGemTextUsesAmountsNotStatIDs(t *testing.T) {
	block := map[string]any{"stats": []any{map[string]any{"index": float64(0), "stat_type": float64(36), "value": float64(7)}, map[string]any{"index": float64(1), "stat_type": float64(32), "value": nil}}}
	if got := resolveStaticGemText("+$k1 Haste; +$k2 Critical Strike", block); got != "+7 Haste; +$k2 Critical Strike" {
		t.Fatal(got)
	}
	if completeItemEffect("Increases haste by a game-defined value.") {
		t.Fatal("unresolved summary admitted")
	}
	if !completeItemEffect("Increases haste by 7.") {
		t.Fatal("resolved summary rejected")
	}
}

func TestItemSummaryRealSource(t *testing.T) {
	dsn := os.Getenv("ITEMS_REPLAY_DATABASE_URL")
	if dsn == "" {
		t.Skip("isolated ITEMS replay required")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var safe bool
	if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_snapshots WHERE metadata->>'fixture'='ITEMS isolated real-source replay, not original full artifacts')`).Scan(&safe); err != nil || !safe {
		t.Fatal("not ITEMS fixture", err)
	}
	for _, locale := range []string{"en_US", "ru_RU"} {
		page, err := NewService(db).Summaries(ctx, SummaryParams{Product: "wow", Type: "item", Locale: locale, Limit: 100, ExternalIDs: []int64{270402, 255375, 282426, 240855, 240856, 238009, 241297, 240157, 211993, 237602, 25208, 47518, 15450, 100290, 84940, 52222, 76564, 58142, 56477, 38879}})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Entities) != 20 {
			t.Fatalf("summaries %d", len(page.Entities))
		}
		var tool string
		for _, e := range page.Entities {
			if e.ExternalID == 238009 {
				tool = e.Description
			}
		}
		if !strings.Contains(tool, "8") {
			t.Fatalf("profession bonus missing: %q", tool)
		}
		if dir := os.Getenv("ITEMS_EVIDENCE_DIR"); dir != "" {
			data, _ := json.MarshalIndent(page, "", "  ")
			if err := os.WriteFile(filepath.Join(dir, "summaries-"+locale+".json"), data, 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
}
