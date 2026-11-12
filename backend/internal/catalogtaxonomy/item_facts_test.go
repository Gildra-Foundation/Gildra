package catalogtaxonomy

import (
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestItemFactsDoNotConfuseStackAndOwnership(t *testing.T) {
	c := os.Getenv("MIDNIGHT_TEST_PG_CONTAINER")
	if c == "" {
		t.Skip("isolated PostgreSQL required")
	}
	q := `SELECT ` + itemFactsExpression + ` FROM (VALUES ('item','ru_RU','{"item_class_id":2}'::jsonb,'{"ItemDelay":"3600","MaxCount":"1","Stackable":"200"}'::jsonb)) x(entity_type,locale,item_detail,db2);`
	cmd := exec.Command("sudo", "-n", "docker", "exec", "-i", c, "psql", "-U", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1")
	cmd.Stdin = strings.NewReader(q)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v %s", err, out)
	}
	var blocks []map[string]any
	if err := json.Unmarshal(out, &blocks); err != nil {
		t.Fatal(err)
	}
	if len(blocks) != 2 || blocks[0]["seconds"] != 3.6 || blocks[1]["quantity"] != float64(1) {
		t.Fatal(string(out))
	}
}
