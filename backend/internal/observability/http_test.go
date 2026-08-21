package observability

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPAddsRequestIDAndPreservesStatus(t *testing.T) {
	t.Parallel()
	handler := HTTP(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if RequestID(request.Context()) == "" {
			t.Fatal("request ID missing from context")
		}
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte("ok"))
	}))
	request := httptest.NewRequest(http.MethodPost, "/v1/test?token=secret", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d, want %d", response.Code, http.StatusCreated)
	}
	if response.Header().Get("X-Request-ID") == "" {
		t.Fatal("X-Request-ID response header is missing")
	}
}
