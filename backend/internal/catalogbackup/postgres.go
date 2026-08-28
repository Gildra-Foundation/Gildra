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
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return State{}, fmt.Errorf("open restore PostgreSQL: %w", err)
	}
	var userRelations int64
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM pg_class relation
		JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
		WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
		  AND namespace.nspname NOT LIKE 'pg_toast%'
		  AND relation.relkind IN ('r','p','v','m','S','f')`).Scan(&userRelations); err != nil {
		pool.Close()
		return State{}, fmt.Errorf("inspect restore target: %w", err)
	}
	pool.Close()
	if userRelations != 0 {
		return State{}, fmt.Errorf("restore database is not empty: found %d user relations", userRelations)
	}
	if err := p.Archive.Restore(ctx, databaseURL, source); err != nil {
		return State{}, err
	}
	pool, err = pgxpool.New(ctx, databaseURL)
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
	state := State{Counts: make(map[string]int64, len(CriticalTables))}
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
