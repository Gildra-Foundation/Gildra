package mythicbuilds

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func input(name, code string) Input {
	return Input{ID: uuid.New(), Name: name, Code: code, MutationID: uuid.New()}
}
func TestBuildInputBounds(t *testing.T) {
	good := input("М+", strings.Repeat("A", 60))
	if Validate(good) != nil {
		t.Fatal("valid input rejected")
	}
	for _, modify := range []func(*Input){func(i *Input) { i.ID = uuid.Nil }, func(i *Input) { i.MutationID = uuid.Nil }, func(i *Input) { i.Name = " " }, func(i *Input) { i.Name = strings.Repeat("😀", 33) }, func(i *Input) { i.Code = "bad!" }, func(i *Input) { i.Code = strings.Repeat("A", 4097) }, func(i *Input) { i.ExpectedRevision = -1 }} {
		bad := good
		modify(&bad)
		if !errors.Is(Validate(bad), ErrInvalid) {
			t.Fatal("invalid accepted")
		}
	}
	if a, _ := OwnerKey("accountA"); len(a) != 64 {
		t.Fatal("bad key")
	}
	a, _ := OwnerKey("accountA")
	b, _ := OwnerKey("accountB")
	if a == b {
		t.Fatal("owners not isolated")
	}
}
func testService(t *testing.T) (*Service, *pgxpool.Pool, string) {
	t.Helper()
	url := os.Getenv("MYTHIC_BUILDS_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("isolated database required")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	subject := "mythic-test-" + uuid.NewString()
	hash, _ := owner(subject)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM wow_mythic_talent_builds WHERE account_hash=$1`, hash)
		pool.Close()
	})
	return NewService(pool), pool, subject
}
func TestAccountStorageIntegration(t *testing.T) {
	s, pool, a := testService(t)
	ctx := context.Background()
	b := a + "-other"
	hashB, _ := owner(b)
	defer pool.Exec(ctx, `DELETE FROM wow_mythic_talent_builds WHERE account_hash=$1`, hashB)
	first := input("Основной", strings.Repeat("A", 60))
	duplicate, err := s.Put(ctx, a, first)
	if err != nil || duplicate {
		t.Fatal(err)
	}
	if _, err = s.Put(ctx, b, first); err != nil {
		t.Fatal("same id in a different account", err)
	}
	rows, _ := s.List(ctx, a)
	if len(rows) != 1 || rows[0].Name != "Основной" || rows[0].Revision != 1 {
		t.Fatal(rows)
	}
	replay := first
	replay.Name = "Must not overwrite accepted mutation"
	if _, err = s.Put(ctx, a, replay); err != nil {
		t.Fatal(err)
	}
	renamed := first
	renamed.ExpectedRevision = 1
	renamed.MutationID = uuid.New()
	renamed.Name = "Новое имя"
	if _, err = s.Put(ctx, a, renamed); err != nil {
		t.Fatal(err)
	}
	stale := renamed
	stale.MutationID = uuid.New()
	stale.Name = "Stale"
	if _, err = s.Put(ctx, a, stale); !errors.Is(err, ErrConflict) {
		t.Fatal("stale rename accepted", err)
	}
	duplicateInput := input("Other-device name", first.Code)
	duplicate, err = s.Put(ctx, a, duplicateInput)
	if err != nil || !duplicate {
		t.Fatal("dedup failed", err)
	}
	rows, _ = s.List(ctx, a)
	if len(rows) != 1 || rows[0].ID != first.ID || rows[0].Name != "Новое имя" {
		t.Fatal(rows)
	}
	other, _ := s.List(ctx, b)
	if len(other) != 1 || other[0].Name != "Основной" {
		t.Fatal("cross-account mutation", other)
	}
	if err = s.Delete(ctx, a, first.ID, DeleteInput{ExpectedRevision: 1, MutationID: uuid.New()}); !errors.Is(err, ErrConflict) {
		t.Fatal("stale delete accepted", err)
	}
	if err = s.Delete(ctx, a, first.ID, DeleteInput{ExpectedRevision: 2, MutationID: uuid.New()}); err != nil {
		t.Fatal(err)
	}
	if err = s.Delete(ctx, a, first.ID, DeleteInput{ExpectedRevision: 2, MutationID: uuid.New()}); err != nil {
		t.Fatal("delete retry", err)
	}
	rows, _ = s.List(ctx, a)
	if len(rows) != 0 {
		t.Fatal("delete remained visible")
	}
	if _, err = s.Put(ctx, a, first); !errors.Is(err, ErrConflict) {
		t.Fatal("delayed write resurrected deleted build", err)
	}
	hash, _ := owner(a)
	var name, code string
	pool.QueryRow(ctx, `SELECT name,code FROM wow_mythic_talent_builds WHERE account_hash=$1 AND id=$2`, hash, first.ID).Scan(&name, &code)
	if name != "" || code != "" {
		t.Fatal("deleted sensitive contents retained")
	}
	if err = s.Import(ctx, a, []Input{input("Local 1", strings.Repeat("B", 60)), input("Local 2", strings.Repeat("C", 60))}); err != nil {
		t.Fatal(err)
	}
	if err = s.Import(ctx, a, []Input{input("Retry", strings.Repeat("B", 60))}); err != nil {
		t.Fatal(err)
	}
	rows, _ = s.List(ctx, a)
	if len(rows) != 2 {
		t.Fatal("migration retry duplicated rows")
	}
}
func TestConcurrentLimitAndAtomicMigration(t *testing.T) {
	s, _, account := testService(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	var mu sync.Mutex
	success, limited := 0, 0
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := s.Put(ctx, account, input("Build", strings.Repeat("A", 60)+string(rune('A'+i))))
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				success++
			} else if errors.Is(err, ErrLimit) {
				limited++
			} else {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if success != 20 || limited != 4 {
		t.Fatal("concurrent bound failed", success, limited)
	}
	before, _ := s.List(ctx, account)
	if len(before) != 20 {
		t.Fatal(len(before))
	}
	if err := s.Import(ctx, account, []Input{input("Must rollback", strings.Repeat("a", 60)), input("Must rollback too", strings.Repeat("b", 60))}); !errors.Is(err, ErrLimit) {
		t.Fatal(err)
	}
	after, _ := s.List(ctx, account)
	if len(after) != 20 {
		t.Fatal("migration partially changed library")
	}
	// Free one slot: the first migration insert succeeds internally but the second must roll it back.
	if err := s.Delete(ctx, account, before[0].ID, DeleteInput{ExpectedRevision: before[0].Revision, MutationID: uuid.New()}); err != nil {
		t.Fatal(err)
	}
	if err := s.Import(ctx, account, []Input{input("First", strings.Repeat("a", 60)), input("Second", strings.Repeat("b", 60))}); !errors.Is(err, ErrLimit) {
		t.Fatal(err)
	}
	after, _ = s.List(ctx, account)
	if len(after) != 19 {
		t.Fatal("atomic rollback failed", len(after))
	}
}
