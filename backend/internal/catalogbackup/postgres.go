package catalogbackup

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ArchiveTool interface {
	Dump(context.Context, string, string, io.Writer) error
	Restore(context.Context, string, io.Reader) error
}

type PostgresOperator struct {
	Archive ArchiveTool
}

func (p PostgresOperator) SnapshotAndDump(ctx context.Context, databaseURL string, destination io.Writer) (State, error) {
	if p.Archive == nil {
		return State{}, errors.New("PostgreSQL archive tool is required")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return State{}, fmt.Errorf("open source PostgreSQL: %w", err)
	}
	defer pool.Close()
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return State{}, fmt.Errorf("begin source snapshot: %w", err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	state, err := inspectState(ctx, tx)
	if err != nil {
		return State{}, err
	}
	if err := state.Validate(); err != nil {
		return State{}, err
	}
	var snapshotID string
	if err := tx.QueryRow(ctx, `SELECT pg_export_snapshot()`).Scan(&snapshotID); err != nil {
		return State{}, fmt.Errorf("export PostgreSQL snapshot: %w", err)
	}
	if err := p.Archive.Dump(ctx, databaseURL, snapshotID, destination); err != nil {
		return State{}, err
	}
	return state, nil
}

func (p PostgresOperator) RestoreAndInspect(ctx context.Context, databaseURL string, source io.Reader) (State, error) {
	if p.Archive == nil {
		return State{}, errors.New("PostgreSQL archive tool is required")
	}
	if err := ensureEmptyRestoreTarget(ctx, databaseURL); err != nil {
		return State{}, err
	}
	if err := p.Archive.Restore(ctx, databaseURL, source); err != nil {
		return State{}, err
	}
	return inspectRestoredState(ctx, databaseURL)
}

// LightArchiveTool reads a custom-format archive from a stream without a
// second copy of the database.
type LightArchiveTool interface {
	// ArchiveTOC returns the `pg_restore --list` table of contents.
	ArchiveTOC(context.Context, io.Reader) (string, error)
	// ArchiveParse decompresses and parses every block of the archive.
	ArchiveParse(context.Context, io.Reader) error
	// RestoreWithList restores only the entries enabled in the list file.
	RestoreWithList(ctx context.Context, databaseURL, listPath string, source io.Reader) error
}

var _ LightRestoreOperator = PostgresOperator{}

func (p PostgresOperator) RestoreLightAndInspect(ctx context.Context, databaseURL string, open func() (io.ReadCloser, error), source State, maxTableRows, maxTableBytes int64) (State, LightRestoreReport, error) {
	tool, ok := p.Archive.(LightArchiveTool)
	if !ok {
		return State{}, LightRestoreReport{}, errors.New("PostgreSQL archive tool does not support light restore")
	}
	if err := ensureEmptyRestoreTarget(ctx, databaseURL); err != nil {
		return State{}, LightRestoreReport{}, err
	}
	// Each pass reads a fresh decrypted stream and drains it so the age
	// authentication tag of the whole object is checked every time.
	pass := func(run func(io.Reader) error) error {
		stream, err := open()
		if err != nil {
			return err
		}
		defer stream.Close()
		if err := run(stream); err != nil {
			return err
		}
		_, err = io.Copy(io.Discard, stream)
		return err
	}
	var toc string
	if err := pass(func(r io.Reader) (err error) { toc, err = tool.ArchiveTOC(ctx, r); return }); err != nil {
		return State{}, LightRestoreReport{}, err
	}
	list, report, err := BuildLightRestoreList(toc, source.Counts, source.TableBytes, maxTableRows, maxTableBytes)
	if err != nil {
		return State{}, LightRestoreReport{}, err
	}
	if err := pass(func(r io.Reader) error { return tool.ArchiveParse(ctx, r) }); err != nil {
		return State{}, LightRestoreReport{}, err
	}
	listFile, err := os.CreateTemp("", "gildra-restore-list-*")
	if err != nil {
		return State{}, LightRestoreReport{}, fmt.Errorf("create restore list: %w", err)
	}
	defer os.Remove(listFile.Name())
	if _, err := listFile.WriteString(list); err != nil {
		_ = listFile.Close()
		return State{}, LightRestoreReport{}, fmt.Errorf("write restore list: %w", err)
	}
	if err := listFile.Close(); err != nil {
		return State{}, LightRestoreReport{}, fmt.Errorf("write restore list: %w", err)
	}
	if err := pass(func(r io.Reader) error { return tool.RestoreWithList(ctx, databaseURL, listFile.Name(), r) }); err != nil {
		return State{}, LightRestoreReport{}, err
	}
	state, err := inspectRestoredState(ctx, databaseURL)
	return state, report, err
}

var lightTableDataEntry = regexp.MustCompile(`^\d+; \d+ \d+ TABLE DATA (\S+) (\S+)(?: |$)`)

// BuildLightRestoreList turns a `pg_restore --list` table of contents into a
// `--use-list` file for a light restore. Data of tables with more than
// maxTableRows rows or maxTableBytes bytes (or not counted at all),
// materialized-view refreshes and
// foreign keys are commented out: with partial data the foreign keys cannot
// hold, and the large tables are proven empty instead of copied.
func BuildLightRestoreList(toc string, counts, tableBytes map[string]int64, maxTableRows, maxTableBytes int64) (string, LightRestoreReport, error) {
	var out strings.Builder
	restored := []string{}
	skipped := []string{}
	for _, line := range strings.Split(toc, "\n") {
		trimmed := strings.TrimRight(line, "\r")
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, ";") {
			out.WriteString(trimmed + "\n")
			continue
		}
		if match := lightTableDataEntry.FindStringSubmatch(trimmed); match != nil {
			schema, table := match[1], match[2]
			count, counted := counts[table]
			small := count <= maxTableRows
			if small && maxTableBytes > 0 && tableBytes != nil {
				// A table without a recorded size is treated as large.
				size, known := tableBytes[table]
				small = known && size <= maxTableBytes
			}
			if schema == "public" && counted && small {
				restored = append(restored, table)
				out.WriteString(trimmed + "\n")
				continue
			}
			if schema == "public" && counted {
				skipped = append(skipped, table)
			}
			out.WriteString(";" + trimmed + "\n")
			continue
		}
		if strings.Contains(trimmed, " FK CONSTRAINT ") || strings.Contains(trimmed, " MATERIALIZED VIEW DATA ") {
			out.WriteString(";" + trimmed + "\n")
			continue
		}
		out.WriteString(trimmed + "\n")
	}
	sort.Strings(restored)
	sort.Strings(skipped)
	if len(restored)+len(skipped) == 0 {
		return "", LightRestoreReport{}, errors.New("archive table of contents lists no counted table data")
	}
	return out.String(), LightRestoreReport{RestoredTables: restored, SkippedDataTables: skipped}, nil
}

