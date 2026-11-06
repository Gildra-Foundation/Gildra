package datasetrefresh

import (
	"context"
	"strings"
	"time"

	"github.com/riverqueue/river"
)

const simTierRefreshPath = "/internal/v1/datasets/tierlist-mythistone-sim/refresh"

// SimTierRefreshArgs refreshes the mythistone.com simulated DPS tier list.
type SimTierRefreshArgs struct {
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (SimTierRefreshArgs) Kind() string { return "dataset_tierlist_mythistone_sim_refresh" }

type SimTierWorker struct {
	river.WorkerDefaults[SimTierRefreshArgs]
	httpClient Client
	endpoint   string
}

func NewSimTierWorker(httpClient Client, baseURL string) *SimTierWorker {
	return &SimTierWorker{
		httpClient: httpClient,
		endpoint:   strings.TrimRight(baseURL, "/") + simTierRefreshPath,
	}
}

func (w *SimTierWorker) Work(ctx context.Context, job *river.Job[SimTierRefreshArgs]) error {
	return requestRefresh(ctx, w.httpClient, w.endpoint, job.Args.ScheduledFor)
}

// SimTierPeriodicJob refreshes once a day: the source re-simulates every few
// days, its page is fetched directly (no proxy credits), and an unchanged page
// publishes no new snapshot.
func SimTierPeriodicJob(now func() time.Time) *river.PeriodicJob {
	return river.NewPeriodicJob(
		DailySchedule{Hour: 7, Minute: 15},
		func() (river.JobArgs, *river.InsertOpts) {
			return SimTierRefreshArgs{ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
				Queue:       QueueName,
				MaxAttempts: 4,
				UniqueOpts: river.UniqueOpts{
					ByArgs:   true,
					ByPeriod: 24 * time.Hour,
				},
			}
		},
		&river.PeriodicJobOpts{
			ID:         "tierlist-mythistone-sim-daily",
			RunOnStart: true,
		},
	)
}
