package pagination

import (
	"encoding/json"
	"testing"
)

func TestMakeTrimsTheProbeRowAndEncodesTheCursor(t *testing.T) {
	page := Make([]string{"a", "b", "c"}, 2, func(value string) string { return value })
	body, err := json.Marshal(page)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(body); got != `{"data":["a","b"],"pagination":{"nextCursor":"Yg","hasMore":true,"limit":2}}` {
		t.Fatalf("page = %s", got)
	}
	last := Make([]string{"a"}, 2, func(value string) string { return value })
	if last.Pagination.HasMore || last.Pagination.NextCursor != "" {
		t.Fatalf("final page = %+v", last.Pagination)
	}
}
