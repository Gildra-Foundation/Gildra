package catalogtaxonomy

import (
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestGemProjectionBuildAndScaling(t *testing.T) {
	c := os.Getenv("MIDNIGHT_TEST_PG_CONTAINER")
	if c == "" {
		t.Skip("isolated PostgreSQL required")
	}
	for _, tc := range []struct {
		name, build, payload, status string
		value                        any
	}{
		{"scaled", "92", `{"Name_lang":"+$k1 Haste","ScalingClass":"-7","Effect_0":"5","EffectArg_0":"36","EffectPointsMin_0":"0","EffectScalingPoints_0":"0.35680899024"}`, "requires_scaling", nil},
		{"synthetic_static", "92", `{"Name_lang":"+7 Haste","ScalingClass":"0","Effect_0":"5","EffectArg_0":"36","EffectPointsMin_0":"7","EffectScalingPoints_0":"0"}`, "source_values", float64(7)},
		{"wrong_build", "93", `{"Name_lang":"Wrong build"}`, "missing_enchantment", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := `WITH catalog_db2_rows(build_id,table_name,locale,row_id,payload) AS (VALUES
 (92,'GemProperties','en_US',4353,'{"Enchant_ID":"8110"}'::jsonb),(` + tc.build + `,'SpellItemEnchantment','en_US',8110,'` + tc.payload + `'::jsonb))
 SELECT ` + gemTooltipExpression + ` FROM (VALUES ('item')) e(entity_type)
 CROSS JOIN (VALUES (92)) v(build_id) CROSS JOIN (VALUES ('ru_RU')) l(locale)
 CROSS JOIN (VALUES ('{"Gem_properties":"4353"}'::jsonb)) item_sparse_local(payload)
 CROSS JOIN (VALUES ('{}'::jsonb)) item_sparse_fallback(payload) ` + gemTooltipJoins + `;`
			cmd := exec.Command("sudo", "-n", "docker", "exec", "-i", c, "psql", "-U", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1")
			cmd.Stdin = strings.NewReader(q)
			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("%v: %s", err, out)
			}
			var b []map[string]any
			if err := json.Unmarshal(out, &b); err != nil {
				t.Fatal(err)
			}
			if len(b) != 1 || b[0]["value_status"] != tc.status {
				t.Fatalf("%s", out)
			}
			stats := b[0]["stats"].([]any)
			if tc.status == "missing_enchantment" {
				if len(stats) != 0 {
					t.Fatal(stats)
				}
				return
			}
			stat := stats[0].(map[string]any)
			if stat["value"] != tc.value || stat["unit"] != "rating" || stat["stat_type"] != float64(36) {
				t.Fatal(stat)
			}
		})
	}
}
