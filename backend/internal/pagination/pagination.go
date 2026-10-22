// Package pagination builds the keyset pages returned by the Genshin Impact
// and League of Legends APIs: the service loads limit+1 rows and the page
// carries an opaque cursor for the last returned item.
package pagination

import "encoding/base64"

// Info is the "pagination" object of a page.
type Info struct {
	NextCursor string `json:"nextCursor,omitempty"`
	HasMore    bool   `json:"hasMore"`
	Limit      int    `json:"limit"`
}

// Page is one page of items.
type Page[T any] struct {
	Data       []T  `json:"data"`
	Pagination Info `json:"pagination"`
}

// Make trims items loaded with limit+1 rows to limit and, when more remain,
// sets the cursor to the encoded key of the last returned item.
func Make[T any](items []T, limit int, key func(T) string) Page[T] {
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	page := Page[T]{Data: items, Pagination: Info{HasMore: hasMore, Limit: limit}}
	if hasMore && len(items) > 0 {
		page.Pagination.NextCursor = EncodeCursor(key(items[len(items)-1]))
	}
	return page
}

// EncodeCursor makes a URL-safe opaque cursor. Each API validates decoded
// cursors with its own rules.
func EncodeCursor(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}
