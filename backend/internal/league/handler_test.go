package league

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeCatalog struct{}

func (fakeCatalog) Status(context.Context) (Status, error) {
	return Status{Ready: true, DataDragonVersion: "16.17.1", ContentByCategory: map[string]int64{}, Locales: []string{"en_US", "ru_RU"}}, nil
}
func (fakeCatalog) ListChampions(context.Context, ListParams) (Page[ChampionSummary], error) {
	return Page[ChampionSummary]{Data: []ChampionSummary{}, Pagination: Pagination{Limit: 24}}, nil
}
func (fakeCatalog) Champion(_ context.Context, slug, locale string) (ChampionDetail, error) {
	if slug != "ahri" {
		return ChampionDetail{}, ErrNotFound
	}
	return ChampionDetail{ChampionSummary: ChampionSummary{ID: 103, Slug: slug, Name: "Ahri", Locale: locale, Tags: []string{"Mage"}}, Abilities: []Ability{}, Skins: []Skin{}}, nil
}
func (fakeCatalog) ListContent(context.Context, string, ListParams) (Page[ContentEntry], error) {
	return Page[ContentEntry]{Data: []ContentEntry{}, Pagination: Pagination{Limit: 24}}, nil
}

func TestHandlerIndex(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(fakeCatalog{}).Register(mux)
	request := httptest.NewRequest(http.MethodGet, apiBase, nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("status=%d", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"champions"`) {
		t.Fatalf("unexpected body %s", response.Body.String())
	}
}
func TestHandlerRejectsInvalidLocale(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(fakeCatalog{}).Register(mux)
	request := httptest.NewRequest(http.MethodGet, apiBase+"/champions?locale=xx_XX", nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != 400 {
		t.Fatalf("status=%d", response.Code)
	}
	if response.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("content type=%q", response.Header().Get("Content-Type"))
	}
}
func TestHandlerReturnsChampion(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(fakeCatalog{}).Register(mux)
	request := httptest.NewRequest(http.MethodGet, apiBase+"/champions/ahri?locale=ru_RU", nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"locale":"ru_RU"`) {
		t.Fatalf("unexpected body %s", response.Body.String())
	}
}
