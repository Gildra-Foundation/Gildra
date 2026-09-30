import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const includeAuditLinks = process.argv.includes("--audit-links");
const reportPath = path.join(root, "docs/reports/wow/mythic-media-verification.json");
const auditPath = path.join(root, "data/wow/mythic-npc-source-audit.json");
const allowedRoots = new Set([
  path.join(root, "public/assets/wow/mythic/npcs/thumbs"),
  path.join(root, "public/assets/wow/mythic/npcs/season-two"),
]);
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const reportCandidates = report.enemies.filter((row) => (
  row.identityVerified === true
  && row.portraitSourceUrl?.startsWith("https://wow.zamimg.com/modelviewer/live/webthumbs/npc/")
  && row.portraitUrl?.startsWith("/assets/wow/mythic/npcs/thumbs/")
  && row.issues?.includes("displayed-portrait-semantic-mismatch")
)).map((row) => ({
  name: row.name,
  npcId: row.npcId,
  displayId: row.portraitCheck?.displayId ?? null,
  identitySourceUrl: row.identityVerificationUrl,
  portraitSourceUrl: row.portraitSourceUrl,
  portraitUrl: row.portraitUrl,
  overwrite: true,
}));
const audit = includeAuditLinks ? JSON.parse(await fs.readFile(auditPath, "utf8")) : null;
const auditCandidates = (audit?.verifiedLinks ?? []).filter((row) => row.displayId && row.portraitUrl).map((row) => ({
  name: row.name,
  npcId: row.npcId,
  displayId: row.displayId,
  identitySourceUrl: row.sourceUrl,
  portraitSourceUrl: `https://wow.zamimg.com/modelviewer/live/webthumbs/npc/${row.displayId % 256}/${row.displayId}.webp`,
  portraitUrl: row.portraitUrl,
  overwrite: false,
}));
const candidates = [...new Map([...reportCandidates, ...auditCandidates].map((row) => [row.portraitUrl, row])).values()];

if (candidates.length > 30) {
  throw new Error(`Refusing unexpectedly broad portrait rewrite (${candidates.length} files).`);
}

const results = [];
for (const row of candidates) {
  const target = path.join(root, "public", row.portraitUrl);
  if (!allowedRoots.has(path.dirname(target))) throw new Error(`Unsafe portrait target: ${target}`);
  const identityResponse = await fetch(row.identitySourceUrl, {
    headers: { "user-agent": "GildraMythicPortraitSync/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!identityResponse.ok) throw new Error(`Identity source ${identityResponse.status}: ${row.identitySourceUrl}`);
  const identityBody = await identityResponse.text();
  const identityTitle = (identityBody.match(/<title>([^<]+)/i)?.[1] ?? "")
    .replace(/&amp;/g, "&")
    .replace(/ - NPC - World of Warcraft$/, "");
  const identityDisplayId = Number(identityBody.match(/data-mv-display-id="(\d+)"/i)?.[1]
    ?? identityBody.match(/linksButton\.dataset\.displayId\s*=\s*(\d+)/i)?.[1]);
  if (identityTitle !== row.name || identityDisplayId !== row.displayId) {
    throw new Error(`Identity mismatch for ${row.name}: title=${identityTitle}, displayId=${identityDisplayId}`);
  }
  const response = await fetch(row.portraitSourceUrl, {
    headers: { "user-agent": "GildraMythicPortraitSync/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Portrait source ${response.status}: ${row.portraitSourceUrl}`);
  const source = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Invalid image source: ${row.portraitSourceUrl}`);

  let exists = false;
  try {
    exists = (await fs.stat(target)).isFile();
  } catch {}
  if (apply && (!exists || row.overwrite)) {
    const temporary = `${target}.codex-tmp`;
    await sharp(source)
      .resize(160, 160, { fit: "fill" })
      .webp({ quality: 92 })
      .toFile(temporary);
    await fs.rename(temporary, target);
  }
  results.push({
    name: row.name,
    npcId: row.npcId,
    displayId: row.displayId,
    identitySourceUrl: row.identitySourceUrl,
    sourceUrl: row.portraitSourceUrl,
    target: path.relative(root, target),
    applied: apply && (!exists || row.overwrite),
  });
}

console.log(JSON.stringify({ candidates: candidates.length, applied: results.filter((row) => row.applied).length, results }, null, 2));
