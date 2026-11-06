package datasetrefresh

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/riverqueue/river"
)

type recordingClient struct{ url string }

func (c *recordingClient) Do(request *http.Request) (*http.Response, error) {
	c.url = request.URL.String()
	return &http.Response{StatusCode: http.StatusOK, Status: "200 OK", Body: io.NopCloser(strings.NewReader(`{}`))}, nil
}

func TestPayloadTierWorkerCallsTheDatasetEndpoint(t *testing.T) {
	client := &recordingClient{}
	worker := NewPayloadTierWorker(client, "http://scraper:8081/")
	job := &river.Job[PayloadTierRefreshArgs]{Args: PayloadTierRefreshArgs{Dataset: "tierlist-pvp-ladder", ScheduledFor: "2026-11-06"}}
	if err := worker.Work(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if client.url != "http://scraper:8081/internal/v1/datasets/tierlist-pvp-ladder/refresh" {
		t.Fatalf("url = %s", client.url)
	}
	job.Args.Dataset = "../../admin"
	if err := worker.Work(context.Background(), job); err == nil {
		t.Fatal("an unknown dataset must be refused")
	}
}

func TestPayloadTierPeriodicJobsCoverEveryDataset(t *testing.T) {
	jobs := PayloadTierPeriodicJobs(func() time.Time { return time.Date(2026, 11, 6, 9, 0, 0, 0, time.UTC) })
	if len(jobs) != len(PayloadTierDatasets) {
		t.Fatalf("jobs = %d", len(jobs))
	}
	seen := map[string]bool{}
	for _, dataset := range PayloadTierDatasets {
		if seen[dataset.Slug] || !strings.HasPrefix(dataset.Slug, "tierlist-") || dataset.Interval < 12*time.Hour {
			t.Fatalf("bad dataset %#v", dataset)
		}
		seen[dataset.Slug] = true
	}
}
