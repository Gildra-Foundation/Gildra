package datasetrefresh

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/riverqueue/river"
)

const (
	QueueName              = "datasets"
	refreshPath            = "/internal/v1/datasets/tierlist-wowhead/refresh"
	archonRefreshPath      = "/internal/v1/datasets/tierlist-archon/refresh"
	wowGGRefreshPath       = "/internal/v1/datasets/tierlist-wowgg/refresh"
	icyVeinsRefreshPath    = "/internal/v1/datasets/tierlist-icyveins/refresh"
	mythicStatsRefreshPath = "/internal/v1/datasets/tierlist-mythicstats/refresh"
)

type RefreshArgs struct {
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (RefreshArgs) Kind() string { return "dataset_tierlist_wowhead_refresh" }

type ArchonRefreshArgs struct {
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (ArchonRefreshArgs) Kind() string { return "dataset_tierlist_archon_refresh" }

type WowGGRefreshArgs struct {
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (WowGGRefreshArgs) Kind() string { return "dataset_tierlist_wowgg_refresh" }

type IcyVeinsRefreshArgs struct {
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (IcyVeinsRefreshArgs) Kind() string { return "dataset_tierlist_icyveins_refresh" }

type MythicStatsRefreshArgs struct {
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (MythicStatsRefreshArgs) Kind() string { return "dataset_tierlist_mythicstats_refresh" }

type Client interface {
	Do(*http.Request) (*http.Response, error)
}

type Worker struct {
	river.WorkerDefaults[RefreshArgs]
	httpClient Client
	endpoint   string
}

type ArchonWorker struct {
	river.WorkerDefaults[ArchonRefreshArgs]
	httpClient Client
	endpoint   string
}

type WowGGWorker struct {
	river.WorkerDefaults[WowGGRefreshArgs]
	httpClient Client
	endpoint   string
}

type IcyVeinsWorker struct {
	river.WorkerDefaults[IcyVeinsRefreshArgs]
	httpClient Client
	endpoint   string
}

type MythicStatsWorker struct {
	river.WorkerDefaults[MythicStatsRefreshArgs]
	httpClient Client
	endpoint   string
}

func NewWorker(httpClient Client, baseURL string) *Worker {
	return &Worker{
		httpClient: httpClient,
		endpoint:   strings.TrimRight(baseURL, "/") + refreshPath,
	}
}

func NewArchonWorker(httpClient Client, baseURL string) *ArchonWorker {
	return &ArchonWorker{
		httpClient: httpClient,
		endpoint:   strings.TrimRight(baseURL, "/") + archonRefreshPath,
	}
}

func NewWowGGWorker(httpClient Client, baseURL string) *WowGGWorker {
	return &WowGGWorker{
		httpClient: httpClient,
		endpoint:   strings.TrimRight(baseURL, "/") + wowGGRefreshPath,
	}
}

func NewIcyVeinsWorker(httpClient Client, baseURL string) *IcyVeinsWorker {
	return &IcyVeinsWorker{
		httpClient: httpClient,
		endpoint:   strings.TrimRight(baseURL, "/") + icyVeinsRefreshPath,
	}
}

func NewMythicStatsWorker(httpClient Client, baseURL string) *MythicStatsWorker {
	return &MythicStatsWorker{
		httpClient: httpClient,
		endpoint:   strings.TrimRight(baseURL, "/") + mythicStatsRefreshPath,
	}
}

func HTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout}
}

func (w *Worker) Work(ctx context.Context, job *river.Job[RefreshArgs]) error {
	return requestRefresh(ctx, w.httpClient, w.endpoint, "tierlist-wowhead", job.Args.ScheduledFor)
}

func (w *ArchonWorker) Work(ctx context.Context, job *river.Job[ArchonRefreshArgs]) error {
	return requestRefresh(ctx, w.httpClient, w.endpoint, "tierlist-archon", job.Args.ScheduledFor)
}

func (w *WowGGWorker) Work(ctx context.Context, job *river.Job[WowGGRefreshArgs]) error {
	return requestRefresh(ctx, w.httpClient, w.endpoint, "tierlist-wowgg", job.Args.ScheduledFor)
}

func (w *IcyVeinsWorker) Work(ctx context.Context, job *river.Job[IcyVeinsRefreshArgs]) error {
	return requestRefresh(ctx, w.httpClient, w.endpoint, "tierlist-icyveins", job.Args.ScheduledFor)
}

func (w *MythicStatsWorker) Work(ctx context.Context, job *river.Job[MythicStatsRefreshArgs]) error {
	return requestRefresh(ctx, w.httpClient, w.endpoint, "tierlist-mythicstats", job.Args.ScheduledFor)
}

func requestRefresh(ctx context.Context, httpClient Client, endpoint, dataset, scheduledFor string) error {
	started := time.Now()
	slog.InfoContext(ctx, "dataset_refresh_job_started",
		"event", "dataset_refresh_job_started", "dataset", dataset, "scheduled_for", scheduledFor)
	body, err := json.Marshal(struct {
		ScheduledFor string `json:"scheduled_for"`
		Trigger      string `json:"trigger"`
	}{ScheduledFor: scheduledFor, Trigger: "scheduled"})
	if err != nil {
		return fmt.Errorf("encode dataset refresh request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create dataset refresh request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("request dataset refresh: %w", err)
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 16<<10))
	if readErr != nil {
		return fmt.Errorf("read dataset refresh response: %w", readErr)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		var failure struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(responseBody, &failure)
		if failure.Error == "" {
			failure.Error = "unknown_error"
		}
		return fmt.Errorf("dataset refresh returned %s (%s)", response.Status, failure.Error)
	}
	var result struct {
		Status          string `json:"status"`
		RunID           string `json:"run_id"`
		SnapshotID      string `json:"snapshot_id"`
		RecordCount     int    `json:"record_count"`
		UniqueSpecCount int    `json:"unique_spec_count"`
		LKGPreserved    bool   `json:"lkg_preserved"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil || result.Status == "" {
		return fmt.Errorf("decode dataset refresh response: invalid response contract")
	}
	slog.InfoContext(ctx, "dataset_refresh_job_completed",
		"event", "dataset_refresh_job_completed", "dataset", dataset,
		"scheduled_for", scheduledFor, "status", result.Status, "run_id", result.RunID,
		"snapshot_id", result.SnapshotID, "record_count", result.RecordCount,
		"unique_spec_count", result.UniqueSpecCount, "lkg_preserved", result.LKGPreserved,
		"duration_ms", time.Since(started).Milliseconds())
	return nil
}

type DailySchedule struct {
	Hour   int
	Minute int
}

func (schedule DailySchedule) Next(current time.Time) time.Time {
	utc := current.UTC()
	next := time.Date(utc.Year(), utc.Month(), utc.Day(), schedule.Hour, schedule.Minute, 0, 0, time.UTC)
	if !next.After(utc) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

func PeriodicJob(now func() time.Time) *river.PeriodicJob {
	return river.NewPeriodicJob(
		DailySchedule{Hour: 3, Minute: 15},
		func() (river.JobArgs, *river.InsertOpts) {
			return RefreshArgs{ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
				Queue:       QueueName,
				MaxAttempts: 6,
				UniqueOpts: river.UniqueOpts{
					ByArgs:   true,
					ByPeriod: 24 * time.Hour,
				},
			}
		},
		&river.PeriodicJobOpts{
			ID:         "tierlist-wowhead-daily",
			RunOnStart: true,
		},
	)
}

func ArchonPeriodicJob(now func() time.Time) *river.PeriodicJob {
	return river.NewPeriodicJob(
		DailySchedule{Hour: 4, Minute: 15},
		func() (river.JobArgs, *river.InsertOpts) {
			return ArchonRefreshArgs{ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
				Queue:       QueueName,
				MaxAttempts: 6,
				UniqueOpts: river.UniqueOpts{
					ByArgs:   true,
					ByPeriod: 24 * time.Hour,
				},
			}
		},
		&river.PeriodicJobOpts{
			ID:         "tierlist-archon-daily",
			RunOnStart: true,
		},
	)
}

type IntervalSchedule struct {
	Interval time.Duration
}

func (schedule IntervalSchedule) Next(current time.Time) time.Time {
	return current.Add(schedule.Interval)
}

func WowGGPeriodicJob(now func() time.Time) *river.PeriodicJob {
	return river.NewPeriodicJob(
		IntervalSchedule{Interval: 8 * time.Hour},
		func() (river.JobArgs, *river.InsertOpts) {
			return WowGGRefreshArgs{ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
				Queue:       QueueName,
				MaxAttempts: 6,
				UniqueOpts: river.UniqueOpts{
					ByArgs:   true,
					ByPeriod: 8 * time.Hour,
				},
			}
		},
		&river.PeriodicJobOpts{
			ID:         "tierlist-wowgg-eight-hour",
			RunOnStart: true,
		},
	)
}

func IcyVeinsPeriodicJob(now func() time.Time) *river.PeriodicJob {
	return river.NewPeriodicJob(
		DailySchedule{Hour: 5, Minute: 15},
		func() (river.JobArgs, *river.InsertOpts) {
			return IcyVeinsRefreshArgs{ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
				Queue:       QueueName,
				MaxAttempts: 6,
				UniqueOpts: river.UniqueOpts{
					ByArgs:   true,
					ByPeriod: 24 * time.Hour,
				},
			}
		},
		&river.PeriodicJobOpts{
			ID:         "tierlist-icyveins-daily",
			RunOnStart: true,
		},
	)
}

func MythicStatsPeriodicJob(now func() time.Time) *river.PeriodicJob {
	return river.NewPeriodicJob(
		DailySchedule{Hour: 6, Minute: 15},
		func() (river.JobArgs, *river.InsertOpts) {
			return MythicStatsRefreshArgs{ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
				Queue:       QueueName,
				MaxAttempts: 6,
				UniqueOpts: river.UniqueOpts{
					ByArgs:   true,
					ByPeriod: 24 * time.Hour,
				},
			}
		},
		&river.PeriodicJobOpts{
			ID:         "tierlist-mythicstats-daily",
			RunOnStart: true,
		},
	)
}
