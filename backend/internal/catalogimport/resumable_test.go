package catalogimport

import "testing"

func TestOnlyExplicitProtocolsRetainAFailedSnapshot(t *testing.T) {
	cases := []struct {
		source     string
		parameters map[string]any
		want       string
	}{
		{"battlenet", map[string]any{"resumable_enrichment": "v1", "missing_only": true}, "resumable_enrichment"},
		{"battlenet", map[string]any{"resumable_enrichment": "v1", "missing_only": false}, ""},
		{"battlenet", map[string]any{"missing_only": true}, ""},
		{"wago_tools", map[string]any{"resumable_tables": "v1"}, "resumable_tables"},
		{"wago_tools", map[string]any{"resumable_enrichment": "v1", "missing_only": true}, ""},
		{"raidbots", map[string]any{"resumable_tables": "v1"}, ""},
		{"wago_tools", map[string]any{}, ""},
	}
	for _, test := range cases {
		if got := ResumableSnapshotMarker(test.source, test.parameters); got != test.want {
			t.Errorf("%s %v: got %q, want %q", test.source, test.parameters, got, test.want)
		}
	}
}
