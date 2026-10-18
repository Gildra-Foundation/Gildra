#!/usr/bin/env python3
"""Exercise the repository migration and actual mentions reader in isolated PG.

Requires Docker access, an already available immutable Postgres image, and the
static Goose executable built by backend/Dockerfile. Never connects to a host
database or pulls an image. The fixture container is always removed by ID.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "backend/migrations/postgres"
OLD = "00022_db2_spell_lookup_index.sql"
NEW = "00172_spell_misc_text_lookup_index.sql"
INDEX = "catalog_db2_rows_spell_misc_text_lookup_idx"
OWNER_LABEL = "gildra.regression.spell-misc-text-index"
SOURCE_ID = "00000000-0000-0000-0000-000000000001"
DB = "spell_misc_text_index_regression"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def nodes(plan):
    yield plan
    for child in plan.get("Plans", []):
        yield from nodes(child)


def reader_sql():
    source = (ROOT / "backend/internal/catalog/mentions.go").read_text()
    match = re.search(r"rows, err := s\.postgres\.Query\(ctx, `(.+?)`, ids, normalizeLocale", source, re.S)
    require(match, "cannot extract the actual complete enrichMentions SQL")
    sql = match.group(1)
    require("raw.payload->>'SpellID'=target.external_id::text" in sql, "text lookup contract changed")
    require("raw.payload ? 'SpellID'" not in sql, "reader acquired a different partial predicate")
    require(sql.count("$1") == 2 and sql.count("$2") == 2, "unexpected reader parameters")
    return sql.replace("$1", f"ARRAY['{SOURCE_ID}']::uuid[]").replace("$2", "'ru_RU'")


def fixture_sql(rows):
    # Match the real DB2 primary/index keys and value types; unrelated catalog
    # tables contain only columns read by the unmodified full mentions query.
    return f"""
CREATE TABLE game_builds(id bigint PRIMARY KEY);
INSERT INTO game_builds VALUES (1),(2);
CREATE TABLE catalog_db2_rows (
 build_id bigint NOT NULL REFERENCES game_builds(id), table_name text NOT NULL,
 locale text NOT NULL, row_id bigint NOT NULL, payload jsonb NOT NULL,
 content_hash bytea NOT NULL DEFAULT decode(repeat('00',32),'hex'),
 source_url text NOT NULL DEFAULT 'https://fixture.invalid/',
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(build_id,table_name,locale,row_id)
);
CREATE INDEX catalog_db2_rows_table_build_locale_idx
 ON catalog_db2_rows(table_name,build_id,locale,row_id);
CREATE TABLE game_entities(
 id uuid PRIMARY KEY, entity_type text NOT NULL, external_id bigint NOT NULL,
 published_version_id bigint, deleted_at timestamptz);
CREATE TABLE game_entity_versions(id bigint PRIMARY KEY,build_id bigint NOT NULL,payload jsonb NOT NULL);
CREATE TABLE catalog_talent_spell_links(talent_version_id bigint,spell_version_id bigint);
CREATE TABLE catalog_entity_mentions(source_version_id bigint,locale text,mention_text text,target_entity_id uuid);
CREATE TABLE game_entity_localizations(version_id bigint,locale text,name text);
CREATE TABLE catalog_entity_icons(build_id bigint,entity_type text,external_id bigint,icon_name text);
CREATE TABLE catalog_file_assets(file_data_id bigint PRIMARY KEY,icon_name text);
INSERT INTO game_entity_versions VALUES (1,1,'{{}}');
INSERT INTO game_entities VALUES ('{SOURCE_ID}','spell',999999,1,NULL);
INSERT INTO game_entity_versions SELECT id,1,'{{}}' FROM generate_series(42,51) id;
INSERT INTO game_entities
 SELECT ('00000000-0000-0000-0000-'||lpad(id::text,12,'0'))::uuid,
 CASE WHEN id=51 THEN 'npc' ELSE 'spell' END,id,id,NULL FROM generate_series(42,51) id;
INSERT INTO catalog_entity_mentions
 SELECT 1,'ru_RU','reference-'||external_id,id FROM game_entities WHERE external_id BETWEEN 42 AND 51;
INSERT INTO game_entity_localizations SELECT id,'en_US','fallback-'||id FROM generate_series(42,51) id;
INSERT INTO game_entity_localizations VALUES (42,'ru_RU','localized-42');
INSERT INTO catalog_file_assets VALUES
 (100,'wrong-leading-zero'),(101,'wrong-difficulty'),(102,'selected-row'),
 (103,'wrong-row-tie'),(104,'wrong-build'),(105,'wrong-locale'),
 (106,'wrong-table'),(107,'json-number'),(108,'after-missing-asset'),
 (109,'zero-only'),(110,'empty-difficulty'),(111,'wrong-npc');
INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload) VALUES
 (1,'SpellMisc','en_US',1,'{{"SpellID":"00042","DifficultyID":"-1","SpellIconFileDataID":"100"}}'),
 (1,'SpellMisc','en_US',2,'{{"SpellID":"42","DifficultyID":"2","SpellIconFileDataID":"101"}}'),
 (1,'SpellMisc','en_US',3,'{{"SpellID":"42","DifficultyID":"0","SpellIconFileDataID":"102"}}'),
 (1,'SpellMisc','en_US',4,'{{"SpellID":"42","DifficultyID":"0","SpellIconFileDataID":"103"}}'),
 (2,'SpellMisc','en_US',5,'{{"SpellID":"43","SpellIconFileDataID":"104"}}'),
 (1,'SpellMisc','ru_RU',6,'{{"SpellID":"44","SpellIconFileDataID":"105"}}'),
 (1,'SpellOther','en_US',7,'{{"SpellID":"45","SpellIconFileDataID":"106"}}'),
 (1,'SpellMisc','en_US',8,'{{"SpellID":46,"SpellIconFileDataID":"107"}}'),
 (1,'SpellMisc','en_US',9,'{{"SpellID":"47","DifficultyID":"-1","SpellIconFileDataID":"999"}}'),
 (1,'SpellMisc','en_US',10,'{{"SpellID":"47","SpellIconFileDataID":"108"}}'),
 (1,'SpellMisc','en_US',11,'{{"SpellIconFileDataID":"108"}}'),
 (1,'SpellMisc','en_US',12,'{{"SpellID":null,"SpellIconFileDataID":"108"}}'),
 (1,'SpellMisc','en_US',13,'{{"SpellID":"","SpellIconFileDataID":"108"}}'),
 (1,'SpellMisc','en_US',14,'{{"SpellID":"00049","SpellIconFileDataID":"109"}}'),
 (1,'SpellMisc','en_US',15,'{{"SpellID":"50","DifficultyID":"","SpellIconFileDataID":"110"}}'),
 (1,'SpellMisc','en_US',16,'{{"SpellID":"50","DifficultyID":null,"SpellIconFileDataID":"103"}}'),
 (1,'SpellMisc','en_US',17,'{{"SpellID":"51","SpellIconFileDataID":"111"}}');
INSERT INTO catalog_db2_rows(build_id,table_name,locale,row_id,payload)
 SELECT CASE WHEN id%4=0 THEN 2 ELSE 1 END,
 CASE WHEN id%4=1 THEN 'SpellOther' ELSE 'SpellMisc' END,
 CASE WHEN id%4=2 THEN 'ru_RU' ELSE 'en_US' END,
 1000000+id,jsonb_build_object('SpellID',(1000000+id)::text,
 'SpellIconFileDataID','102','DifficultyID','0','FixturePadding',repeat('x',128))
 FROM generate_series(1,{rows}) id;
