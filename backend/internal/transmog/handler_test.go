package transmog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fixedStore struct{ index *Index }

func (s fixedStore) Index(context.Context) (*Index, error) { return s.index, nil }

func testIndex() *Index {
	names := func(en, ru string) map[string]string { return map[string]string{"en_US": en, "ru_RU": ru} }
	looks := []*look{
		{ModifiedAppearanceID: 10, ItemID: 100, AppearanceID: 1, DisplayID: 1001, InventoryType: 1, ClassID: 4, SubclassID: 4, Quality: 4, IconName: "helm_a", Names: names("Eternal Crown of Justice", "Вечная корона Правосудия")},
		{ModifiedAppearanceID: 11, ItemID: 101, AppearanceID: 1, DisplayID: 1001, InventoryType: 1, ClassID: 4, SubclassID: 4, Quality: 3, IconName: "helm_a", Names: names("Plain Helm", "Простой шлем")},
		{ModifiedAppearanceID: 12, ItemID: 200, AppearanceID: 2, DisplayID: 2002, InventoryType: 1, ClassID: 4, SubclassID: 1, Quality: 4, IconName: "hood", Names: names("Hood of Ёlves", "Капюшон ёлок")},
		{ModifiedAppearanceID: 13, ItemID: 300, AppearanceID: 3, DisplayID: 3003, InventoryType: 20, ClassID: 4, SubclassID: 1, Quality: 4, IconName: "robe", Names: names("Robe", "Мантия")},
		{ModifiedAppearanceID: 14, ItemID: 400, AppearanceID: 4, DisplayID: 4004, InventoryType: 13, ClassID: 2, SubclassID: 7, Quality: 4, IconName: "sword", Names: names("Sword", "Меч")},
		{ModifiedAppearanceID: 15, ItemID: 500, AppearanceID: 5, DisplayID: 0, InventoryType: 1, Names: names("No model", "")},
		{ModifiedAppearanceID: 16, ItemID: 600, AppearanceID: 6, DisplayID: 6006, InventoryType: 2, Names: names("Necklace", "Ожерелье")},
	}
	sets := []*set{
		{ID: 7, ClassMask: 2, Names: names("Eternal Judgment Armor", "Вечные доспехи Правосудия"), Looks: []int64{10, 13, 14, 99}},
		{ID: 8, ClassMask: 0, Names: names("Necklaces only", "Только ожерелья"), Looks: []int64{16}},
	}
	return newIndex(92, looks, sets)
}

