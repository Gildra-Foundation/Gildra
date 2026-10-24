package gamecontentcollect

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/riverqueue/river"
)

type CollectArgs struct {
	TargetKey    string `json:"targetKey" river:"unique"`
	RunKey       string `json:"runKey" river:"unique"`
	ScheduledFor string `json:"scheduledFor"`
}

func (CollectArgs) Kind() string { return "game_content_collect_only_v1" }

type Worker struct {
	river.WorkerDefaults[CollectArgs]
	collector *Collector
	now       func() time.Time
}

func NewWorker(c *Collector) *Worker { return &Worker{collector: c, now: time.Now} }
func (w *Worker) Work(ctx context.Context, job *river.Job[CollectArgs]) error {
	var target *Target
	for _, t := range Targets() {
		if t.Key() == job.Args.TargetKey {
			copy := t
			target = &copy
			break
		}
	}
	when, err := time.Parse(time.RFC3339, job.Args.ScheduledFor)
	if err != nil || target == nil {
		return river.JobCancel(errors.New("invalid collection job context"))
	}
	if strings.HasPrefix(job.Args.RunKey, "scheduled/") {
		if job.Args.RunKey != "scheduled/"+when.UTC().Format(time.RFC3339) || when.After(w.now()) {
			return river.JobCancel(errors.New("invalid scheduled slot"))
		}
		// Consume queued historical slots without another source fetch. Only
		// the latest due slot performs catch-up after downtime or a pause.
		if when.Before(Schedule(*target).Due(w.now())) {
			return nil
		}
	}
	r, err := w.collector.Collect(ctx, *target, job.Args.RunKey, when)
	if errors.Is(err, ErrBusy) {
		return river.JobSnooze(time.Minute)
	}
	if err == nil {
		return nil
	}
	var failure *Failure
	if errors.As(err, &failure) {
		if !failure.Retryable || r.Attempt >= 4 {
			return river.JobCancel(failure)
		}
		if failure.RetryAfter > 0 {
			return river.JobSnooze(failure.RetryAfter)
		}
	}
	return err
}

// Daily schedules are explicit UTC slots, including hours and minutes. Starting
// after downtime queues only the latest due slot, not every missed day.
type DailySchedule struct {
	Hour   int
	Minute int
}

func (s DailySchedule) Due(now time.Time) time.Time {
	u := now.UTC()
	due := time.Date(u.Year(), u.Month(), u.Day(), s.Hour, s.Minute, 0, 0, time.UTC)
	if due.After(u) {
		due = due.AddDate(0, 0, -1)
	}
	return due
}
func (s DailySchedule) Next(now time.Time) time.Time { return s.Due(now).AddDate(0, 0, 1) }
func Schedule(t Target) DailySchedule {
	if t.ModuleID == "raids" {
		return DailySchedule{3, 15}
	}
	return DailySchedule{3, 30}
}
func JobArgs(t Target, now time.Time) CollectArgs {
	slot := Schedule(t).Due(now).Format(time.RFC3339)
	return CollectArgs{TargetKey: t.Key(), RunKey: "scheduled/" + slot, ScheduledFor: slot}
}
func InsertOptions() *river.InsertOpts {
	return &river.InsertOpts{Queue: QueueName, MaxAttempts: 4, UniqueOpts: river.UniqueOpts{ByArgs: true}}
}
func PeriodicJobs(now func() time.Time) []*river.PeriodicJob {
	jobs := []*river.PeriodicJob{}
	for _, target := range Targets() {
		t := target
		jobs = append(jobs, river.NewPeriodicJob(Schedule(t), func() (river.JobArgs, *river.InsertOpts) { return JobArgs(t, now()), InsertOptions() }, &river.PeriodicJobOpts{ID: "game-content-daily-" + t.ModuleID, RunOnStart: true}))
	}
	return jobs
}
