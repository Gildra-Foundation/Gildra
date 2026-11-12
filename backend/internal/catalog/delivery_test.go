package catalog

import (
	"github.com/google/uuid"
	"testing"
)

func TestDeliveryCursorScope(t *testing.T) {
	p := SummaryParams{Type: "item", Sort: "current", Dataset: "weapons"}
	scope := deliveryScope(p, "wow", "ru_RU", "generation-a")
	c := deliveryCursor{V: 2, Scope: scope, ID: uuid.New(), Expansion: 11, Level: 285, External: 270402, Name: "меч"}
	token := encodeDeliveryCursor(c)
	decoded, err := decodeDeliveryCursor(token, scope)
	if err != nil || decoded != c {
		t.Fatalf("round trip %+v %v", decoded, err)
	}
	for _, other := range []string{deliveryScope(p, "wow", "en_US", "generation-a"), deliveryScope(p, "wow", "ru_RU", "generation-b")} {
		if _, err := decodeDeliveryCursor(token, other); err == nil {
			t.Fatal("cross scope cursor accepted")
		}
	}
	p.Sort = "name_asc"
	if _, err := decodeDeliveryCursor(token, deliveryScope(p, "wow", "ru_RU", "generation-a")); err == nil {
		t.Fatal("changed sort accepted")
	}
	if summaryUsesOrdering(SummaryParams{Type: "item", Cursor: encodeCursor(uuid.New())}) {
		t.Fatal("legacy cursor must retain ID order")
	}
	if !summaryUsesOrdering(SummaryParams{Type: "item"}) {
		t.Fatal("item default must use current order")
	}
	if summaryUsesOrdering(SummaryParams{Type: "item", Query: "Fireball"}) {
		t.Fatal("search must retain relevance")
	}
	for _, s := range []string{"current", "name_asc", "name_desc", "item_level_asc", "item_level_desc", "required_level_asc", "required_level_desc", "id"} {
		if err := validateSummarySort(s); err != nil {
			t.Fatal(err)
		}
	}
	if validateSummarySort("name;drop table x") == nil {
		t.Fatal("invalid sort accepted")
	}
}
