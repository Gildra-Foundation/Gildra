package catalogmedia

import (
	"errors"
	"fmt"
)

// sourceStatusError is a non-200 answer from a media source.
type sourceStatusError struct {
	host   string
	status int
}

func (e sourceStatusError) Error() string { return fmt.Sprintf("HTTP %d", e.status) }

// errBlankRender marks a creature render that shows only the empty stage.
var errBlankRender = errors.New("creature render is an empty backdrop")

// sourceLacksAsset reports whether every source that was asked answered that
// it does not have the asset. The render hosts answer 403 or 404 for a file
// they do not have. Wago answers 403 to bursts as well, so only its 404 counts.
// Throttling, server errors, timeouts and anything else are not an answer
// about the asset and must not put it aside.
func sourceLacksAsset(err error) bool {
	if err == nil {
		return false
	}
	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		parts := joined.Unwrap()
		for _, part := range parts {
			if !sourceLacksAsset(part) {
				return false
			}
		}
		return len(parts) > 0
	}
	var status sourceStatusError
	if errors.As(err, &status) {
		if status.host == "wago.tools" {
			return status.status == 404
		}
		return status.status == 403 || status.status == 404 || status.status == 410
	}
	return errors.Is(err, errBlankRender)
}
