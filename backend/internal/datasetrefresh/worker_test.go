package datasetrefresh

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/riverqueue/river"
)

func TestWorkerRequestsPrivateRefreshEndpoint(t *testing.T) {
	t.Parallel()
	var method, path, body string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		method = request.Method
		path = request.URL.Path
		payload, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		body = string(payload)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"succeeded"}`))
	}))
	defer server.Close()

	worker := NewWorker(server.Client(), server.URL)
	err := worker.Work(context.Background(), &river.Job[RefreshArgs]{
		Args: RefreshArgs{ScheduledFor: "2026-08-21"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if method != http.MethodPost || path != refreshPath {
		t.Fatalf("unexpected request: %s %s", method, path)
	}
	if body != `{"scheduled_for":"2026-08-21","trigger":"scheduled"}` {
		t.Fatalf("unexpected request body: %s", body)
	}
}

func TestArchonWorkerRequestsPrivateRefreshEndpoint(t *testing.T) {
	t.Parallel()
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path = request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"succeeded"}`))
	}))
	defer server.Close()

	worker := NewArchonWorker(server.Client(), server.URL)
	err := worker.Work(context.Background(), &river.Job[ArchonRefreshArgs]{
		Args: ArchonRefreshArgs{ScheduledFor: "2026-08-21"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if path != archonRefreshPath {
		t.Fatalf("unexpected request path: %s", path)
	}
}

func TestWowGGWorkerRequestsPrivateRefreshEndpoint(t *testing.T) {
	t.Parallel()
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path = request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"succeeded"}`))
	}))
	defer server.Close()

	worker := NewWowGGWorker(server.Client(), server.URL)
	err := worker.Work(context.Background(), &river.Job[WowGGRefreshArgs]{
		Args: WowGGRefreshArgs{ScheduledFor: "2026-08-21"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if path != wowGGRefreshPath {
		t.Fatalf("unexpected request path: %s", path)
	}
}

func TestIcyVeinsWorkerRequestsPrivateRefreshEndpoint(t *testing.T) {
	t.Parallel()
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path = request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"succeeded"}`))
	}))
	defer server.Close()

	worker := NewIcyVeinsWorker(server.Client(), server.URL)
	err := worker.Work(context.Background(), &river.Job[IcyVeinsRefreshArgs]{
		Args: IcyVeinsRefreshArgs{ScheduledFor: "2026-08-21"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if path != icyVeinsRefreshPath {
		t.Fatalf("unexpected request path: %s", path)
	}
}

func TestMythicStatsWorkerRequestsPrivateRefreshEndpoint(t *testing.T) {
	t.Parallel()
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path = request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"status":"succeeded"}`))
	}))
	defer server.Close()

	worker := NewMythicStatsWorker(server.Client(), server.URL)
	err := worker.Work(context.Background(), &river.Job[MythicStatsRefreshArgs]{
		Args: MythicStatsRefreshArgs{ScheduledFor: "2026-08-21"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if path != mythicStatsRefreshPath {
		t.Fatalf("unexpected request path: %s", path)
	}
}

func TestWorkerRejectsFailedRefresh(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, `{"error":"refresh_failed"}`, http.StatusInternalServerError)
	}))
	defer server.Close()

	worker := NewWorker(server.Client(), server.URL)
	if err := worker.Work(context.Background(), &river.Job[RefreshArgs]{}); err == nil {
		t.Fatal("expected a non-2xx response to fail the River job")
	}
}

func TestDailySchedule(t *testing.T) {
	t.Parallel()
	schedule := DailySchedule{Hour: 3, Minute: 15}
	tests := []struct {
		current time.Time
		want    time.Time
	}{
		{
			time.Date(2026, 8, 21, 2, 0, 0, 0, time.FixedZone("local", 2*60*60)),
			time.Date(2026, 8, 21, 3, 15, 0, 0, time.UTC),
		},
		{
			time.Date(2026, 8, 21, 3, 15, 0, 0, time.UTC),
			time.Date(2026, 8, 22, 3, 15, 0, 0, time.UTC),
		},
	}
	for _, test := range tests {
		if got := schedule.Next(test.current); !got.Equal(test.want) {
			t.Fatalf("Next(%s) = %s, want %s", test.current, got, test.want)
		}
	}
}

func TestIntervalSchedule(t *testing.T) {
	t.Parallel()
	current := time.Date(2026, 8, 21, 4, 30, 0, 0, time.UTC)
	want := current.Add(8 * time.Hour)
	if got := (IntervalSchedule{Interval: 8 * time.Hour}).Next(current); !got.Equal(want) {
		t.Fatalf("Next(%s) = %s, want %s", current, got, want)
	}
}
