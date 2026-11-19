"""Export missing ItemSparse classifications shared by the engine and recorded market builds."""
import json
import pathlib
import subprocess

BUILDS = ["12.1.0.69587", "12.1.5.70077", "12.1.5.70783"]
OUT = pathlib.Path(__file__).resolve().parents[1] / "data/wow/auction-enhancements/non-equipment.json"
build_list = ",".join("'" + build + "'" for build in BUILDS)
# Restrict the export to the sparse-table holes. A positive current API record
# always takes precedence. A missing row or a disagreement supplies no evidence.
sql = f"""
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH builds AS MATERIALIZED (
  SELECT id, version FROM game_builds WHERE product_id=1 AND version IN ({build_list})
), holes AS MATERIALIZED (
  SELECT i.row_id FROM catalog_db2_rows i
  WHERE i.build_id=(SELECT id FROM builds WHERE version='{BUILDS[0]}') AND i.table_name='Item' AND i.locale='en_US'
    AND NOT EXISTS (SELECT 1 FROM catalog_db2_rows s WHERE s.build_id=i.build_id
      AND s.locale=i.locale AND s.table_name='ItemSparse' AND s.row_id=i.row_id)
)
SELECT json_build_array(i.row_id,(i.payload->>'ClassID')::integer,b.version,i.source_artifact_id)
FROM holes h CROSS JOIN builds b JOIN catalog_db2_rows i ON i.build_id=b.id AND i.row_id=h.row_id
WHERE i.table_name='Item' AND i.locale='en_US' AND i.source_artifact_id IS NOT NULL
  AND i.payload->>'InventoryType'='0' AND i.payload->>'ClassID' ~ '^[0-9]+$'
  AND i.payload->>'ClassID' NOT IN ('2','4')
ORDER BY i.row_id,b.version;
COMMIT;
"""
result = subprocess.run(["docker", "exec", "-i", "gildra-postgres-1", "psql", "-XqAt",
                         "-v", "ON_ERROR_STOP=1", "-U", "gildra", "-d", "gildra"],
                        input=sql, capture_output=True, text=True, check=True)
items, sources = {}, {}
for line in result.stdout.splitlines():
    item_id, item_class, build, artifact = json.loads(line)
    items.setdefault(item_id, {})[build] = item_class
    sources.setdefault(build, set()).add(artifact)
if set(sources) != set(BUILDS) or any(len(ids) != 1 for ids in sources.values()):
    raise ValueError("Missing or conflicting Item artifacts")
ranges = []
for item_id, classes in items.items():
    if len(classes) != len(BUILDS) or len(set(classes.values())) != 1:
        continue
    item_class = classes[BUILDS[0]]
    if ranges and ranges[-1][1] == item_id - 1 and ranges[-1][2] == item_class:
        ranges[-1][1] = item_id
    else:
        ranges.append([item_id, item_id, item_class])
if not ranges:
    raise ValueError("Empty verified classification index")
OUT.write_text(json.dumps({"itemArtifacts": {b: next(iter(sources[b])) for b in BUILDS}, "ranges": ranges},
                          separators=(",", ":")) + "\n")
