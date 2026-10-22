package rotationlab

import (
	"strconv"
	"testing"
)

func TestSimCBaselineCacheIsBounded(t *testing.T) {
	engine := &SimCEngine{baseline: make(map[string]int)}
	for index := range maxSimCBaselines * 3 {
		engine.storeBaseline("apl-"+strconv.Itoa(index), index+1)
	}
	if len(engine.baseline) != maxSimCBaselines {
		t.Fatalf("baseline cache holds %d entries, want the bound %d", len(engine.baseline), maxSimCBaselines)
	}
	engine.storeBaseline("apl-latest", 42)
	if engine.baseline["apl-latest"] != 42 || len(engine.baseline) != maxSimCBaselines {
		t.Fatalf("latest baseline missing or bound exceeded: %d entries", len(engine.baseline))
	}
}
