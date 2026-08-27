package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/attimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type options struct {
	databaseURL string
	snapshotID  uuid.UUID
	confirm     bool
	projectNPC  bool
	projectAcq  bool
}

func main() {
	if err := run(os.Args[1:], os.Getenv); err != nil {
		slog.Error("ATT resolution failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string, getenv func(string) string) error {
	opts, err := parseOptions(args, getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping catalog database: %w", err)
	}

	store := attimport.NewStore(db)
	preview, err := store.PreviewSnapshot(ctx, opts.snapshotID)
	if err != nil {
		return err
	}
	logReport("ATT resolution preview", preview)
	if !opts.confirm {
		slog.Info("ATT resolution is read-only; pass -confirm to persist these classifications",
			"snapshot_id", opts.snapshotID)
		return nil
	}

	report, err := store.ResolveSnapshotIfMatches(ctx, opts.snapshotID, preview)
	if err != nil {
		return err
	}
	logReport("ATT resolution completed", report)
	if opts.projectNPC {
		facts, err := store.ProjectNPCFacts(ctx, opts.snapshotID)
		if err != nil {
			return err
		}
		slog.Info("ATT NPC facts projected", "snapshot_id", facts.SnapshotID,
			"build_id", facts.BuildID, "roles", facts.Roles, "locations", facts.Locations)
	}
	if opts.projectAcq {
		facts, err := store.ProjectAcquisitionFacts(ctx, opts.snapshotID)
		if err != nil {
			return err
		}
		slog.Info("ATT acquisition facts projected", "snapshot_id", facts.SnapshotID,
			"build_id", facts.BuildID, "acquisitions", facts.Acquisitions)
	}
	return nil
}

func parseOptions(args []string, getenv func(string) string) (options, error) {
	flags := flag.NewFlagSet("att-resolve", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	databaseURL := strings.TrimSpace(getenv("DATABASE_URL"))
	snapshotValue := strings.TrimSpace(getenv("ATT_SNAPSHOT_ID"))
	confirm := false
	projectNPC := false
	projectAcq := false
	flags.StringVar(&databaseURL, "database-url", databaseURL, "PostgreSQL connection string")
	flags.StringVar(&snapshotValue, "snapshot-id", snapshotValue, "validated ATT catalog snapshot UUID")
	flags.BoolVar(&confirm, "confirm", false, "persist the previewed resolution classifications")
	flags.BoolVar(&projectNPC, "project-npc-facts", false, "project resolved quest-giver roles and coordinates")
	flags.BoolVar(&projectAcq, "project-acquisition-facts", false, "project neutral resolved provider evidence")
	if err := flags.Parse(args); err != nil {
		return options{}, err
	}
	if len(flags.Args()) != 0 {
		return options{}, errors.New("positional arguments are not supported")
	}
	databaseURL = strings.TrimSpace(databaseURL)
	if databaseURL == "" {
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	}
	snapshotID, err := uuid.Parse(strings.TrimSpace(snapshotValue))
	if err != nil || snapshotID == uuid.Nil {
		return options{}, errors.New("ATT_SNAPSHOT_ID or -snapshot-id must be a non-zero UUID")
	}
	if (projectNPC || projectAcq) && !confirm {
		return options{}, errors.New("fact projection requires -confirm")
	}
	return options{databaseURL: databaseURL, snapshotID: snapshotID, confirm: confirm,
		projectNPC: projectNPC, projectAcq: projectAcq}, nil
}

func logReport(message string, report attimport.ResolutionReport) {
	slog.Info(message,
		"snapshot_id", report.SnapshotID,
		"build_id", report.BuildID,
		"source", report.Source,
		"nodes_total", report.Nodes.Total,
		"nodes_resolved", report.Nodes.Resolved,
		"nodes_unresolved", report.Nodes.Unresolved,
		"nodes_ambiguous", report.Nodes.Ambiguous,
		"nodes_excluded", report.Nodes.Excluded,
		"references_total", report.References.Total,
		"references_resolved", report.References.Resolved,
		"references_unresolved", report.References.Unresolved,
		"references_ambiguous", report.References.Ambiguous,
		"references_excluded", report.References.Excluded,
	)
}
