package analytics

import (
	"math"
	"testing"
)

func TestAnalyticsCount(t *testing.T) {
	tests := []struct {
		name  string
		value uint64
		want  int64
	}{
		{name: "zero", value: 0, want: 0},
		{name: "regular count", value: 42, want: 42},
		{name: "maximum API count", value: math.MaxInt64, want: math.MaxInt64},
		{name: "overflow is saturated", value: math.MaxUint64, want: math.MaxInt64},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := analyticsCount(test.value); got != test.want {
				t.Fatalf("analyticsCount(%d) = %d, want %d", test.value, got, test.want)
			}
		})
	}
}
