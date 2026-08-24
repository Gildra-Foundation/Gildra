package catalog

import (
	"testing"

	"github.com/google/uuid"
)

func TestRelationshipCursorRoundTrip(t *testing.T) {
	id := uuid.MustParse("33e42d68-c63d-4bee-ad94-b64cee6f10ee")
	cursor := encodeRelationshipCursor("outgoing", "owned_by", id)
	direction, relation, decodedID, err := decodeRelationshipCursor(cursor)
	if err != nil {
		t.Fatalf("decode cursor: %v", err)
	}
	if direction != "outgoing" || relation != "owned_by" || decodedID != id {
		t.Fatalf("unexpected cursor payload: %q %q %s", direction, relation, decodedID)
	}
}

func TestRelationshipCursorRejectsInvalidValue(t *testing.T) {
	if _, _, _, err := decodeRelationshipCursor("not-a-cursor"); err == nil {
		t.Fatal("expected invalid cursor error")
	}
}
