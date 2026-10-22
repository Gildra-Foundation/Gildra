package league

import (
	"regexp"

	"github.com/Gildra-Foundation/Gildra/backend/internal/mediafiles"
)

const mediaBase = "/league-of-legends/media/"

var mediaStorageKey = regexp.MustCompile(`^lol/[0-9a-f]{64}\.(png|jpg|webp)$`)

// NewMediaHandler serves the content-addressed images imported into root.
func NewMediaHandler(root string) (*mediafiles.Handler, error) {
	return mediafiles.NewHandler(root, mediaBase, mediaStorageKey, "League")
}
