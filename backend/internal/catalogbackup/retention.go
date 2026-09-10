package catalogbackup

import (
	"context"
	"fmt"
	"strings"
)

// RetainLocalVerified expires old verified PostgreSQL manifests and removes
// exactly their local archive and signed sidecar. Database marking happens
// first so a failed filesystem cleanup cannot make an old artifact appear
// current to the release gate; the expired manifest remains an audit record.
func RetainLocalVerified(ctx context.Context, repository PostgresManifestRepository, store *LocalStore, product string, keep int) (int, error) {
	if store == nil {
		return 0, fmt.Errorf("local backup store is required")
	}
	product = strings.TrimSpace(product)
	if product == "" {
		return 0, fmt.Errorf("backup product is required")
	}
	expired, err := repository.ExpireVerified(ctx, product, keep)
	if err != nil {
		return 0, err
	}
	for _, manifest := range expired {
		key, err := store.KeyFromURI(manifest.StorageURI)
		if err != nil {
			return 0, fmt.Errorf("expired manifest %s has unsafe storage URI: %w", manifest.ID, err)
		}
		if err := store.Delete(key); err != nil {
			return 0, fmt.Errorf("delete expired backup %s: %w", manifest.ID, err)
		}
		if err := store.Delete(key + ".manifest.json"); err != nil {
			return 0, fmt.Errorf("delete expired backup evidence %s: %w", manifest.ID, err)
		}
	}
	return len(expired), nil
}
