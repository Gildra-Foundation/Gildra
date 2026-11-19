package rotationlab

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"sync"
)

// Only native item metadata is shared. Prices, character gear and combat results
// have different lifetimes. Keep a bounded FIFO so a busy realm cannot grow the worker.
const maxCachedGearVariants = 8192

type gearVariantKey [sha256.Size]byte
type cachedGearVariant struct {
	engine string
	row    json.RawMessage
}
type gearVariantCache struct {
	mu     sync.Mutex
	binary os.FileInfo
	rows   map[gearVariantKey]cachedGearVariant
	order  []gearVariantKey
	oldest int
}

func gearVariantKeys(in GearVariantRequest) []gearVariantKey {
	keys := make([]gearVariantKey, len(in.Variants))
	for i, v := range in.Variants {
		// The caller's label is echoed back, independently of the resolved data.
		data, _ := json.Marshal([]any{in.Spec, in.CharacterLevel, v.Change})
		keys[i] = sha256.Sum256(data)
	}
	return keys
}

func sameVariantBinary(a, b os.FileInfo) bool {
	return a != nil && b != nil && os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime())
}
func (c *gearVariantCache) lookup(binary os.FileInfo, keys []gearVariantKey) []cachedGearVariant {
	c.mu.Lock()
	defer c.mu.Unlock()
	hits := make([]cachedGearVariant, len(keys))
	if sameVariantBinary(binary, c.binary) {
		for i, k := range keys {
			hits[i] = c.rows[k]
		}
	}
	return hits
}
func (c *gearVariantCache) store(binary os.FileInfo, keys []gearVariantKey, out GearVariantResponse) {
	if binary == nil || out.Engine == "" || len(keys) != len(out.Variants) {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if !sameVariantBinary(binary, c.binary) {
		c.binary = binary
		c.rows = make(map[gearVariantKey]cachedGearVariant)
		c.order = nil
		c.oldest = 0
	}
	for i, row := range out.Variants {
		if row.Error != "" {
			continue
		}
		data, err := json.Marshal(row)
		if err != nil {
			continue
		}
		k := keys[i]
		if _, ok := c.rows[k]; !ok {
			if len(c.order) < maxCachedGearVariants {
				c.order = append(c.order, k)
			} else {
				delete(c.rows, c.order[c.oldest])
				c.order[c.oldest] = k
				c.oldest = (c.oldest + 1) % maxCachedGearVariants
			}
		}
		c.rows[k] = cachedGearVariant{engine: out.Engine, row: data}
	}
}
