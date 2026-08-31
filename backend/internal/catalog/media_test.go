package catalog

import (
	"testing"

	"github.com/google/uuid"
)

func TestTooltipMediaUsesResolvedEntityURLs(t *testing.T) {
	entityID := uuid.New()
	unknownID := uuid.New()
	blocks := []map[string]any{{
		"type": "loot",
		"entries": []any{
			map[string]any{"item_entity_id": entityID.String(), "icon_name": "external_icon"},
			map[string]any{"entity_id": unknownID.String(), "icon_name": "missing_icon"},
		},
	}}
	ids := make(map[uuid.UUID]struct{})
	collectTooltipEntityIDs(blocks, ids)
	if len(ids) != 2 {
		t.Fatalf("collected entity IDs = %d, want 2", len(ids))
	}
	localURL := "https://api.gildra.net/v1/media/" + uuid.NewString()
	attachTooltipMediaURLs(blocks, map[uuid.UUID]string{entityID: localURL})
	entries := blocks[0]["entries"].([]any)
	resolved := entries[0].(map[string]any)
	missing := entries[1].(map[string]any)
	if resolved["icon_url"] != localURL {
		t.Fatalf("resolved icon URL = %#v, want local cached URL", resolved["icon_url"])
	}
	if _, exists := missing["icon_url"]; exists {
		t.Fatalf("missing cached media must not receive an icon URL: %#v", missing)
	}
}

func TestTooltipMediaDoesNotGuessBetweenTwoEntityIDs(t *testing.T) {
	object := map[string]any{
		"source_entity_id": uuid.NewString(),
		"target_entity_id": uuid.NewString(),
	}
	attachTooltipMediaURLs(object, map[uuid.UUID]string{})
	if _, exists := object["icon_url"]; exists {
		t.Fatalf("ambiguous relationship object must not receive one guessed icon: %#v", object)
	}
}

func TestIconURLFromName(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		input string
		want  string
		ok    bool
	}{
		{name: "normalizes", input: " Spell_Fire_Flamebolt ", want: "https://render.worldofwarcraft.com/eu/icons/56/spell_fire_flamebolt.jpg", ok: true},
		{name: "allows digits", input: "inv_sword_93", want: "https://render.worldofwarcraft.com/eu/icons/56/inv_sword_93.jpg", ok: true},
		{name: "rejects path", input: "../secret", ok: false},
		{name: "rejects query", input: "spell?x=1", ok: false},
		{name: "rejects empty", input: " ", ok: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, ok := iconURLFromName(test.input)
			if ok != test.ok || (ok && got != test.want) {
				t.Fatalf("iconURLFromName(%q)=(%q,%v), want (%q,%v)", test.input, got, ok, test.want, test.ok)
			}
		})
	}
}
