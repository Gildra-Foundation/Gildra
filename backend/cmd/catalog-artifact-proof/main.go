// catalog-artifact-proof completes the provenance proof of source artifacts
// whose records were stored but whose content hash and byte size were never
// recorded.  The proof is the same deterministic manifest of stored source
// records that importers use (catalogimport.Store.CompleteArtifactFromRecords),
// so it never fabricates provenance: an artifact without stored records is
// left untouched and reported.
//
//	catalog-artifact-proof -source raidbots            # report only
//	catalog-artifact-proof -source raidbots -confirm   # complete proofs
package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
)

func main() {
	if err := run(); err != nil {
		slog.Error("catalog artifact proof failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	var databaseURL, source string
	var confirm, fetch bool
	var timeout time.Duration
	flag.StringVar(&databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&source, "source", "", "registered source key whose ready artifacts lack a proof (required)")
	flag.BoolVar(&confirm, "confirm", false, "write the computed proofs; without it the tool only reports")
	flag.BoolVar(&fetch, "fetch", false, "for artifacts without stored records, download source_url again and prove the file itself (only when the source still serves the same content)")
	flag.DurationVar(&timeout, "timeout", 30*time.Minute, "operation timeout")
	flag.Parse()
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}
	if databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required")
	}
	if source == "" {
		return errors.New("-source is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()

	rows, err := db.Query(ctx, `
		SELECT artifact.id, artifact.artifact_key, artifact.source_url,
			(SELECT count(*) FROM catalog_source_records record WHERE record.artifact_id=artifact.id)
		FROM catalog_source_artifacts artifact
		WHERE artifact.source=$1 AND artifact.status='ready'
		  AND (artifact.content_hash IS NULL OR artifact.byte_size IS NULL)
		ORDER BY artifact.fetched_at, artifact.artifact_key`, source)
	if err != nil {
		return fmt.Errorf("list artifacts without proof: %w", err)
	}
	type candidate struct {
		id      uuid.UUID
		key     string
		url     string
		records int64
	}
	candidates := make([]candidate, 0)
	for rows.Next() {
		var item candidate
		if err := rows.Scan(&item.id, &item.key, &item.url, &item.records); err != nil {
			rows.Close()
			return fmt.Errorf("scan artifact: %w", err)
		}
		candidates = append(candidates, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	slog.Info("artifacts without proof", "source", source, "count", len(candidates), "confirm", confirm)

	store := catalogimport.NewStore(db)
	completed, skipped := 0, 0
	for _, item := range candidates {
		if item.records == 0 {
			if !fetch {
				slog.Warn("artifact has no stored records; proof cannot be derived", "artifact", item.id, "key", item.key)
				skipped++
				continue
			}
			if !confirm {
				slog.Info("would download and prove", "artifact", item.id, "key", item.key, "url", item.url)
				continue
			}
			hash, size, err := digestURL(ctx, item.url)
			if err != nil {
				return fmt.Errorf("prove %s from %s: %w", item.key, item.url, err)
			}
			if err := store.CompleteArtifact(ctx, item.id, hash, size, ""); err != nil {
				return fmt.Errorf("complete proof for %s (%s): %w", item.key, item.id, err)
			}
			slog.Info("completed proof from source file", "artifact", item.id, "key", item.key, "bytes", size)
			completed++
			continue
		}
		if !confirm {
			slog.Info("would complete proof", "artifact", item.id, "key", item.key, "records", item.records)
			continue
		}
		proof, err := store.CompleteArtifactFromRecords(ctx, item.id)
		if err != nil {
			return fmt.Errorf("complete proof for %s (%s): %w", item.key, item.id, err)
		}
		slog.Info("completed proof", "artifact", item.id, "key", item.key, "records", proof.RecordCount, "bytes", proof.ByteSize)
		completed++
	}
	slog.Info("done", "completed", completed, "skipped_without_records", skipped, "candidates", len(candidates))
	return nil
}

// digestURL downloads a source file and returns its SHA-256 and byte size.
func digestURL(ctx context.Context, url string) ([]byte, int64, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("User-Agent", "Gildra/1.0 (+https://gildra.net)")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, 0, fmt.Errorf("source returned %s", response.Status)
	}
	digest := sha256.New()
	size, err := io.Copy(digest, response.Body)
	if err != nil {
		return nil, 0, err
	}
	return digest.Sum(nil), size, nil
}
