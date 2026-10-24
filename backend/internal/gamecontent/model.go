// Package gamecontent owns immutable, edition-scoped content releases. Source
// collection and editorial approval are separate stages; the HTTP API only reads.
package gamecontent

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	ErrNotFound = errors.New("published content not found")
	ErrConflict = errors.New("publication generation or request conflict")
	ErrInvalid  = errors.New("invalid game content")
	identifier  = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
)

const MaxSeedBytes = 24 << 20

type Context struct {
	Game            string  `json:"game"`
	Edition         string  `json:"edition"`
	Channel         string  `json:"channel"`
	Region          string  `json:"region"`
	ProgressionKind string  `json:"progressionKind"`
	ProgressionID   *string `json:"progressionId"`
}

func (c Context) Validate() error {
	if c.Game != "wow" || (c.Edition != "retail" && c.Edition != "forever") ||
		(c.Channel != "live" && c.Channel != "beta" && c.Channel != "ptr") || !identifier.MatchString(c.Region) {
		return fmt.Errorf("%w: unsupported game, edition, channel or region", ErrInvalid)
	}
	if c.ProgressionKind == "none" && c.ProgressionID == nil {
		return nil
	}
	if (c.ProgressionKind == "season" || c.ProgressionKind == "phase") && c.ProgressionID != nil && identifier.MatchString(*c.ProgressionID) {
		return nil
	}
	return fmt.Errorf("%w: progression must be none/null, season/id or phase/id", ErrInvalid)
}

func (c Context) Key() string {
	id := "-"
	if c.ProgressionID != nil {
		id = *c.ProgressionID
	}
	return strings.Join([]string{c.Game, c.Edition, c.Channel, c.Region, c.ProgressionKind, id}, "/")
}

type Module struct {
	ModuleID      string          `json:"moduleId"`
	SchemaVersion int             `json:"schemaVersion"`
	Payload       json.RawMessage `json:"payload"`
}

type Seed struct {
	SchemaVersion int      `json:"schemaVersion"`
	Context       Context  `json:"context"`
	Modules       []Module `json:"modules"`
}

type Release struct {
	SchemaVersion int               `json:"schemaVersion"`
	ReleaseID     string            `json:"releaseId"`
	Context       Context           `json:"context"`
	ContentHash   string            `json:"contentHash"`
	Generation    int64             `json:"generation"`
	Modules       map[string]string `json:"modules"`
	PublishedAt   *time.Time        `json:"publishedAt"`
}

type Snapshot struct {
	SchemaVersion int             `json:"schemaVersion"`
	SnapshotID    string          `json:"snapshotId"`
	ReleaseID     string          `json:"releaseId"`
	Context       Context         `json:"context"`
	ModuleID      string          `json:"moduleId"`
	ContentHash   string          `json:"contentHash"`
	Payload       json.RawMessage `json:"payload"`
}

type PublishRequest struct {
	ReleaseID          string `json:"releaseId"`
	ExpectedGeneration int64  `json:"expectedGeneration"`
	RequestKey         string `json:"requestKey"`
	Actor              string `json:"actor"`
	Reason             string `json:"reason"`
	Public             bool   `json:"public"`
	Kind               string `json:"kind"`
}

type Publication struct {
	ReleaseID  string `json:"releaseId"`
	Generation int64  `json:"generation"`
	EventID    string `json:"eventId"`
}

func DecodeSeed(r io.Reader) (Seed, error) {
	var seed Seed
	raw, err := io.ReadAll(io.LimitReader(r, MaxSeedBytes+1))
	if err != nil {
		return seed, err
	}
	if len(raw) > MaxSeedBytes {
		return seed, fmt.Errorf("%w: seed exceeds size limit", ErrInvalid)
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&seed); err != nil {
		return seed, fmt.Errorf("%w: invalid seed JSON", ErrInvalid)
	}
	if d.Decode(new(any)) != io.EOF {
		return seed, fmt.Errorf("%w: trailing seed data", ErrInvalid)
	}
	return seed, seed.Validate()
}

func (s Seed) Validate() error {
	if s.SchemaVersion != 1 || len(s.Modules) == 0 || len(s.Modules) > 16 {
		return fmt.Errorf("%w: unsupported seed schema or module count", ErrInvalid)
	}
	if err := s.Context.Validate(); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, m := range s.Modules {
		if seen[m.ModuleID] {
			return fmt.Errorf("%w: duplicate module", ErrInvalid)
		}
		seen[m.ModuleID] = true
		if err := validateModule(s.Context, m); err != nil {
			return err
		}
	}
	return nil
}

