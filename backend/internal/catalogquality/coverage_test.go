package catalogquality

import "testing"

func TestCalculateCompleteness(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name                         string
		expected, imported, excluded int64
		missing                      int64
		status                       string
		percent                      float64
	}{
		{name: "complete", expected: 100, imported: 98, excluded: 2, status: "complete", percent: 100},
		{name: "incomplete", expected: 100, imported: 75, missing: 25, status: "incomplete", percent: 75},
		{name: "overfull", expected: 10, imported: 11, status: "overfull", percent: 110},
		{name: "empty", expected: 0, status: "complete", percent: 100},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			missing, status, percent := calculate(test.expected, test.imported, test.excluded)
			if missing != test.missing || status != test.status || percent != test.percent {
				t.Fatalf("calculate() = (%d,%q,%f), want (%d,%q,%f)",
					missing, status, percent, test.missing, test.status, test.percent)
			}
		})
	}
}
