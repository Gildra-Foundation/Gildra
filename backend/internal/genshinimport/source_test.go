package genshinimport

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBirthday(t *testing.T) {
	tests := []struct {
		name      string
		value     string
		wantMonth int16
		wantDay   int16
		wantNil   bool
		wantError bool
	}{
		{name: "valid", value: "8/3", wantMonth: 8, wantDay: 3},
		{name: "empty", value: "", wantNil: true},
		{name: "source placeholder", value: "0/0", wantNil: true},
		{name: "invalid month", value: "13/1", wantError: true},
		{name: "invalid format", value: "August 3", wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			month, day, err := birthday(test.value)
			if (err != nil) != test.wantError {
				t.Fatalf("error = %v, wantError = %v", err, test.wantError)
			}
			if test.wantError {
				return
			}
			if test.wantNil {
				if month != nil || day != nil {
					t.Fatalf("birthday = %v/%v, want nil", month, day)
				}
				return
			}
			if month == nil || day == nil || *month != test.wantMonth || *day != test.wantDay {
				t.Fatalf("birthday = %v/%v, want %d/%d", month, day, test.wantMonth, test.wantDay)
			}
		})
	}
}

func TestSourceMappings(t *testing.T) {
	elements := map[string]string{
		"ELEMENT_NONE":   "none",
		"ELEMENT_ANEMO":  "anemo",
		"ELEMENT_DENDRO": "dendro",
	}
	for input, want := range elements {
		got, err := characterElement(input)
		if err != nil || got != want {
			t.Errorf("characterElement(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	weapons := map[string]string{
		"WEAPON_SWORD_ONE_HAND": "sword",
		"WEAPON_CLAYMORE":       "claymore",
		"WEAPON_POLE":           "polearm",
		"WEAPON_BOW":            "bow",
		"WEAPON_CATALYST":       "catalyst",
	}
	for input, want := range weapons {
		got, err := weaponType(input)
		if err != nil || got != want {
			t.Errorf("weaponType(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
}

func TestLoadSupplementalSourcesReadsAllManifests(t *testing.T) {
	directory := t.TempDir()
	manifests := map[string]string{
		"manifest.json":              `{"name":"events","url":"https://example.test/events","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`,
		"manifest-quests-en_US.json": `{"name":"quests-en","url":"https://example.test/quests/en","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}`,
		"manifest-quests-ru_RU.json": `{"name":"quests-ru","url":"https://example.test/quests/ru","sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}`,
		"manifest-invalid.json":      `{"name":"missing-digest","url":"https://example.test/nope"}`,
	}
	for name, content := range manifests {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	sources := loadSupplementalSources(directory)
	if len(sources) != 3 {
		t.Fatalf("loaded %d supplemental sources, want 3: %#v", len(sources), sources)
	}
	if sources[0].Name != "events" || sources[1].Name != "quests-en" || sources[2].Name != "quests-ru" {
		t.Fatalf("unexpected source order/content: %#v", sources)
	}
}
