package genshin

import (
	"regexp"

	"github.com/Gildra-Foundation/Gildra/backend/internal/mediafiles"
)

const mediaBase = "/genshin-impact/media/"

var mediaStorageKey = regexp.MustCompile(`^genshin/[0-9a-f]{64}\.png$`)

// NewMediaHandler serves the content-addressed images imported into root.
func NewMediaHandler(root string) (*mediafiles.Handler, error) {
	return mediafiles.NewHandler(root, mediaBase, mediaStorageKey, "genshin")
}
