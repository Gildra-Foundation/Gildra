package indexnow

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/riverqueue/river"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) Do(request *http.Request) (*http.Response, error) { return f(request) }

func TestWorkerSubmitsIndexNowPayload(t *testing.T) {
	t.Parallel()
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != endpoint {
			t.Fatalf("unexpected endpoint: %s", request.URL)
		}
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(body), `"keyLocation":"https://gildra.net/test-key.txt"`) {
			t.Fatalf("unexpected payload: %s", body)
		}
		return &http.Response{StatusCode: http.StatusAccepted, Status: "202 Accepted", Body: io.NopCloser(strings.NewReader(""))}, nil
	})
	worker := NewWorker(client, "gildra.net", "test-key")
	job := &river.Job[SubmitArgs]{Args: SubmitArgs{URLs: []string{"https://gildra.net/guides"}}}
	if err := worker.Work(context.Background(), job); err != nil {
		t.Fatal(err)
	}
}
