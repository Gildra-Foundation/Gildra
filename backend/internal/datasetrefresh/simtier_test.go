package datasetrefresh

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/riverqueue/river"
)

func TestSimTierWorkerRequestsPrivateRefreshEndpoint(t *testing.T) {
	t.Parallel()
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path = request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"skipped"}`))
	}))
	defer server.Close()

	worker := NewSimTierWorker(server.Client(), server.URL)
	err := worker.Work(context.Background(), &river.Job[SimTierRefreshArgs]{
		Args: SimTierRefreshArgs{ScheduledFor: "2026-11-06"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if path != simTierRefreshPath {
		t.Fatalf("unexpected request path: %s", path)
	}
}
