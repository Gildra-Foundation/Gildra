package rotationlab

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func admissionTestEngine(t *testing.T) (*SimCEngine, string) {
	t.Helper()
	dir := t.TempDir()
	marker := filepath.Join(dir, "executed")
	binary := filepath.Join(dir, "native-stub")
	if err := os.WriteFile(binary, []byte(fmt.Sprintf("#!/bin/sh\nprintf x >> %q\nexit 2\n", marker)), 0o700); err != nil {
		t.Fatal(err)
	}
	engine, err := NewSimCEngine(binary, "", 1)
	if err != nil {
		t.Fatal(err)
	}
	return engine, marker
}

func awaitNativeWaiters(t *testing.T, engine *SimCEngine, count int) {
	t.Helper()
	deadline := time.After(time.Second)
	for len(engine.waiting) != count {
		select {
		case <-deadline:
			t.Fatalf("waiting requests=%d, want %d", len(engine.waiting), count)
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func TestNativeAdmissionCancellationAndTimeoutNeverExecute(t *testing.T) {
	for name, call := range admissionEntryPoints() {
		for _, cancelRequest := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/cancel=%v", name, cancelRequest), func(t *testing.T) {
				engine, marker := admissionTestEngine(t)
				engine.queueWait = 20 * time.Millisecond
				if cancelRequest {
					engine.queueWait = time.Second
				}
				engine.limit <- struct{}{}
				defer engine.release()
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				result := make(chan error, 1)
				go func() { result <- call(ctx, engine) }()
				if cancelRequest {
					awaitNativeWaiters(t, engine, 1)
					cancel()
				}
				select {
				case err := <-result:
					want := ErrSimulationBusy
					if cancelRequest {
						want = context.Canceled
					}
					if !errors.Is(err, want) {
						t.Fatalf("error=%v, want %v", err, want)
					}
				case <-time.After(time.Second):
					t.Fatal("queued request did not stop")
				}
				if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("aborted queued %s reached native execution: %v", name, err)
				}
				if len(engine.waiting) != 0 || len(engine.limit) != 1 {
					t.Fatal("aborted request leaked a waiting slot or changed the active permit")
				}
			})
		}
	}
}

func TestNativeAdmissionHasEightBoundedWaitersAndReleasesCancelledSlots(t *testing.T) {
	engine, _ := admissionTestEngine(t)
	if cap(engine.waiting) != 8 || engine.queueWait != 5*time.Second {
		t.Fatal("unexpected production queue bounds")
	}
	engine.limit <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	results := make(chan error, 8)
	for i := 0; i < 8; i++ {
		go func() { results <- engine.acquire(ctx) }()
	}
	awaitNativeWaiters(t, engine, 8)
	if err := engine.acquire(context.Background()); !errors.Is(err, ErrSimulationBusy) {
		t.Fatalf("full queue must remain bounded: %v", err)
	}
	cancel()
	for i := 0; i < 8; i++ {
		if err := <-results; !errors.Is(err, context.Canceled) {
			t.Fatalf("cancelled waiter: %v", err)
		}
	}
	if len(engine.waiting) != 0 || len(engine.limit) != 1 {
		t.Fatal("cancelled waiters leaked admission capacity")
	}
	engine.release()
	if err := engine.acquire(context.Background()); err != nil {
		t.Fatal(err)
	}
	engine.release()
}

