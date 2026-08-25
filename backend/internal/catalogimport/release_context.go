package catalogimport

import (
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
)

const releaseIDEnvironment = "CATALOG_RELEASE_ID"

func ReleaseIDFromEnvironment() (*uuid.UUID, error) {
	raw := strings.TrimSpace(os.Getenv(releaseIDEnvironment))
	if raw == "" {
		return nil, nil
	}
	releaseID, err := uuid.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", releaseIDEnvironment, err)
	}
	return &releaseID, nil
}
