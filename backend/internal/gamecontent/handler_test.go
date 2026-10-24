package gamecontent

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPReadsArePublicOnlyAndConditional(t *testing.T) {
	s, _ := testStore(t)
	seed := exampleSeed("retail", 1800)
	release, err := s.Prepare(t.Context(), seed)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	NewHandler(s).Register(mux)
	request := func(method, path, etag string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, nil)
		r.Header.Set("If-None-Match", etag)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	path := "/v1/game-content/wow/retail/catalog"
	if w := request("GET", path, ""); w.Code != 404 {
		t.Fatalf("draft visible: %d", w.Code)
	}
	if _, err = s.Publish(t.Context(), publishReq(release.ReleaseID, 0, "public")); err != nil {
		t.Fatal(err)
	}
	w := request("GET", path, "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), release.ReleaseID) || w.Header().Get("ETag") == "" {
		t.Fatalf("catalog response: %d %s", w.Code, w.Body.String())
	}
	if cached := request("GET", path, w.Header().Get("ETag")); cached.Code != 304 || cached.Body.Len() != 0 {
		t.Fatalf("conditional GET: %d %s", cached.Code, cached.Body.String())
	}
	for _, invalid := range []string{path + "?region=eu&region=us", path + "?unknown=x", path + "?progressionKind=season", path + "?region="} {
		if w := request("GET", invalid, ""); w.Code != 400 {
			t.Fatalf("accepted invalid context %s: %d", invalid, w.Code)
		}
	}
	for _, private := range []string{path + "?channel=beta", "/v1/game-content/wow/forever/catalog", "/v1/game-content/releases/not-a-uuid/mythic-plus"} {
		if w := request("GET", private, ""); w.Code != 404 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("private/unknown response %s: %d", private, w.Code)
		}
	}
	if w := request("GET", "/v1/game-content/releases/"+release.ReleaseID+"/mythic-plus", ""); w.Code != 200 {
		t.Fatalf("snapshot: %d %s", w.Code, w.Body.String())
	}
	if w := request("POST", path, ""); w.Code != 405 {
		t.Fatalf("write endpoint unexpectedly available: %d", w.Code)
	}
}

func TestOutboxFailureRollsBackEntirePublication(t *testing.T) {
	s, db := testStore(t)
	release, err := s.Prepare(t.Context(), exampleSeed("retail", 1800))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(t.Context(), `CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
	BEGIN RAISE EXCEPTION 'injected delivery failure'; END; $$;
	CREATE TRIGGER fail_outbox BEFORE INSERT ON gc_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox();`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Publish(t.Context(), publishReq(release.ReleaseID, 0, "failed")); err == nil {
		t.Fatal("expected outbox error")
	}
	var generation, events int
	if err = db.QueryRow(t.Context(), `SELECT (SELECT generation FROM gc_publication_channels),(SELECT count(*) FROM gc_publication_events)`).Scan(&generation, &events); err != nil {
		t.Fatal(err)
	}
	if generation != 0 || events != 0 {
		t.Fatalf("partial commit: generation=%d events=%d", generation, events)
	}
	if _, err = db.Exec(t.Context(), `DROP TRIGGER fail_outbox ON gc_outbox`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Publish(t.Context(), publishReq(release.ReleaseID, 0, "failed")); err != nil {
		t.Fatalf("retry after rollback: %v", err)
	}
}
