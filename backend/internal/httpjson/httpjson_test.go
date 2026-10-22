package httpjson

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteSetsContentTypeCachePolicyAndBody(t *testing.T) {
	recorder := httptest.NewRecorder()
	Write(recorder, http.StatusCreated, PrivateNoStore, map[string]int{"count": 2})
	if recorder.Code != http.StatusCreated || recorder.Body.String() != "{\"count\":2}\n" {
		t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
	}
	for header, want := range map[string]string{
		"Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
	} {
		if got := recorder.Header().Get(header); got != want {
			t.Fatalf("%s = %q, want %q", header, got, want)
		}
	}
}

func TestWriteProblemWithoutCachePolicy(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteProblem(recorder, http.StatusNotFound, "", Problem{Type: "t", Title: "Not Found", Status: 404, Detail: "d", Instance: "/x"})
	if got := recorder.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Fatalf("Content-Type = %q", got)
	}
	if _, ok := recorder.Header()["Cache-Control"]; ok {
		t.Fatal("empty cache policy must not set Cache-Control")
	}
	if got := recorder.Body.String(); got != "{\"type\":\"t\",\"title\":\"Not Found\",\"status\":404,\"detail\":\"d\",\"instance\":\"/x\"}\n" {
		t.Fatalf("body = %q", got)
	}
}