// The envelope and catalog invariants are deliberately checked at the write
// boundary. Further source quality policies will be added by the collectors.
func validateModule(c Context, m Module) error {
	if m.SchemaVersion != 1 || (m.ModuleID != "raids" && m.ModuleID != "mythic-plus" && m.ModuleID != "dungeons") {
		return fmt.Errorf("%w: unsupported module/schema", ErrInvalid)
	}
	var p struct {
		Edition string `json:"edition"`
		Catalog struct {
			CurrentRaidSlug string   `json:"currentRaidSlug"`
			DungeonOrder    []string `json:"dungeonOrder"`
			Entries         []struct {
				Slug           string            `json:"slug"`
				Names          map[string]string `json:"names"`
				LocaleFallback string            `json:"localeFallback"`
				Bosses         []struct {
					Slug string `json:"slug"`
				} `json:"bosses"`
			} `json:"entries"`
			Season struct {
				Slug  string            `json:"slug"`
				Names map[string]string `json:"names"`
			} `json:"season"`
		} `json:"catalog"`
		Dungeons map[string]struct {
			Slug         string `json:"slug"`
			Name         string `json:"name"`
			NameRu       string `json:"nameRu"`
			TimerSeconds int    `json:"timerSeconds"`
			BossCount    int    `json:"bossCount"`
		} `json:"dungeons"`
	}
	if json.Unmarshal(m.Payload, &p) != nil || p.Edition != c.Edition {
		return fmt.Errorf("%w: invalid module edition/payload", ErrInvalid)
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(m.Payload, &fields) != nil {
		return fmt.Errorf("%w: invalid payload object", ErrInvalid)
	}
	required := []string{"catalog"}
	if m.ModuleID == "raids" && c.Edition == "retail" {
		required = append(required, "legacyRaids", "manifest", "strategies", "venomousIntel")
	}
	if m.ModuleID == "mythic-plus" {
		required = append(required, "combatIntel", "verification")
	}
	for _, name := range required {
		var value map[string]json.RawMessage
		if json.Unmarshal(fields[name], &value) != nil || value == nil {
			return fmt.Errorf("%w: missing %s projection", ErrInvalid, name)
		}
	}
	if m.ModuleID == "raids" && c.Edition == "retail" {
		for _, name := range []string{"venomousBosses", "difficulties", "reviews", "spellIdentities"} {
			var values []json.RawMessage
			if json.Unmarshal(fields[name], &values) != nil || values == nil {
				return fmt.Errorf("%w: missing %s projection", ErrInvalid, name)
			}
		}
		if !identifier.MatchString(p.Catalog.Season.Slug) || p.Catalog.Season.Names["en"] == "" || p.Catalog.Season.Names["ru"] == "" {
			return fmt.Errorf("%w: incomplete raid season", ErrInvalid)
		}
	}
	if m.ModuleID == "raids" {
		if len(p.Catalog.Entries) == 0 {
			return fmt.Errorf("%w: empty raid catalog", ErrInvalid)
		}
		seen := map[string]bool{}
		for _, e := range p.Catalog.Entries {
			if !identifier.MatchString(e.Slug) || seen[e.Slug] || e.Names["en"] == "" || (e.Names["ru"] == "" && e.LocaleFallback != "en") || len(e.Bosses) == 0 {
				return fmt.Errorf("%w: incomplete raid identity", ErrInvalid)
			}
			seen[e.Slug] = true
			bosses := map[string]bool{}
			for _, b := range e.Bosses {
				if !identifier.MatchString(b.Slug) || bosses[b.Slug] {
					return fmt.Errorf("%w: invalid/duplicate encounter", ErrInvalid)
				}
				bosses[b.Slug] = true
			}
		}
		if !seen[p.Catalog.CurrentRaidSlug] {
			return fmt.Errorf("%w: current raid absent", ErrInvalid)
		}
	} else {
		if !identifier.MatchString(p.Catalog.Season.Slug) || p.Catalog.Season.Names["en"] == "" || p.Catalog.Season.Names["ru"] == "" || len(p.Dungeons) == 0 {
			return fmt.Errorf("%w: incomplete dungeon catalog", ErrInvalid)
		}
		if len(p.Catalog.DungeonOrder) != len(p.Dungeons) {
			return fmt.Errorf("%w: incomplete dungeon order", ErrInvalid)
		}
		ordered := map[string]bool{}
		for _, slug := range p.Catalog.DungeonOrder {
			if _, ok := p.Dungeons[slug]; !ok || ordered[slug] {
				return fmt.Errorf("%w: invalid dungeon order", ErrInvalid)
			}
			ordered[slug] = true
		}
		for slug, d := range p.Dungeons {
			if !identifier.MatchString(slug) || slug != d.Slug || d.Name == "" || d.NameRu == "" || d.BossCount < 1 || (m.ModuleID == "mythic-plus" && d.TimerSeconds < 1) {
				return fmt.Errorf("%w: invalid dungeon identity/timer", ErrInvalid)
			}
			if m.ModuleID == "mythic-plus" {
				var intel map[string]json.RawMessage
				var dungeonIntel map[string]json.RawMessage
				if json.Unmarshal(fields["combatIntel"], &intel) != nil || json.Unmarshal(intel[slug], &dungeonIntel) != nil || dungeonIntel == nil {
					return fmt.Errorf("%w: missing dungeon combat projection", ErrInvalid)
				}
			}
		}
	}
	return nil
}

func canonical(raw json.RawMessage) ([]byte, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var value any
	if err := d.Decode(&value); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func digest(raw []byte) string { h := sha256.Sum256(raw); return hex.EncodeToString(h[:]) }

func releaseHash(modules []Module) (string, []Module, error) {
	modules = append([]Module(nil), modules...)
	sort.Slice(modules, func(i, j int) bool { return modules[i].ModuleID < modules[j].ModuleID })
	for i := range modules {
		payload, err := canonical(modules[i].Payload)
		if err != nil {
			return "", nil, err
		}
		modules[i].Payload = payload
	}
	raw, err := json.Marshal(modules)
	if err != nil {
		return "", nil, err
	}
	return digest(raw), modules, nil
}