func TestNativeAdmissionCancellationRacingWithGrantNeverLeaksPermits(t *testing.T) {
	engine, _ := admissionTestEngine(t)
	for i := 0; i < 100; i++ {
		engine.limit <- struct{}{}
		ctx, cancel := context.WithCancel(context.Background())
		result := make(chan error, 1)
		go func() { result <- engine.acquire(ctx) }()
		awaitNativeWaiters(t, engine, 1)
		start := make(chan struct{})
		var race sync.WaitGroup
		race.Add(2)
		go func() { defer race.Done(); <-start; cancel() }()
		go func() { defer race.Done(); <-start; engine.release() }()
		close(start)
		err := <-result
		race.Wait()
		if err == nil {
			engine.release()
		} else if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
		if len(engine.waiting) != 0 || len(engine.limit) != 0 {
			t.Fatalf("grant/cancel race %d leaked a permit", i)
		}
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := engine.acquire(cancelled); !errors.Is(err, context.Canceled) || len(engine.limit) != 0 {
		t.Fatal("an already-cancelled request acquired the free permit")
	}
}

func TestNativeAdmissionNeverOverlapsActiveWork(t *testing.T) {
	engine, _ := admissionTestEngine(t)
	var active, overlap atomic.Int32
	results := make(chan error, 9)
	for i := 0; i < 9; i++ {
		go func() {
			err := engine.acquire(context.Background())
			if err == nil {
				if active.Add(1) != 1 {
					overlap.Add(1)
				}
				time.Sleep(time.Millisecond)
				active.Add(-1)
				engine.release()
			}
			results <- err
		}()
	}
	for i := 0; i < 9; i++ {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	if overlap.Load() != 0 || active.Load() != 0 || len(engine.waiting) != 0 || len(engine.limit) != 0 {
		t.Fatal("native work overlapped or leaked admission capacity")
	}
}

func TestMetadataHandlerMarksFullAndTimedOutAdmissionRetryable(t *testing.T) {
	for _, full := range []bool{true, false} {
		t.Run(fmt.Sprintf("full=%v", full), func(t *testing.T) {
			engine, _ := admissionTestEngine(t)
			engine.queueWait = time.Millisecond
			engine.limit <- struct{}{}
			defer engine.release()
			if full {
				for i := 0; i < cap(engine.waiting); i++ {
					engine.waiting <- struct{}{}
				}
			}
			mux := http.NewServeMux()
			NewWorkerHandler(engine).Register(mux)
			request := `{"spec":"fury-warrior","characterLevel":81,"variants":[{"key":"head:123","change":{"slot":"head","itemId":123}}]}`
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/v1/wow/gear/variants", strings.NewReader(request)))
			if response.Code != 503 || response.Header().Get("Retry-After") != "1" {
				t.Fatalf("status=%d retry-after=%q", response.Code, response.Header().Get("Retry-After"))
			}
		})
	}
}

func admissionEntryPoints() map[string]func(context.Context, *SimCEngine) error {
	return map[string]func(context.Context, *SimCEngine) error{
		"DPS": func(ctx context.Context, engine *SimCEngine) error {
			_, err := engine.Simulate(ctx, SimulationInput{Spec: "fury-warrior", Scenario: "single-target", FightLengthSeconds: 30, Targets: 1,
				ActionListMode: ActionListModeNative, TalentLoadout: strings.Repeat("A", 30),
				Armory: &ArmorySnapshot{Profile: json.RawMessage(`{"name":"Admission probe"}`), Specializations: json.RawMessage(`{}`), Equipment: json.RawMessage(`{"equipped_items":[]}`)}})
			return err
		},
		"metadata": func(ctx context.Context, engine *SimCEngine) error {
			_, err := engine.ResolveGearVariants(ctx, GearVariantRequest{Spec: "fury-warrior", CharacterLevel: 81,
				Variants: []GearVariantInput{{Key: "head:123", Change: GearChange{Slot: "head", ItemID: 123}}}})
			return err
		},
	}
}

func TestNativeAdmissionWaitsAcrossDPSAndMetadata(t *testing.T) {
	for name, call := range admissionEntryPoints() {
		t.Run(name, func(t *testing.T) {
			engine, marker := admissionTestEngine(t)
			// Hold the same real engine permit used by both entry points.
			engine.limit <- struct{}{}
			held := true
			defer func() {
				if held {
					<-engine.limit
				}
			}()
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			result := make(chan error, 1)
			go func() { result <- call(ctx, engine) }()
			select {
			case err := <-result:
				t.Fatalf("valid concurrent %s request was rejected while the permit was held: %v; expected bounded waiting", name, err)
			case <-time.After(25 * time.Millisecond):
			}
			<-engine.limit
			held = false
			select {
			case err := <-result:
				if errors.Is(err, ErrSimulationBusy) || errors.Is(err, context.DeadlineExceeded) {
					t.Fatalf("released permit did not admit %s: %v", name, err)
				}
			case <-ctx.Done():
				t.Fatal("request did not finish after permit release")
			}
			if _, err := os.Stat(marker); err != nil {
				t.Fatalf("admitted %s did not reach native execution: %v", name, err)
			}
		})
	}
}
