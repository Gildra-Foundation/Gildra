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
	databaseURL                string
	snapshotID                 uuid.UUID
	confirm                    bool
	projectNPC                 bool
	projectAcq                 bool
	projectLoot                bool
	projectCreatureIdentities  bool
	projectReferenceIdentities bool
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
	if opts.projectCreatureIdentities {
		facts, err := store.ProjectCreatureIdentities(ctx, opts.snapshotID)
		if err != nil {
			return err
		}
		slog.Info("ATT creature identities projected", "snapshot_id", facts.SnapshotID,
			"build_id", facts.BuildID, "evidence", facts.Evidence,
			"creature_ids", facts.CreatureIDs, "created_entities", facts.CreatedEntities,
			"created_versions", facts.CreatedVersions, "artifact_observations", facts.Observations)
		if facts.CreatedEntities > 0 || facts.CreatedVersions > 0 {
			report, err = store.ResolveSnapshot(ctx, opts.snapshotID)
			if err != nil {
				return err
			}
			logReport("ATT resolution refreshed after creature identity projection", report)
		}
	}
	if opts.projectReferenceIdentities {
		identities, err := store.ProjectReferencedIdentities(ctx, opts.snapshotID)
		if err != nil {
			return err
		}
		slog.Info("ATT referenced identities projected", "snapshot_id", identities.SnapshotID,
			"build_id", identities.BuildID, "evidence", identities.Evidence,
			"identity_ids", identities.IdentityIDs, "created_entities", identities.CreatedEntities,
			"created_versions", identities.CreatedVersions,
			"artifact_observations", identities.Observations)
		for _, entityType := range identities.Types {
			slog.Info("ATT referenced identity type projected", "entity_type", entityType.EntityType,
				"identity_ids", entityType.IdentityIDs, "created_entities", entityType.CreatedEntities,
				"created_versions", entityType.CreatedVersions,
				"artifact_observations", entityType.Observations)
		}
		if identities.CreatedEntities > 0 || identities.CreatedVersions > 0 {
			report, err = store.ResolveSnapshot(ctx, opts.snapshotID)
			if err != nil {
				return err
			}
			logReport("ATT resolution refreshed after referenced identity projection", report)
		}
	}
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
	if opts.projectLoot {
		facts, err := store.ProjectLootFacts(ctx, opts.snapshotID)
		if err != nil {
			return err
		}
		slog.Info("ATT loot facts projected", "snapshot_id", facts.SnapshotID,
			"build_id", facts.BuildID, "evidence", facts.Evidence,
			"tables", facts.Tables, "entries", facts.Entries,
			"owner_unresolved", facts.OwnerUnresolved,
			"item_source_missing", facts.ItemSourceMissing,
			"evidence_not_usable", facts.EvidenceNotUsable)
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
	projectLoot := false
	projectCreatureIdentities := false
	projectReferenceIdentities := false
	flags.StringVar(&databaseURL, "database-url", databaseURL, "PostgreSQL connection string")
	flags.StringVar(&snapshotValue, "snapshot-id", snapshotValue, "validated ATT catalog snapshot UUID")
	flags.BoolVar(&confirm, "confirm", false, "persist the previewed resolution classifications")
	flags.BoolVar(&projectNPC, "project-npc-facts", false, "project resolved quest-giver roles and coordinates")
	flags.BoolVar(&projectAcq, "project-acquisition-facts", false, "project neutral resolved provider evidence")
	flags.BoolVar(&projectLoot, "project-loot-facts", false, "project explicit ATT item-to-creature loot evidence")
	flags.BoolVar(&projectCreatureIdentities, "project-creature-identities", false, "create source-backed identities for explicit ATT creature IDs")
	flags.BoolVar(&projectReferenceIdentities, "project-reference-identities", false, "create registry-only identities for explicit ATT references")
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
	if (projectNPC || projectAcq || projectLoot || projectCreatureIdentities || projectReferenceIdentities) && !confirm {
		return options{}, errors.New("fact projection requires -confirm")
	}
	return options{databaseURL: databaseURL, snapshotID: snapshotID, confirm: confirm,
		projectNPC: projectNPC, projectAcq: projectAcq, projectLoot: projectLoot,
		projectCreatureIdentities:  projectCreatureIdentities,
		projectReferenceIdentities: projectReferenceIdentities}, nil
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
