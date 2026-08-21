package indexnow

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const endpoint = "https://api.indexnow.org/indexnow"

type SubmitArgs struct {
	URLs []string `json:"urls"`
}

func (SubmitArgs) Kind() string { return "indexnow_submit" }

type Client interface {
	Do(*http.Request) (*http.Response, error)
}

type Worker struct {
	river.WorkerDefaults[SubmitArgs]
	httpClient Client
	host       string
	key        string
}

func NewWorker(httpClient Client, host, key string) *Worker {
	return &Worker{httpClient: httpClient, host: host, key: key}
}

func (w *Worker) Work(ctx context.Context, job *river.Job[SubmitArgs]) error {
	payload := struct {
		Host        string   `json:"host"`
		Key         string   `json:"key"`
		KeyLocation string   `json:"keyLocation"`
		URLList     []string `json:"urlList"`
	}{w.host, w.key, "https://" + w.host + "/" + w.key + ".txt", job.Args.URLs}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode IndexNow payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create IndexNow request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("submit IndexNow request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("IndexNow returned %s", resp.Status)
	}
	return nil
}

type Queue struct {
	client *river.Client[pgx.Tx]
	host   string
}

func NewQueue(client *river.Client[pgx.Tx], host string) *Queue {
	return &Queue{client: client, host: host}
}

func (q *Queue) Submit(ctx context.Context, urls []string) error {
	if len(urls) == 0 {
		return errors.New("at least one URL is required")
	}
	for _, raw := range urls {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Port() != "" || !strings.EqualFold(parsed.Hostname(), q.host) {
			return fmt.Errorf("URL %q must be an HTTPS URL on %s", raw, q.host)
		}
	}
	_, err := q.client.Insert(ctx, SubmitArgs{URLs: urls}, &river.InsertOpts{MaxAttempts: 8})
	if err != nil {
		return fmt.Errorf("enqueue IndexNow job: %w", err)
	}
	return nil
}

func HTTPClient() *http.Client { return &http.Client{Timeout: 15 * time.Second} }
