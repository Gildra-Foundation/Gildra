import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const reportPath = path.join(root, "docs/reports/wow/mythic-media-verification.json");
const inventoryPath = path.join(root, "docs/reports/wow/mythic-media-inventory.json");
const seasonPath = path.join(root, "components/wow/mythic/seasonTwoEnemyMedia.json");
const rubyPath = path.join(root, "components/wow/mythic/rubyLifePoolsMedia.ts");
const npcAuditPath = path.join(root, "data/wow/mythic-npc-source-audit.json");

const [report, inventory, seasonMedia, rubySource, npcAudit] = await Promise.all([
  fs.readFile(reportPath, "utf8").then(JSON.parse),
  fs.readFile(inventoryPath, "utf8").then(JSON.parse),
  fs.readFile(seasonPath, "utf8").then(JSON.parse),
  fs.readFile(rubyPath, "utf8"),
  fs.readFile(npcAuditPath, "utf8").then(JSON.parse),
]);

if (report.summary?.mode !== "complete-inventory") throw new Error("Refusing to promote a filtered verification report.");
if (report.summary?.inventoryGeneratedAt !== inventory.summary?.generatedAt) throw new Error("Verification report does not match the current inventory.");

const noModelEvidence = new Map((npcAudit.verifiedLinks ?? [])
  .filter((row) => row.displayId === null && row.portraitUrl === null)
  .map((row) => [`${row.name}:${row.npcId}`, row.sourceUrl]));
const verifiedAt = report.summary.generatedAt;
let nextRubySource = rubySource;
let promotedPortraits = 0;
let promotedPlaceholders = 0;

for (const row of report.enemies ?? []) {
  if (!row.identityVerified) continue;
  const identitySourceUrl = row.expectedIdentitySourceUrl ?? row.identityVerificationUrl;
  if (!identitySourceUrl) continue;

  const metadata = {
    identityVerified: true,
    identitySourceUrl,
    identityLastVerifiedAt: verifiedAt,
  };
  if (row.portraitVerified && row.portraitSourceUrl) {
    Object.assign(metadata, {
      portraitVerified: true,
      portraitSourceUrl: row.portraitSourceUrl,
      portraitLastVerifiedAt: verifiedAt,
    });
    promotedPortraits += 1;
  } else {
    const evidenceUrl = noModelEvidence.get(`${row.name}:${row.npcId}`);
    if (!evidenceUrl || row.portraitUrl) continue;
    Object.assign(metadata, {
      portraitStatus: "model_unavailable",
      portraitSourceUrl: evidenceUrl,
      portraitLastVerifiedAt: verifiedAt,
    });
    promotedPlaceholders += 1;
  }

  if (seasonMedia[row.name]) {
    Object.assign(seasonMedia[row.name], metadata);
    continue;
  }

  const escapedName = row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linePattern = new RegExp(`^(  "${escapedName}": \\{[^\\n]+)( \\},)$`, "m");
  if (!linePattern.test(nextRubySource)) throw new Error(`Unable to promote Ruby Life Pools media row: ${row.name}`);
  const fields = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ");
  nextRubySource = nextRubySource.replace(linePattern, `$1, ${fields}$2`);
}

await Promise.all([
  fs.writeFile(seasonPath, `${JSON.stringify(seasonMedia, null, 2)}\n`),
  fs.writeFile(rubyPath, nextRubySource),
]);
console.log(JSON.stringify({ verifiedAt, promotedPortraits, promotedPlaceholders }, null, 2));
