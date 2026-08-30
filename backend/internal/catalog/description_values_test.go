package catalog

import "testing"

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

func TestResolveDescriptionTextUsesScalingFormulaInsteadOfFakeZero(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		17: {Effects: map[int]spellEffectValue{1: {Coefficient: 1.65}}},
	}
	if got := resolveDescriptionText("Absorbs $s1 damage.", 17, values, "en_US"); got != "Absorbs 1.65 × SP damage." {
		t.Fatalf("unexpected scaling description: %q", got)
	}
	if got := resolveDescriptionText("Deals $s2 damage.", 17, values, "en_US"); got != "Deals $s2 damage." {
		t.Fatalf("missing values must remain unresolved: %q", got)
	}
}

func TestResolveDescriptionTextPreservesUnknownTokens(t *testing.T) {
	raw := "Deals $s4 damage over $999999d."
	if got := resolveDescriptionText(raw, 123, map[int64]spellDescriptionValues{}, "en_US"); got != raw {
		t.Fatalf("unknown values must remain source-visible: %q", got)
	}
}

func TestResolveDescriptionTextResolvesSpellDescriptionReferences(t *testing.T) {
	values := map[int64]spellDescriptionValues{
		10: {Description: "$@spelldesc20"},
		20: {Description: "Canonical description"},
	}
	if got := resolveDescriptionText("$@spelldesc10", 0, values, "en_US"); got != "Canonical description" {
		t.Fatalf("unexpected nested description: %q", got)
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
