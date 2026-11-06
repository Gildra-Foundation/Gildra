package datasetrefresh

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/riverqueue/river"
)

// PayloadTierDataset is one JSON-payload tier list collected by the scraper
// (scraper/parsers/tierlist_payload.py) and how often it is refreshed.
type PayloadTierDataset struct {
	Slug string
	// Daily datasets run at Hour:Minute UTC; the others every Interval.
	Interval     time.Duration
	Hour, Minute int
}

// PayloadTierDatasets are refreshed by one worker kind; each has its own
// periodic job, so a slow source never delays another one's schedule slot.
var PayloadTierDatasets = []PayloadTierDataset{
	{Slug: "tierlist-wowmeta", Interval: 24 * time.Hour, Hour: 8, Minute: 15},
	{Slug: "tierlist-method", Interval: 24 * time.Hour, Hour: 8, Minute: 45},
	{Slug: "tierlist-wythic", Interval: 12 * time.Hour},
	{Slug: "tierlist-murlok", Interval: 12 * time.Hour},
	// About 2 500 Blizzard API requests (six to eight minutes).
	{Slug: "tierlist-pvp-ladder", Interval: 12 * time.Hour},
}

func payloadTierDataset(slug string) (PayloadTierDataset, bool) {
	for _, dataset := range PayloadTierDatasets {
		if dataset.Slug == slug {
			return dataset, true
		}
	}
	return PayloadTierDataset{}, false
}

// PayloadTierRefreshArgs asks the scraper to refresh one payload tier list.
type PayloadTierRefreshArgs struct {
	Dataset      string `json:"dataset" river:"unique"`
	ScheduledFor string `json:"scheduled_for" river:"unique"`
}

func (PayloadTierRefreshArgs) Kind() string { return "dataset_tierlist_payload_refresh" }

type PayloadTierWorker struct {
	river.WorkerDefaults[PayloadTierRefreshArgs]
	httpClient Client
	baseURL    string
}

func NewPayloadTierWorker(httpClient Client, baseURL string) *PayloadTierWorker {
	return &PayloadTierWorker{httpClient: httpClient, baseURL: strings.TrimRight(baseURL, "/")}
}

func (w *PayloadTierWorker) Work(ctx context.Context, job *river.Job[PayloadTierRefreshArgs]) error {
	dataset, ok := payloadTierDataset(job.Args.Dataset)
	if !ok {
		return river.JobCancel(fmt.Errorf("unknown payload tier dataset %q", job.Args.Dataset))
	}
	return requestRefresh(ctx, w.httpClient, w.baseURL+"/internal/v1/datasets/"+dataset.Slug+"/refresh", job.Args.ScheduledFor)
}

// PayloadTierPeriodicJobs schedules every payload tier list.
func PayloadTierPeriodicJobs(now func() time.Time) []*river.PeriodicJob {
	jobs := make([]*river.PeriodicJob, 0, len(PayloadTierDatasets))
	for _, dataset := range PayloadTierDatasets {
		var schedule river.PeriodicSchedule = IntervalSchedule{Interval: dataset.Interval}
		if dataset.Interval >= 24*time.Hour {
			schedule = DailySchedule{Hour: dataset.Hour, Minute: dataset.Minute}
		}
		jobs = append(jobs, river.NewPeriodicJob(
			schedule,
			func() (river.JobArgs, *river.InsertOpts) {
				return PayloadTierRefreshArgs{Dataset: dataset.Slug, ScheduledFor: now().UTC().Format(time.DateOnly)}, &river.InsertOpts{
					Queue:       QueueName,
					MaxAttempts: 4,
					UniqueOpts:  river.UniqueOpts{ByArgs: true, ByPeriod: dataset.Interval},
				}
			},
			&river.PeriodicJobOpts{ID: dataset.Slug + "-refresh", RunOnStart: true},
		))
	}
	return jobs
}
