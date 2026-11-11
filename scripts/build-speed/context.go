// Reports immutable Git context payload, using Docker's matcher, without copying
// assets, reading environment files, contacting Docker or modifying any cache.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/moby/patternmatcher"
	"github.com/moby/patternmatcher/ignorefile"
)

type Entry struct {
	Mode, Kind, OID, Path string
	Size                  int64
}
type Inventory struct {
	Files             int    `json:"files"`
	Bytes             int64  `json:"payload_bytes"`
	Fingerprint       string `json:"source_tree_fingerprint"`
	PublicFiles       int    `json:"public_files"`
	PublicBytes       int64  `json:"public_bytes"`
	PublicFingerprint string `json:"public_tree_fingerprint"`
}

func matcher(path string) (*patternmatcher.PatternMatcher, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	patterns, err := ignorefile.ReadAll(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	return patternmatcher.New(patterns)
}
func inventory(entries []Entry, m *patternmatcher.PatternMatcher) (Inventory, error) {
	var r Inventory
	h, public := sha256.New(), sha256.New()
	for _, e := range entries {
		excluded, err := m.MatchesOrParentMatches(e.Path)
		if err != nil {
			return r, err
		}
		if excluded {
			continue
		}
		r.Files++
		r.Bytes += e.Size
		// Names, modes and blob identity are all significant. Policy itself is
		// measured separately: this is NOT a BuildKit cache key or reusable image ID.
		row := fmt.Sprintf("%s\x00%s\x00%s\x00%s\x00", e.Mode, e.Kind, e.OID, e.Path)
		if e.Path != ".dockerignore" {
			h.Write([]byte(row))
		}
		if strings.HasPrefix(e.Path, "apps/web/public/") {
			r.PublicFiles++
			r.PublicBytes += e.Size
			public.Write([]byte(row))
		}
	}
	r.Fingerprint = hex.EncodeToString(h.Sum(nil))
	r.PublicFingerprint = hex.EncodeToString(public.Sum(nil))
	return r, nil
}
func tree(repo, rev string) ([]Entry, error) {
	b, err := exec.Command("git", "-C", repo, "ls-tree", "-rlz", rev).Output()
	if err != nil {
		return nil, err
	}
	var entries []Entry
	for _, record := range bytes.Split(b, []byte{0}) {
		if len(record) == 0 {
			continue
		}
		a := bytes.SplitN(record, []byte{'\t'}, 2)
		if len(a) != 2 {
			return nil, fmt.Errorf("invalid tree record")
		}
		f := strings.Fields(string(a[0]))
		if len(f) != 4 || f[1] != "blob" {
			return nil, fmt.Errorf("unsupported non-blob tree entry")
		}
		size, err := strconv.ParseInt(f[3], 10, 64)
		if err != nil {
			return nil, err
		}
		entries = append(entries, Entry{f[0], f[1], f[2], string(a[1]), size})
	}
	return entries, nil
}
func main() {
	repo := flag.String("repo", "../..", "repository")
	rev := flag.String("rev", "HEAD", "immutable revision")
	before := flag.String("before", "", "baseline ignore file")
	after := flag.String("after", "../../.dockerignore", "candidate ignore file")
	flag.Parse()
	fail := func(err error) {
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	resolved, err := exec.Command("git", "-C", *repo, "rev-parse", "--verify", "--end-of-options", *rev+"^{commit}").Output()
	fail(err)
	commit := strings.TrimSpace(string(resolved))
	entries, err := tree(*repo, commit)
	fail(err)
	result := map[string]any{"revision": commit, "note": "Tracked blob bytes, not wire bytes or a reusable image/cache identity. No secret contents read."}
	for name, p := range map[string]string{"before": *before, "after": *after} {
		m, err := matcher(p)
		fail(err)
		r, err := inventory(entries, m)
		fail(err)
		result[name] = r
		policy, err := os.ReadFile(p)
		fail(err)
		digest := sha256.Sum256(policy)
		result[name+"_policy_sha256"] = hex.EncodeToString(digest[:])
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	fail(enc.Encode(result))
}