func get(t *testing.T, handler http.Handler, target string, want int) map[string]any {
	t.Helper()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	if recorder.Code != want {
		t.Fatalf("%s: status %d, want %d: %s", target, recorder.Code, want, recorder.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: decode: %v", target, err)
	}
	return body
}

func serve() http.Handler {
	mux := http.NewServeMux()
	NewHandler(fixedStore{testIndex()}).Register(mux)
	return mux
}

func TestAppearancesGroupLooksAndFilterBySlot(t *testing.T) {
	body := get(t, serve(), "/v1/wow/transmog/appearances?slot=head&locale=ru_RU", http.StatusOK)
	data := body["data"].([]any)
	if body["total"].(float64) != 2 || len(data) != 2 {
		t.Fatalf("head looks = %v, want two appearances (no model and duplicates dropped)", body)
	}
	first := data[0].(map[string]any)
	if first["name"] != "Капюшон ёлок" || first["viewerSlot"].(float64) != 1 {
		t.Fatalf("newest head look = %v", first)
	}
	crown := data[1].(map[string]any)
	if crown["itemCount"].(float64) != 2 || crown["name"] != "Вечная корона Правосудия" {
		t.Fatalf("shared appearance = %v, want representative with item count 2", crown)
	}
}

func TestAppearanceSearchMatchesAnyItemAndFoldsYo(t *testing.T) {
	handler := serve()
	plain := get(t, handler, "/v1/wow/transmog/appearances?slot=head&q=%D0%BF%D1%80%D0%BE%D1%81%D1%82%D0%BE%D0%B9&locale=ru_RU", http.StatusOK)
	hit := plain["data"].([]any)[0].(map[string]any)
	if hit["name"] != "Простой шлем" || hit["displayId"].(float64) != 1001 {
		t.Fatalf("search by second item = %v", hit)
	}
	yo := get(t, handler, "/v1/wow/transmog/appearances?slot=head&q=%D0%B5%D0%BB%D0%BE%D0%BA&locale=ru_RU", http.StatusOK)
	if yo["total"].(float64) != 1 {
		t.Fatalf("ё folding: %v", yo)
	}
	plate := get(t, handler, "/v1/wow/transmog/appearances?slot=head&armor=plate", http.StatusOK)
	if plate["total"].(float64) != 1 {
		t.Fatalf("armor filter: %v", plate)
	}
}

func TestWeaponsAndRobesUseViewerSlots(t *testing.T) {
	handler := serve()
	offHand := get(t, handler, "/v1/wow/transmog/appearances?slot=off-hand", http.StatusOK)["data"].([]any)[0].(map[string]any)
	if offHand["viewerSlot"].(float64) != 22 {
		t.Fatalf("one-hander in off hand = %v, want viewer slot 22", offHand)
	}
	chest := get(t, handler, "/v1/wow/transmog/appearances?slot=chest", http.StatusOK)["data"].([]any)[0].(map[string]any)
	if chest["viewerSlot"].(float64) != 20 {
		t.Fatalf("robe = %v, want viewer slot 20", chest)
	}
}

func TestSetsListOnlyWearableSetsAndDetailHasOneLookPerSlot(t *testing.T) {
	handler := serve()
	list := get(t, handler, "/v1/wow/transmog/sets?locale=ru_RU&class=2", http.StatusOK)
	if list["total"].(float64) != 1 {
		t.Fatalf("sets = %v, want only the wearable set", list)
	}
	summary := list["data"].([]any)[0].(map[string]any)
	if summary["iconName"] != "robe" || summary["itemCount"].(float64) != 3 {
		t.Fatalf("summary = %v", summary)
	}
	if get(t, handler, "/v1/wow/transmog/sets?class=1", http.StatusOK)["total"].(float64) != 0 {
		t.Fatal("class filter kept a paladin set for warriors")
	}
	detail := get(t, handler, "/v1/wow/transmog/sets/7", http.StatusOK)
	items := detail["items"].([]any)
	if len(items) != 3 || items[0].(map[string]any)["slot"] != "head" || items[2].(map[string]any)["slot"] != "main-hand" {
		t.Fatalf("set items = %v", items)
	}
	get(t, handler, "/v1/wow/transmog/sets/8", http.StatusNotFound)
	get(t, handler, "/v1/wow/transmog/sets/abc", http.StatusBadRequest)
}

func TestResolveAndValidation(t *testing.T) {
	handler := serve()
	resolved := get(t, handler, "/v1/wow/transmog/appearances?ids=14,999,10", http.StatusOK)["data"].([]any)
	if len(resolved) != 2 || resolved[0].(map[string]any)["modifiedAppearanceId"].(float64) != 14 {
		t.Fatalf("resolve = %v", resolved)
	}
	get(t, handler, "/v1/wow/transmog/appearances?slot=neck", http.StatusBadRequest)
	get(t, handler, "/v1/wow/transmog/appearances?slot=head&armor=bone", http.StatusBadRequest)
	get(t, handler, "/v1/wow/transmog/appearances?slot=head&limit=500", http.StatusBadRequest)
	get(t, handler, "/v1/wow/transmog/appearances?ids=1,x", http.StatusBadRequest)
	page := get(t, handler, "/v1/wow/transmog/appearances?slot=head&limit=1", http.StatusOK)
	next := get(t, handler, "/v1/wow/transmog/appearances?slot=head&limit=1&cursor="+page["nextCursor"].(string), http.StatusOK)
	if next["data"].([]any)[0].(map[string]any)["appearanceId"].(float64) != 1 || next["nextCursor"] != nil {
		t.Fatalf("second page = %v", next)
	}
}

type loadingStore struct{}

func (loadingStore) Index(ctx context.Context) (*Index, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestSlowFirstLoadAnswersRetryLater(t *testing.T) {
	previous := indexWait
	indexWait = 20 * time.Millisecond
	defer func() { indexWait = previous }()
	mux := http.NewServeMux()
	NewHandler(loadingStore{}).Register(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/wow/transmog/sets", nil))
	if recorder.Code != http.StatusServiceUnavailable || recorder.Header().Get("Retry-After") == "" {
		t.Fatalf("loading index: status %d, Retry-After %q", recorder.Code, recorder.Header().Get("Retry-After"))
	}
}
