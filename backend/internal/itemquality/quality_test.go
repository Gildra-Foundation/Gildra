package itemquality

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestSQLQualityEnums(t *testing.T) {
	c := os.Getenv("MIDNIGHT_TEST_PG_CONTAINER")
	if c == "" {
		t.Skip("isolated PostgreSQL required")
	}
	cmd := exec.Command("sudo", "-n", "docker", "exec", "-i", c, "psql", "-U", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1")
	cmd.Stdin = strings.NewReader("SELECT coalesce((" + SQL("q") + ")::text,'null') FROM unnest(ARRAY['0','8',' EPIC ','uncommon','WOW_TOKEN','9','999999999999999999','unknown',NULL]) q;")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if string(out) != "0\n8\n4\n2\n8\nnull\nnull\nnull\nnull\n" {
		t.Fatalf("%s", out)
	}
}
