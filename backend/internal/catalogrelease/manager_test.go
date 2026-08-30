package catalogrelease

import "testing"

func TestReleaseUsesSource(t *testing.T) {
	tests := []struct {
		name     string
		sources  []string
		expected string
		want     bool
	}{
		{name: "exact", sources: []string{"wago", "db2", "listfile"}, expected: "db2", want: true},
		{name: "normalized", sources: []string{" WAGO ", "DB2"}, expected: " db2 ", want: true},
		{name: "absent", sources: []string{"wago", "listfile"}, expected: "db2", want: false},
		{name: "empty", expected: "db2", want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := releaseUsesSource(test.sources, test.expected); got != test.want {
				t.Fatalf("releaseUsesSource(%q, %q) = %t, want %t", test.sources, test.expected, got, test.want)
			}
		})
	}
}
