package rotationlab

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"
)

func TestNativeHealthAdvertisesActualSimulationConcurrency(t *testing.T) {
	for _, capacity := range []int{1, 2} {
		t.Run(strconv.Itoa(capacity), func(t *testing.T) {
			engine, _ := admissionTestEngine(t, capacity)
			// A later environment change must not advertise a different capacity
			// than the already-created engine's permits.
			t.Setenv("SIMC_CONCURRENCY", strconv.Itoa(3-capacity))
			mux := http.NewServeMux()
			NewWorkerHandler(engine).Register(mux)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
			if response.Code != http.StatusOK || response.Header().Get("X-Gildra-Simulation-Concurrency") != strconv.Itoa(capacity) || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status=%d concurrency=%q body=%s", response.Code, response.Header().Get("X-Gildra-Simulation-Concurrency"), response.Body.String())
			}
		})
	}
	t.Run("legacy-or-nonnative-engine", func(t *testing.T) {
		mux := http.NewServeMux()
		NewWorkerHandler(fakeSimulationEngine{}).Register(mux)
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		if response.Code != http.StatusOK || response.Header().Get("X-Gildra-Simulation-Concurrency") != "" {
			t.Fatal("an engine without native concurrency capability must omit the header")
		}
	})
}

func TestNativeConcurrencyConfigurationIsBounded(t *testing.T) {
	for value, want := range map[string]int{"": 1, "1": 1, "2": 2, " 2 ": 2, "0": 1, "-1": 1, "3": 1, "1000": 1, "invalid": 1} {
		t.Run(value, func(t *testing.T) {
			base, _ := admissionTestEngine(t)
			t.Setenv("SIMC_CONCURRENCY", value)
			engine, err := NewSimCEngine(base.binary, "", 750)
			if err != nil {
				t.Fatal(err)
			}
			if cap(engine.limit) != want || cap(engine.waiting) != 8 || engine.queueWait != 5*time.Second || engine.timeout != 45*time.Second {
				t.Fatal("configuration changed the native concurrency or queue/timeout bounds")
			}
			args := engine.arguments(SimulationInput{ActionListMode: ActionListModeNative}, "/report.json", "/profile.simc")
			for _, preserved := range []string{"threads=1", "deterministic=1", "iterations=750"} {
				if !containsString(args, preserved) {
					t.Fatalf("concurrency changed native precision: missing %s", preserved)
				}
			}
		})
	}
}

func TestNativeConcurrencyAdmitsTwoAndDrainsQueuedWork(t *testing.T) {
	engine, _ := admissionTestEngine(t, 2)
	for i := 0; i < 2; i++ {
		if err := engine.acquire(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	result := make(chan error, 1)
	go func() { result <- engine.acquire(context.Background()) }()
	awaitNativeWaiters(t, engine, 1)
	if len(engine.limit) != 2 {
		t.Fatal("two requests did not hold separate active permits")
	}
	engine.release()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("released capacity did not admit queued work")
	}
	engine.release()
	engine.release()
	if len(engine.limit) != 0 || len(engine.waiting) != 0 {
		t.Fatal("draining parallel work leaked capacity")
	}
}

func TestNativeConcurrencySharesBoundedQueueAndCancellationAcrossEntryPoints(t *testing.T) {
	for name, call := range admissionEntryPoints() {
		t.Run(name, func(t *testing.T) {
			engine, marker := admissionTestEngine(t, 2)
			for i := 0; i < 2; i++ {
				engine.limit <- struct{}{}
				defer engine.release()
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			results := make(chan error, 8)
			for i := 0; i < 8; i++ {
				go func() { results <- call(ctx, engine) }()
			}
			awaitNativeWaiters(t, engine, 8)
			if err := call(context.Background(), engine); !errors.Is(err, ErrSimulationBusy) {
				t.Fatalf("full shared queue: %v", err)
			}
			cancel()
			for i := 0; i < 8; i++ {
				if err := <-results; !errors.Is(err, context.Canceled) {
					t.Fatalf("cancelled request: %v", err)
				}
			}
			engine.queueWait = 10 * time.Millisecond
			if err := call(context.Background(), engine); !errors.Is(err, ErrSimulationBusy) {
				t.Fatalf("queue timeout: %v", err)
			}
			if len(engine.limit) != 2 || len(engine.waiting) != 0 {
				t.Fatal("cancel or timeout leaked admission capacity")
			}
			if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("cancelled or timed-out work reached native execution: %v", err)
			}
		})
	}
}