ANALYZE;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-image", required=True, help="already local sha256 image ID or repo@sha256 digest")
    parser.add_argument("--expected-pg-version", required=True, help="deployed exact PG_VERSION, e.g. 17.10")
    parser.add_argument("--goose", required=True, type=Path, help="static Goose v3.27.1 executable")
    parser.add_argument("--output-dir", required=True, type=Path, help="new directory; never overwrites prior proof")
    parser.add_argument("--rows", type=int, default=200000)
    args = parser.parse_args()
    require(re.fullmatch(r"(?:sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})", args.postgres_image), "pin an immutable image")
    require(100000 <= args.rows <= 500000, "representative fixture must have 100000..500000 rows")
    require(args.goose.is_file() and os.access(args.goose, os.X_OK), "Goose executable is missing")
    require(args.expected_pg_version.startswith("17."), "this repository regression targets PostgreSQL 17")
    migration_text = (MIGRATIONS / NEW).read_text()
    require("-- +goose NO TRANSACTION" in migration_text, "concurrent migration lacks Goose NO TRANSACTION")
    sql = reader_sql()
    args.output_dir.mkdir(parents=True, exist_ok=False)
    proof = {"status": "running", "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "method": "Own isolated synthetic PostgreSQL; no network, published ports, production DB or application services",
             "fixtureRows": args.rows + 17, "readerSha256": hashlib.sha256(sql.encode()).hexdigest(),
             "inputs": {str(p.relative_to(ROOT)): sha(p) for p in [MIGRATIONS / OLD, MIGRATIONS / NEW, ROOT / "backend/internal/catalog/mentions.go"]},
             "gooseSha256": sha(args.goose), "checks": []}
    transcript = []
    cid = None
    marker = uuid.uuid4().hex
    temporary = tempfile.TemporaryDirectory(prefix="spell-misc-index-")

    def command(argv, stdin=None, timeout=180, allow_failure=False):
        before = time.monotonic()
        result = subprocess.run(argv, input=stdin, text=True, capture_output=True, timeout=timeout)
        transcript.append({"argv": argv, "exitCode": result.returncode, "seconds": round(time.monotonic()-before, 3),
                           "stdout": result.stdout, "stderr": result.stderr})
        if not allow_failure and result.returncode:
            raise RuntimeError(f"command failed ({result.returncode}): {argv[0:3]}: {result.stderr[-1600:]}")
        return result

    def psql(statement, allow_failure=False):
        return command(["docker", "exec", "-i", cid, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB, "-At"],
                       statement, allow_failure=allow_failure)

    def value(statement):
        return json.loads(psql(statement).stdout)

    def query_rows():
        return value("SELECT coalesce(json_agg(row_to_json(result) ORDER BY display_entity_id,mention_text,external_id), '[]'::json) FROM ("
                     + sql + ") result(display_entity_id,mention_text,target_id,entity_type,external_id,display_name,icon_name);")

    def explain(label):
        result = value("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql + ";")[0]
        (args.output_dir / f"{label}-plan.json").write_text(json.dumps(result, indent=2) + "\n")
        return result

    def goose(action, version=None):
        argv = ["docker", "exec", cid, "/regression/goose", "-dir", "/regression/migrations", "postgres",
                f"host=/var/run/postgresql user=postgres dbname={DB} sslmode=disable", action]
        if version is not None:
            argv.append(str(version))
        return command(argv)

    def check(label, condition):
        require(condition, label)
        proof["checks"].append(label)

    try:
        image = json.loads(command(["docker", "image", "inspect", args.postgres_image]).stdout)[0]
        env = dict(item.split("=", 1) for item in image["Config"]["Env"] if "=" in item)
        check("image matches deployed PostgreSQL patch version", env.get("PG_VERSION") == args.expected_pg_version and env.get("PG_MAJOR") == "17")
        proof["postgresImage"] = {"id": image["Id"], "PG_MAJOR": env.get("PG_MAJOR"), "PG_VERSION": env.get("PG_VERSION")}
        staged = Path(temporary.name)
        (staged / "migrations").mkdir()
        for name in [OLD, NEW]:
            shutil.copyfile(MIGRATIONS / name, staged / "migrations" / name)
        shutil.copyfile(args.goose, staged / "goose")
        (staged / "goose").chmod(0o555)
        cid = command(["docker", "create", "--pull=never", "--network=none", "--cpus=1", "--memory=768m", "--memory-swap=768m",
                       "--pids-limit=128", "--label", f"{OWNER_LABEL}={marker}",
                       "--mount", "type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=536870912",
                       "--mount", f"type=bind,src={staged},dst=/regression,readonly",
                       "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", f"POSTGRES_DB={DB}",
                       "--env", "PGDATA=/var/lib/postgresql/data/pgdata", args.postgres_image,
                       "postgres", "-c", "shared_buffers=64MB", "-c", "maintenance_work_mem=64MB",
                       "-c", "max_connections=10", "-c", "max_parallel_workers_per_gather=0"]).stdout.strip()
        require(re.fullmatch(r"[a-f0-9]{64}", cid), "unexpected own container ID")
        command(["docker", "start", cid])
        deadline = time.monotonic() + 45
        while True:
            result = command(["docker", "exec", cid, "pg_isready", "-U", "postgres", "-d", DB], allow_failure=True)
            # initdb temporarily starts a socket server; wait for entrypoint to
            # exec the final server before sending migration/fixture work.
            pid_one = command(["docker", "exec", cid, "cat", "/proc/1/comm"], allow_failure=True)
            if result.returncode == 0 and pid_one.stdout.strip() == "postgres":
                break
            require(time.monotonic() < deadline, "own PostgreSQL failed to become ready")
            time.sleep(0.25)
        config = json.loads(command(["docker", "inspect", cid]).stdout)[0]
        host = config["HostConfig"]
        check("one CPU, 768 MiB, no network or published ports, no volumes",
              host["NanoCpus"] == 1000000000 and host["Memory"] == 768*1024*1024
              and host["NetworkMode"] == "none" and not host.get("PortBindings")
              and not any(mount["Type"] == "volume" for mount in config["Mounts"]))
        proof["isolation"] = {"containerId": cid, "nanoCpus": host["NanoCpus"], "memoryBytes": host["Memory"],
                              "networkMode": host["NetworkMode"], "mountTypes": [mount["Type"] for mount in config["Mounts"]]}
        version_result = command(["docker", "exec", cid, "/regression/goose", "-version"])
        goose_version = (version_result.stdout + version_result.stderr).strip()
        check("Goose is the repository's supported v3.27.1", "v3.27.1" in goose_version)
        proof["gooseVersion"] = goose_version
        psql(fixture_sql(args.rows))
        goose("up-to", 22)
        expected_icons = {42: "selected-row", 43: None, 44: None, 45: None, 46: "json-number", 47: "after-missing-asset", 48: None,
                          49: None, 50: "empty-difficulty", 51: None}
        before = query_rows()
        check("actual reader preserves edge cases and stable ordered result", len(before) == 10
              and [row["external_id"] for row in before] == list(range(42, 52))
              and {row["external_id"]: row["icon_name"] for row in before} == expected_icons
              and before[0]["display_name"] == "localized-42" and before[1]["display_name"] == "fallback-43")
        baseline = explain("numeric-baseline")
        baseline_nodes = list(nodes(baseline["Plan"]))
        check("existing numeric index cannot satisfy the actual text lookup",
              all(node.get("Index Name") != "catalog_db2_rows_spell_lookup_idx" for node in baseline_nodes)
              and any(node.get("Relation Name") == "catalog_db2_rows" for node in baseline_nodes))
        up_sql = migration_text.split("-- +goose Up", 1)[1].split("-- +goose Down", 1)[0]
        rejected = psql("BEGIN;\n" + up_sql + "\nROLLBACK;", allow_failure=True)
        check("concurrent creation is rejected inside a transaction", rejected.returncode != 0
              and "cannot run inside a transaction block" in rejected.stderr)
        goose("up-to", 172)
        metadata = value("SELECT row_to_json(index_state) FROM (SELECT indisvalid,indisready,pg_get_indexdef(indexrelid) definition "
                         "FROM pg_index WHERE indexrelid='" + INDEX + "'::regclass) index_state;")
        check("new additive index is ready and valid", metadata["indisvalid"] and metadata["indisready"])
        proof["indexMetadata"] = metadata
        after = query_rows()
        check("complete actual reader results and order unchanged after Up", before == after)
        indexed = explain("text-index")
        check("normal planner chooses the new text index for actual reader",
              any(node.get("Index Name") == INDEX for node in nodes(indexed["Plan"])))
        cost_ratio = baseline["Plan"]["Total Cost"] / indexed["Plan"]["Total Cost"]
        check("actual reader planner cost falls at least fourfold", cost_ratio >= 4)
        proof["comparison"] = {"baselineTotalCost": baseline["Plan"]["Total Cost"], "indexedTotalCost": indexed["Plan"]["Total Cost"],
                               "costImprovementRatio": cost_ratio, "baselineExecutionMs": baseline["Execution Time"],
                               "indexedExecutionMs": indexed["Execution Time"], "note": "synthetic planner regression, not production latency"}
        goose("down")
        check("isolated Down removes only new index and preserves all reader results", before == query_rows()
              and value("SELECT json_build_object('new',to_regclass('"+INDEX+"') IS NULL,'numeric',to_regclass('catalog_db2_rows_spell_lookup_idx') IS NOT NULL);") == {"new": True, "numeric": True})
        goose("up-to", 172)
        check("reapplied concurrent Up preserves results and restores chosen text index", before == query_rows()
              and any(node.get("Index Name") == INDEX for node in nodes(explain("reapplied-text-index")["Plan"])))
        check("repository inputs unchanged throughout regression", all(sha(ROOT/path) == digest for path, digest in proof["inputs"].items()))
        proof["orderedResults"] = before
        proof["status"] = "passed"
    except BaseException as error:
        proof["status"] = "failed"
        proof["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        try:
            if cid:
                labels = json.loads(command(["docker", "inspect", "--format", "{{json .Config.Labels}}", cid]).stdout)
                require(labels.get(OWNER_LABEL) == marker, "refusing cleanup without exact own container label")
                command(["docker", "rm", "--force", "--volumes", cid])
                proof["ownContainerRemoved"] = True
        finally:
            temporary.cleanup()
            proof["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            (args.output_dir / "summary.json").write_text(json.dumps(proof, indent=2) + "\n")
            # Full inspect/env output is deliberately excluded; command output
            # contains only synthetic fixture data and local migration proofs.
            filtered = [entry for entry in transcript if entry["argv"][1:3] != ["image", "inspect"] and entry["argv"][1] != "inspect"]
            (args.output_dir / "commands.json").write_text(json.dumps(filtered, indent=2) + "\n")
        if proof["status"] == "passed":
            print(json.dumps({"status": proof["status"], "checks": len(proof["checks"]), "summary": str(args.output_dir / "summary.json"),
                              "costImprovementRatio": proof["comparison"]["costImprovementRatio"]}))


if __name__ == "__main__":
    main()