func ensureEmptyRestoreTarget(ctx context.Context, databaseURL string) error {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open restore PostgreSQL: %w", err)
	}
	defer pool.Close()
	var userRelations int64
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM pg_class relation
		JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
		WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
		  AND namespace.nspname NOT LIKE 'pg_toast%'
		  AND relation.relkind IN ('r','p','v','m','S','f')`).Scan(&userRelations); err != nil {
		return fmt.Errorf("inspect restore target: %w", err)
	}
	if userRelations != 0 {
		return fmt.Errorf("restore database is not empty: found %d user relations", userRelations)
	}
	return nil
}

func inspectRestoredState(ctx context.Context, databaseURL string) (State, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return State{}, fmt.Errorf("reopen restored PostgreSQL: %w", err)
	}
	defer pool.Close()
	state, err := inspectState(ctx, pool)
	if err != nil {
		return State{}, err
	}
	if err := state.Validate(); err != nil {
		return State{}, err
	}
	return state, nil
}

type stateQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func inspectState(ctx context.Context, queryer stateQueryer) (State, error) {
	state := State{Counts: make(map[string]int64, len(CriticalTables)), TableBytes: make(map[string]int64, len(CriticalTables))}
	if err := queryer.QueryRow(ctx, `SELECT COALESCE(max(version_id),0) FROM goose_db_version WHERE is_applied`).Scan(&state.DatabaseVersion); err != nil {
		return State{}, fmt.Errorf("read database migration version: %w", err)
	}
	rows, err := queryer.Query(ctx, `
		SELECT relation.relname
		FROM pg_class relation
		JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
		WHERE namespace.nspname='public'
		  AND relation.relkind IN ('r','p')
		  AND relation.relname <> 'catalog_backup_manifests'
		ORDER BY relation.relname`)
	if err != nil {
		return State{}, fmt.Errorf("list user tables for backup verification: %w", err)
	}
	tables := make([]string, 0, len(CriticalTables))
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			rows.Close()
			return State{}, fmt.Errorf("read user table for backup verification: %w", err)
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return State{}, fmt.Errorf("list user tables for backup verification: %w", err)
	}
	rows.Close()
	for _, table := range tables {
		query := `SELECT count(*) FROM ` + pgx.Identifier{table}.Sanitize()
		var count int64
		if err := queryer.QueryRow(ctx, query).Scan(&count); err != nil {
			return State{}, fmt.Errorf("count critical table %s: %w", table, err)
		}
		state.Counts[table] = count
		var size int64
		if err := queryer.QueryRow(ctx, `SELECT pg_total_relation_size($1::regclass)`, pgx.Identifier{"public", table}.Sanitize()).Scan(&size); err != nil {
			return State{}, fmt.Errorf("size critical table %s: %w", table, err)
		}
		state.TableBytes[table] = size
	}
	return state, nil
}

type ProcessArchiveTool struct {
	DumpBinary    string
	RestoreBinary string
}

func (p ProcessArchiveTool) Dump(ctx context.Context, databaseURL, snapshotID string, destination io.Writer) error {
	binary := p.DumpBinary
	if binary == "" {
		binary = "pg_dump"
	}
	command := exec.CommandContext(ctx, binary,
		"--format=custom",
		"--compress=6",
		"--no-owner",
		"--no-privileges",
		"--snapshot="+snapshotID,
	)
	environment, err := databaseEnvironment(databaseURL)
	if err != nil {
		return err
	}
	command.Env = environment
	command.Stdout = destination
	stderr := &boundedBuffer{limit: 8192}
	command.Stderr = stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("pg_dump failed: %w: %s", err, redactDatabaseURL(stderr.String(), databaseURL))
	}
	return nil
}

func (p ProcessArchiveTool) Restore(ctx context.Context, databaseURL string, source io.Reader) error {
	binary := p.RestoreBinary
	if binary == "" {
		binary = "pg_restore"
	}
	target, err := parseDatabaseTarget(databaseURL)
	if err != nil {
		return err
	}
	command := exec.CommandContext(ctx, binary,
		"--exit-on-error",
		"--no-owner",
		"--no-privileges",
		"--dbname="+target.database,
	)
	environment, err := databaseEnvironment(databaseURL)
	if err != nil {
		return err
	}
	command.Env = environment
	command.Stdin = source
	stderr := &boundedBuffer{limit: 8192}
	command.Stderr = stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("pg_restore failed: %w: %s", err, redactDatabaseURL(stderr.String(), databaseURL))
	}
	return nil
}

func (p ProcessArchiveTool) restoreBinary() string {
	if p.RestoreBinary != "" {
		return p.RestoreBinary
	}
	return "pg_restore"
}

func (p ProcessArchiveTool) ArchiveTOC(ctx context.Context, source io.Reader) (string, error) {
	command := exec.CommandContext(ctx, p.restoreBinary(), "--list")
	command.Stdin = source
	var output bytes.Buffer
	command.Stdout = &output
	stderr := &boundedBuffer{limit: 8192}
	command.Stderr = stderr
	if err := command.Run(); err != nil {
		return "", fmt.Errorf("pg_restore --list failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return output.String(), nil
}

func (p ProcessArchiveTool) ArchiveParse(ctx context.Context, source io.Reader) error {
	command := exec.CommandContext(ctx, p.restoreBinary(), "--file="+os.DevNull)
	command.Stdin = source
	stderr := &boundedBuffer{limit: 8192}
	command.Stderr = stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("pg_restore archive read failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

func (p ProcessArchiveTool) RestoreWithList(ctx context.Context, databaseURL, listPath string, source io.Reader) error {
	target, err := parseDatabaseTarget(databaseURL)
	if err != nil {
		return err
	}
	command := exec.CommandContext(ctx, p.restoreBinary(),
		"--exit-on-error",
		"--no-owner",
		"--no-privileges",
		"--use-list="+listPath,
		"--dbname="+target.database,
	)
	environment, err := databaseEnvironment(databaseURL)
	if err != nil {
		return err
	}
	command.Env = environment
	command.Stdin = source
	stderr := &boundedBuffer{limit: 8192}
	command.Stderr = stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("pg_restore failed: %w: %s", err, redactDatabaseURL(stderr.String(), databaseURL))
	}
	return nil
}

func databaseEnvironment(databaseURL string) ([]string, error) {
	target, err := parseDatabaseTarget(databaseURL)
	if err != nil {
		return nil, err
	}

	environment := make([]string, 0, len(os.Environ())+16)
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		if isLibPQConnectionEnvironment(key) {
			continue
		}
		environment = append(environment, value)
	}
	environment = append(environment,
		"PGHOST="+target.host,
		"PGPORT="+strconv.Itoa(target.port),
		"PGDATABASE="+target.database,
		"PGUSER="+target.user,
		"PGPASSWORD="+target.password,
		"PGAPPNAME=gildra-catalog-backup",
	)

	query := target.url.Query()
	sslMode := strings.TrimSpace(query.Get("sslmode"))
	if sslMode == "" {
		sslMode = "prefer"
	}
	environment = append(environment, "PGSSLMODE="+sslMode)
	libPQOptions := map[string]string{
		"sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY", "sslrootcert": "PGSSLROOTCERT",
		"sslcrl": "PGSSLCRL", "sslcrldir": "PGSSLCRLDIR", "sslsni": "PGSSLSNI",
		"sslnegotiation": "PGSSLNEGOTIATION", "channel_binding": "PGCHANNELBINDING",
		"require_auth": "PGREQUIREAUTH", "target_session_attrs": "PGTARGETSESSIONATTRS",
		"gssencmode": "PGGSSENCMODE", "krbsrvname": "PGKRBSRVNAME",
		"connect_timeout": "PGCONNECT_TIMEOUT", "options": "PGOPTIONS",
	}
	for parameter, key := range libPQOptions {
		if value := strings.TrimSpace(query.Get(parameter)); value != "" {
			environment = append(environment, key+"="+value)
		}
	}
	if strings.TrimSpace(query.Get("connect_timeout")) == "" {
		environment = append(environment, "PGCONNECT_TIMEOUT=15")
	}
	return environment, nil
}

type databaseTarget struct {
	url      *url.URL
	host     string
	port     int
	database string
	user     string
	password string
}

func parseDatabaseTarget(databaseURL string) (databaseTarget, error) {
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		return databaseTarget{}, fmt.Errorf("parse PostgreSQL connection URL: %w", err)
	}
	if parsedURL.Scheme != "postgres" && parsedURL.Scheme != "postgresql" {
		return databaseTarget{}, errors.New("backup PostgreSQL connection must use a postgres URL")
	}
	host := strings.TrimSpace(parsedURL.Hostname())
	if host == "" {
		return databaseTarget{}, errors.New("backup PostgreSQL connection host is required")
	}
	port := 5432
	if value := parsedURL.Port(); value != "" {
		port, err = strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return databaseTarget{}, errors.New("backup PostgreSQL connection port is invalid")
		}
	}
	database, err := url.PathUnescape(strings.TrimPrefix(parsedURL.EscapedPath(), "/"))
	if err != nil {
		return databaseTarget{}, fmt.Errorf("parse PostgreSQL database name: %w", err)
	}
	if database == "" {
		return databaseTarget{}, errors.New("backup PostgreSQL connection database is required")
	}
	if parsedURL.User == nil || strings.TrimSpace(parsedURL.User.Username()) == "" {
		return databaseTarget{}, errors.New("backup PostgreSQL connection user is required")
	}
	password, _ := parsedURL.User.Password()
	return databaseTarget{
		url:      parsedURL,
		host:     host,
		port:     port,
		database: database,
		user:     parsedURL.User.Username(),
		password: password,
	}, nil
}

func isLibPQConnectionEnvironment(key string) bool {
	switch key {
	case "PGDATABASE", "PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGPASSWORD", "PGPASSFILE",
		"PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGAPPNAME", "PGCONNECT_TIMEOUT",
		"PGSSLMODE", "PGREQUIRESSL", "PGSSLCERT", "PGSSLKEY", "PGSSLROOTCERT", "PGSSLCRL",
		"PGSSLCRLDIR", "PGSSLSNI", "PGSSLNEGOTIATION", "PGREQUIREPEER", "PGCHANNELBINDING",
		"PGREQUIREAUTH", "PGTARGETSESSIONATTRS", "PGGSSENCMODE", "PGKRBSRVNAME":
		return true
	default:
		return false
	}
}

func redactDatabaseURL(value, databaseURL string) string {
	value = strings.ReplaceAll(value, databaseURL, "[REDACTED_DATABASE_URL]")
	if parsed, err := url.Parse(databaseURL); err == nil && parsed.User != nil {
		if password, present := parsed.User.Password(); present && password != "" {
			value = strings.ReplaceAll(value, password, "[REDACTED]")
		}
	}
	return strings.TrimSpace(value)
}

type boundedBuffer struct {
	buffer bytes.Buffer
	limit  int
}

func (b *boundedBuffer) Write(value []byte) (int, error) {
	originalLength := len(value)
	remaining := b.limit - b.buffer.Len()
	if remaining > 0 {
		if len(value) > remaining {
			value = value[:remaining]
		}
		_, _ = b.buffer.Write(value)
	}
	return originalLength, nil
}

func (b *boundedBuffer) String() string {
	return b.buffer.String()
}
