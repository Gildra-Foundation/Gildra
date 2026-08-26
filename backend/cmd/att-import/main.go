package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"

	"github.com/Gildra-Foundation/Gildra/backend/internal/attimport"
	"github.com/Gildra-Foundation/Gildra/backend/internal/attparser"
	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const attSource = "all_the_things"

type options struct {
	databaseURL  string
	sourceRoot   string
	revision     string
	product      string
	region       string
	buildNumber  int
	buildVersion string
	maxFiles     int
	confirm      bool
}

func main() {
	if err := run(); err != nil {
		slog.Error("ATT staging import failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	opts, err := parseOptions()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := verifyPinnedSource(ctx, opts.sourceRoot, opts.revision); err != nil {
		return err
	}
	files, err := sourceFiles(opts.sourceRoot, opts.maxFiles)
	if err != nil {
		return err
	}

	db, err := pgxpool.New(ctx, opts.databaseURL)
	if err != nil {
		return fmt.Errorf("open catalog database: %w", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping catalog database: %w", err)
	}

	catalogStore := catalogimport.NewStore(db)
	graphStore := attimport.NewStore(db)
	importContext, err := catalogStore.Begin(ctx, opts.product, opts.buildNumber, opts.buildVersion,
		opts.region, attSource, nil, map[string]any{
			"revision": opts.revision, "source_root": opts.sourceRoot,
			"file_count": len(files), "bounded": opts.maxFiles > 0, "max_files": opts.maxFiles,
			"parser": "att_static_ast_v1",
		})
	if err != nil {
		return err
	}
	var nodesSeen, rowsWritten int64
	var referencesWritten int64
	importErr := func() error {
		for _, sourceFile := range files {
			source, err := os.ReadFile(sourceFile)
			if err != nil {
				return fmt.Errorf("read ATT source %s: %w", sourceFile, err)
			}
			relativeName := filepath.ToSlash(filepath.Base(sourceFile))
			nodes, err := attparser.Parse(source, "db/Standard/Categories/"+relativeName)
			if err != nil {
				return err
			}
			var referenceCount int
			for _, node := range nodes {
				referenceCount += len(node.References)
			}
			sourceURL := immutableSourceURL(opts.revision, relativeName)
			artifactID, err := catalogStore.RegisterPendingArtifact(ctx, importContext, attSource,
				"att/db/Standard/Categories/"+relativeName, "", sourceURL, map[string]any{
					"revision": opts.revision, "file": relativeName, "parser": "att_static_ast_v1",
					"nodes": len(nodes), "references": referenceCount,
				})
			if err != nil {
				return err
			}
			result, err := importArtifact(ctx, catalogStore, graphStore, importContext, artifactID, source, nodes)
			if err != nil {
				return fmt.Errorf("stage ATT source %s: %w", relativeName, err)
			}
			nodesSeen += int64(len(nodes))
			rowsWritten += result.Nodes + result.References
			referencesWritten += result.References
			slog.Info("staged ATT source", "file", relativeName, "nodes", result.Nodes,
				"references", result.References, "revision", opts.revision)
		}
		return nil
	}()
	status := "SUCCEEDED"
	if importErr != nil {
		status = "FAILED"
	}
	if finishErr := catalogStore.FinishStaged(context.WithoutCancel(ctx), importContext.RunID, status,
		nodesSeen, rowsWritten, importErr); finishErr != nil {
		return errors.Join(importErr, fmt.Errorf("finish ATT staging import: %w", finishErr))
	}
	if importErr != nil {
		return importErr
	}
	slog.Info("ATT staging import completed", "files", len(files), "nodes", nodesSeen,
		"references", referencesWritten, "build", opts.buildVersion, "revision", opts.revision)
	return nil
}

func importArtifact(
	ctx context.Context,
	catalogStore *catalogimport.Store,
	graphStore *attimport.Store,
	importContext catalogimport.ImportContext,
	artifactID uuid.UUID,
	source []byte,
	nodes []attparser.Node,
) (result attimport.Result, resultErr error) {
	finalized := false
	defer func() {
		if finalized {
			return
		}
		if failErr := catalogStore.FailArtifact(context.WithoutCancel(ctx), artifactID, resultErr); failErr != nil {
			slog.Error("fail ATT source artifact", "artifact_id", artifactID, "error", failErr)
		}
	}()
	result, err := graphStore.ReplaceFile(ctx, importContext, artifactID, attSource, nodes)
	if err != nil {
		return attimport.Result{}, err
	}
	digest := sha256.Sum256(source)
	if err := catalogStore.CompleteArtifact(ctx, artifactID, digest[:], int64(len(source)), ""); err != nil {
		return attimport.Result{}, err
	}
	finalized = true
	return result, nil
}

func parseOptions() (options, error) {
	opts := options{}
	flag.StringVar(&opts.databaseURL, "database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection string")
	flag.StringVar(&opts.sourceRoot, "source-root", os.Getenv("ATT_SOURCE_ROOT"), "ATT db/Standard/Categories directory")
	flag.StringVar(&opts.revision, "revision", os.Getenv("ATT_SOURCE_REVISION"), "pinned 40-character ATT Git revision")
	flag.StringVar(&opts.product, "product", "wow", "game_products slug")
	flag.StringVar(&opts.region, "region", "us", "catalog namespace region")
	flag.IntVar(&opts.buildNumber, "build", intEnvironment("BATTLENET_BUILD_NUMBER"), "positive WoW build number")
	flag.StringVar(&opts.buildVersion, "version", os.Getenv("BATTLENET_BUILD_VERSION"), "WoW build version")
	flag.IntVar(&opts.maxFiles, "max-files", 1, "maximum sorted Lua files; 0 stages all files")
	flag.BoolVar(&opts.confirm, "confirm", false, "confirm an unbounded full source import")
	flag.Parse()

	opts.databaseURL = strings.TrimSpace(opts.databaseURL)
	opts.sourceRoot = strings.TrimSpace(opts.sourceRoot)
	opts.revision = strings.ToLower(strings.TrimSpace(opts.revision))
	opts.product = strings.TrimSpace(opts.product)
	opts.region = strings.ToLower(strings.TrimSpace(opts.region))
	opts.buildVersion = strings.TrimSpace(opts.buildVersion)
	switch {
	case opts.databaseURL == "":
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	case opts.sourceRoot == "":
		return options{}, errors.New("ATT_SOURCE_ROOT or -source-root is required")
	case !validRevision(opts.revision):
		return options{}, errors.New("ATT revision must be a lowercase 40-character Git hash")
	case opts.buildNumber <= 0 || opts.buildVersion == "":
		return options{}, errors.New("positive build number and build version are required")
	case !strings.HasSuffix(opts.buildVersion, "."+strconv.Itoa(opts.buildNumber)):
		return options{}, errors.New("build version must end with the configured build number")
	case opts.product == "" || opts.region == "":
		return options{}, errors.New("product and region are required")
	case opts.maxFiles < 0:
		return options{}, errors.New("max-files cannot be negative")
	case opts.maxFiles == 0 && !opts.confirm:
		return options{}, errors.New("full ATT staging import requires -confirm")
	}
	return opts, nil
}

func validRevision(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}

func verifyPinnedSource(ctx context.Context, root, expectedRevision string) error {
	root, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve ATT source root: %w", err)
	}
	command := exec.CommandContext(ctx, "git", "-C", root, "rev-parse", "HEAD")
	output, err := command.Output()
	if err != nil {
		return fmt.Errorf("read ATT source revision: %w", err)
	}
	if revision := strings.ToLower(strings.TrimSpace(string(output))); revision != expectedRevision {
		return fmt.Errorf("ATT source revision is %s, expected %s", revision, expectedRevision)
	}
	command = exec.CommandContext(ctx, "git", "-C", root, "status", "--porcelain", "--untracked-files=no", "--", ".")
	output, err = command.Output()
	if err != nil {
		return fmt.Errorf("check ATT source worktree: %w", err)
	}
	if len(bytes.TrimSpace(output)) != 0 {
		return errors.New("ATT source contains modified tracked files")
	}
	return nil
}

func sourceFiles(root string, limit int) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("read ATT source root: %w", err)
	}
	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.Type().IsRegular() && strings.EqualFold(filepath.Ext(entry.Name()), ".lua") {
			files = append(files, filepath.Join(root, entry.Name()))
		}
	}
	sort.Strings(files)
	if limit > 0 && len(files) > limit {
		files = files[:limit]
	}
	if len(files) == 0 {
		return nil, errors.New("ATT source root contains no Lua files")
	}
	return files, nil
}

func immutableSourceURL(revision, fileName string) string {
	return "https://raw.githubusercontent.com/ATTWoWAddon/AllTheThings/" + revision +
		"/db/Standard/Categories/" + url.PathEscape(fileName)
}

func intEnvironment(name string) int {
	value, _ := strconv.Atoi(strings.TrimSpace(os.Getenv(name)))
	return value
}
