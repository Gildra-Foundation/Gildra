package catalog

import (
	"testing"

	"github.com/google/uuid"
)

func TestCursorRoundTrip(t *testing.T) {
	t.Parallel()
	want := uuid.MustParse("2ee4ba23-c3f5-49ac-9d40-9d5467e95070")
	got, err := decodeCursor(encodeCursor(want))
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("cursor decoded to %s, want %s", got, want)
	}
}

func TestDecodeCursorRejectsInvalidValue(t *testing.T) {
	t.Parallel()
	if _, err := decodeCursor("not-a-cursor"); err == nil {
		t.Fatal("expected invalid cursor error")
	}
}
