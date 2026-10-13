// Package architecture holds the backend's dependency rules (roadmap 86).
//
// Domains live in their own internal packages and are wired together only in
// cmd/*. The rules below keep it that way: a domain never imports a transport
// (HTTP, GraphQL, admin panel), and every edge between internal packages is
// listed here, so a new one is a deliberate, reviewed change to this table.
package architecture

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const module = "github.com/Gildra-Foundation/Gildra/backend/internal/"

// transports adapt domains to a protocol; only cmd/* and other transports may import them.
var transports = map[string]bool{"httpapi": true, "graphqlapi": true, "adminpanel": true}

// allowedEdges is the complete list of imports between internal packages
// (production code). Keep it short: prefer wiring in cmd/* over a new edge.
var allowedEdges = map[string][]string{
	"adminpanel":      {"analytics", "api", "auth", "catalogquality"},
	"analytics":       {"api"},
	"attimport":       {"attparser", "catalogimport"},
	"catalogimport":   {"battlenet", "wago"},
	"catalogpipeline": {"catalog", "catalogquality", "catalogrelease"},
	"graphqlapi":      {"catalog", "graphqlapi/model"},
	"httpapi":         {"analytics", "api", "auth", "catalog"},
}

func TestInternalPackagesKeepTheirBoundaries(t *testing.T) {
	edges := internalEdges(t, "..")
	if !contains(edges["httpapi"], "catalog") {
		t.Fatalf("import scan found no httpapi -> catalog edge; the walker is broken: %v", edges)
	}
	for from, imports := range edges {
		allowed := map[string]bool{}
		for _, to := range allowedEdges[from] {
			allowed[to] = true
		}
		for _, to := range imports {
			if transports[rootOf(to)] && !transports[rootOf(from)] {
				t.Errorf("%s imports the transport %s: domains must not depend on HTTP/GraphQL/admin adapters", from, to)
				continue
			}
			if !allowed[to] {
				t.Errorf("new dependency %s -> %s: wire it in cmd/* instead, or add it to allowedEdges in internal/architecture with a reason", from, to)
			}
		}
	}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func rootOf(pkg string) string {
	root, _, _ := strings.Cut(pkg, "/")
	return root
}

// internalEdges maps each internal package (relative path) to the internal
// packages its non-test Go files import.
func internalEdges(t *testing.T, root string) map[string][]string {
	t.Helper()
	found := map[string]map[string]bool{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		from, err := filepath.Rel(root, filepath.Dir(path))
		if err != nil {
			return err
		}
		from = filepath.ToSlash(from)
		for _, spec := range file.Imports {
			imported, _ := strconv.Unquote(spec.Path.Value)
			to, ok := strings.CutPrefix(imported, module)
			if !ok || to == from || strings.HasPrefix(to, from+"/") {
				continue
			}
			if found[from] == nil {
				found[from] = map[string]bool{}
			}
			found[from][to] = true
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	edges := map[string][]string{}
	for from, set := range found {
		for to := range set {
			edges[from] = append(edges[from], to)
		}
		sort.Strings(edges[from])
	}
	return edges
}
