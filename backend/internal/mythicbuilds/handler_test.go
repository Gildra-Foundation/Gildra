package mythicbuilds

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

type fakeIdentity struct{}

func (fakeIdentity) Verify(_ context.Context, token, region string) (string, error) {
	if region == "eu" && (token == "account-A" || token == "account-B" || (strings.HasPrefix(token, "mythic-fixture-") && len(token) < 80)) {
		return token, nil
	}
	return "", errors.New("invalid")
}

type stubAPI struct {
	subject string
	called  int
}

func (s *stubAPI) List(_ context.Context, subject string) ([]Build, error) {
	s.subject = subject
	s.called++
	return []Build{}, nil
}
func (s *stubAPI) Put(_ context.Context, subject string, _ Input) (bool, error) {
	s.subject = subject
	s.called++
	return false, nil
}
func (s *stubAPI) Delete(_ context.Context, subject string, _ uuid.UUID, _ DeleteInput) error {
	s.subject = subject
	s.called++
	return nil
}
func (s *stubAPI) Import(_ context.Context, subject string, _ []Input) error {
	s.subject = subject
	s.called++
	return nil
}
func TestVerifiedAccountBoundary(t *testing.T) {
	api := &stubAPI{}
	mux := http.NewServeMux()
	NewHandler(api, fakeIdentity{}).Register(mux)
	call := func(method, path, token, key, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		r.Header.Set("X-BattleNet-Region", "eu")
		r.Header.Set("X-Mythic-Account", key)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	for _, token := range []string{"", "forged"} {
		w := call("GET", "/v1/wow/mythic-builds", token, "", "")
		if w.Code != 401 || api.called != 0 {
			t.Fatal("unauthenticated access", w.Code)
		}
	}
	w := call("GET", "/v1/wow/mythic-builds?account=account-B", "account-A", "", "")
	if w.Code != 200 || api.subject != "account-A" {
		t.Fatal("query owner was trusted")
	}
	if w.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("private response cacheable")
	}
	keyB, _ := OwnerKey("account-B")
	before := api.called
	w = call("DELETE", "/v1/wow/mythic-builds/"+uuid.NewString(), "account-A", keyB, `{}`)
	if w.Code != 409 || api.called != before {
		t.Fatal("stale account header accepted")
	}
	keyA, _ := OwnerKey("account-A")
	w = call("POST", "/v1/wow/mythic-builds/import", "account-A", keyA, `{"accountSubject":"account-B","builds":[]}`)
	if w.Code != 400 || api.called != before {
		t.Fatal("client owner injection accepted")
	}
	w = call("POST", "/v1/wow/mythic-builds/import", "account-A", keyA, `{"builds":[]} {"builds":[]}`)
	if w.Code != 400 {
		t.Fatal("trailing payload accepted")
	}
}
