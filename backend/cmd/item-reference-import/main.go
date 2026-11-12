// Command item-reference-import loads the client tables behind item tooltip
// numbers (see internal/itemscaling) for one already imported build. It writes
// only catalog_item_reference_sources and catalog_item_reference_rows, so it
// is safe for a published build: no entity, version or projection is touched.
package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Gildra-Foundation/Gildra/backend/internal/itemscaling"
	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "item-reference-import:", err)
		os.Exit(1)
	}
}

func run() error {
	databaseURL := flag.String("database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	product := flag.String("product", "wow", "game_products slug")
	version := flag.String("version", "", "imported WoW build version, for example 12.1.0.69587")
	confirm := flag.Bool("confirm", false, "download the tables and replace the stored ones for this build")
	flag.Parse()
	if *databaseURL == "" {
		*databaseURL = os.Getenv("DATABASE_URL")
	}
	if *databaseURL == "" || *version == "" {
		return errors.New("-version and DATABASE_URL (or -database-url) are required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, *databaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()
	var buildID int64
	err = db.QueryRow(ctx, `SELECT build.id FROM game_builds build JOIN game_products product ON product.id=build.product_id
		WHERE product.slug=$1 AND build.version=$2`, *product, *version).Scan(&buildID)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("build %s of %s is not imported", *version, *product)
	}
	if err != nil {
		return fmt.Errorf("find build: %w", err)
	}
	rows, proofs, err := itemscaling.Fetch(ctx, itemscaling.WagoSource{Client: wago.New(wago.Config{})}, *version)
	if err != nil {
		return err
	}
	type tableReport struct {
		Table  string `json:"table"`
		Rows   int    `json:"rows"`
		Bytes  int64  `json:"bytes"`
		SHA256 string `json:"sha256"`
	}
	report := struct {
		DryRun  bool          `json:"dry_run"`
		Build   string        `json:"build"`
		BuildID int64         `json:"build_id"`
		Rows    int           `json:"rows"`
		Tables  []tableReport `json:"tables"`
	}{DryRun: !*confirm, Build: *version, BuildID: buildID, Rows: len(rows)}
	for _, proof := range proofs {
		report.Tables = append(report.Tables, tableReport{proof.Table, proof.Rows, proof.ByteSize, hex.EncodeToString(proof.SHA256)})
	}
	if *confirm {
		if err := itemscaling.Store(ctx, db, buildID, rows, proofs); err != nil {
			return err
		}
	}
	encoded, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(encoded))
	return nil
}
