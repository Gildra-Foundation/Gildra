package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Shpuntyara/DataTest/internal/catalog"
	"github.com/Shpuntyara/DataTest/internal/raidbots"
	"github.com/Shpuntyara/DataTest/internal/store"
	"github.com/Shpuntyara/DataTest/internal/wago"
)

func main() {
	if err := run(); err != nil {
		slog.Error("command stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: datatest inspect-talents|apply-talents|enrich-items")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	switch os.Args[1] {
	case "inspect-talents":
		return inspectTalents(ctx, os.Args[2:])
	case "apply-talents":
		return applyTalents(ctx, os.Args[2:])
	case "enrich-items":
		return enrichItems(ctx, os.Args[2:])
	default:
		return fmt.Errorf("unknown command %q", os.Args[1])
	}
}

func inspectTalents(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("inspect-talents", flag.ContinueOnError)
	environment := flags.String("environment", "live", "Raidbots environment")
	if err := flags.Parse(args); err != nil {
		return err
	}
	metadata, dataset, _, err := loadTalents(ctx, *environment)
	if err != nil {
		return err
	}
	return printJSON(map[string]any{
		"environment": metadata.Environment, "build": metadata.WoWBuild,
		"content_hash": metadata.ContentHash, "talent_trees": len(dataset.Trees), "talents": len(dataset.Talents),
	})
}

func applyTalents(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("apply-talents", flag.ContinueOnError)
	environment := flags.String("environment", "live", "Raidbots environment")
	databaseURL := flags.String("database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	confirm := flags.Bool("confirm", false, "perform the transaction")
	if err := flags.Parse(args); err != nil {
		return err
	}
	metadata, dataset, client, err := loadTalents(ctx, *environment)
	if err != nil {
		return err
	}
	if !*confirm {
		return printJSON(map[string]any{"dry_run": true, "build": metadata.WoWBuild, "talent_trees": len(dataset.Trees), "talents": len(dataset.Talents)})
	}
	if *databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required with -confirm")
	}
	db, err := store.Open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.ApplyTalents(ctx, metadata, dataset, client.URL(*environment, "talents.json"))
	if err != nil {
		return err
	}
	return printJSON(result)
}

func enrichItems(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("enrich-items", flag.ContinueOnError)
	build := flags.String("build", "", "exact WoW build, e.g. 12.1.0.69404")
	databaseURL := flags.String("database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	limit := flags.Int("limit", 0, "maximum non-empty descriptions per locale; 0 means all")
	confirm := flags.Bool("confirm", false, "perform the transaction")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *build == "" {
		return errors.New("-build is required")
	}
	client := wago.New("", nil)
	rows := make([]wago.Description, 0)
	for _, locale := range []struct{ source, target string }{{"enUS", "en_US"}, {"ruRU", "ru_RU"}} {
		found, err := client.ItemDescriptions(ctx, *build, locale.source, locale.target, *limit)
		if err != nil {
			return err
		}
		rows = append(rows, found...)
	}
	if !*confirm {
		return printJSON(map[string]any{"dry_run": true, "build": *build, "descriptions_found": len(rows)})
	}
	if *databaseURL == "" {
		return errors.New("DATABASE_URL or -database-url is required with -confirm")
	}
	db, err := store.Open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	written, err := db.EnrichItems(ctx, *build, rows)
	if err != nil {
		return err
	}
	return printJSON(map[string]any{"descriptions_found": len(rows), "descriptions_written": written})
}

func loadTalents(ctx context.Context, environment string) (raidbots.Metadata, catalog.Dataset, *raidbots.Client, error) {
	client := raidbots.New("", nil)
	metadata, err := client.Metadata(ctx, environment)
	if err != nil {
		return raidbots.Metadata{}, catalog.Dataset{}, client, err
	}
	trees, err := client.TalentTrees(ctx, environment)
	if err != nil {
		return metadata, catalog.Dataset{}, client, err
	}
	dataset, err := catalog.Build(trees)
	return metadata, dataset, client, err
}

func printJSON(value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode result: %w", err)
	}
	fmt.Println(string(encoded))
	return nil
}
