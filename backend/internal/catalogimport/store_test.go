package catalogimport

import (
	"encoding/json"
	"testing"
)

func TestLocalizedString(t *testing.T) {
	t.Parallel()
	value := map[string]any{"en_US": "Thunderfury", "ru_RU": "Громовая Ярость"}
	if got := localizedString(value, "ru_RU"); got != "Громовая Ярость" {
		t.Fatalf("localizedString = %q", got)
	}
}

func TestDecodePayloadIsCanonical(t *testing.T) {
	t.Parallel()
	_, first, err := decodePayload(json.RawMessage(`{"name":"A","id":1}`))
	if err != nil {
		t.Fatal(err)
	}
	_, second, err := decodePayload(json.RawMessage(`{"id":1,"name":"A"}`))
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Fatalf("canonical payloads differ: %s != %s", first, second)
	}
}

func TestSlugify(t *testing.T) {
	t.Parallel()
	if got := slugify("  Громовая Ярость, благословенный клинок  "); got != "громовая-ярость-благословенный-клинок" {
		t.Fatalf("slugify = %q", got)
	}
}
