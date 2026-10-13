import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.resolve(root, process.argv.includes("--manifest")
  ? process.argv[process.argv.indexOf("--manifest") + 1]
  : "data/wow/content-manifest.json");
const write = process.argv.includes("--write");
const collections = [
  "editions", "expansions", "patches", "seasons", "activities", "classes", "specializations",
  "instances", "encounters", "phases", "abilities", "loot",
];
const source = await fs.readFile(manifestPath, "utf8");
const manifest = JSON.parse(source);
const registeredSources = new Set(manifest.sources.map((entry) => entry.url));
const rows = collections.flatMap((collection) => manifest[collection].map((row) => ({ collection, row })));
const eligible = rows.filter(({ row }) => row.sourceUrl && row.lastVerifiedAt && registeredSources.has(row.sourceUrl));
const missingHistory = eligible.filter(({ row }) => !Array.isArray(row.history) || row.history.length === 0);
const unregistered = rows.filter(({ row }) => row.sourceUrl && !registeredSources.has(row.sourceUrl));

let updated = source;
for (const { row } of missingHistory) {
  const idPattern = new RegExp(`"id"\\s*:\\s*${JSON.stringify(row.id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const lines = updated.split("\n");
  const matches = lines.flatMap((line, index) => idPattern.test(line) ? [index] : []);
  if (matches.length !== 1) throw new Error(`Expected one source line for ${row.id}, found ${matches.length}`);
  const lineIndex = matches[0];
  const event = {
    at: row.lastVerifiedAt,
    change: "baseline_verified",
    sourceUrl: row.sourceUrl,
  };
  const nextLine = lines[lineIndex].replace(/("history"\s*:\s*)\[\]/, `$1[${JSON.stringify(event)}]`);
  if (nextLine === lines[lineIndex]) throw new Error(`Empty history field was not found for ${row.id}`);
  lines[lineIndex] = nextLine;
  updated = lines.join("\n");
}

const result = {
  manifestPath,
  records: rows.length,
  registeredSources: manifest.sources.length,
  eligibleForBaselineHistory: eligible.length,
  historyEntriesAdded: missingHistory.length,
  unregisteredSourceRows: unregistered.map(({ collection, row }) => ({ collection, id: row.id, sourceUrl: row.sourceUrl })),
  changed: updated !== source,
};

if (write) {
  await fs.writeFile(manifestPath, updated);
} else if (result.changed || result.unregisteredSourceRows.length > 0) {
  process.exitCode = 1;
}
console.log(JSON.stringify(result, null, 2));
