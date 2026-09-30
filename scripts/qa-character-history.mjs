import { chromium } from "playwright";

const baseURL = (process.env.CHARACTER_HISTORY_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: { "x-gildra-qa-mode": "battle-net-evidence" }, permissions: ["clipboard-read", "clipboard-write"] });
const errors = [], recorded = [], shares = new Map();
const runs = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "rotation", gameBuild: "12.1.0.70000", profileFingerprint: "current-profile", scenario: { id: "single-target", durationSeconds: 120, targets: 1 }, engine: "SimulationCraft QA", metrics: { dps: 123456, deltaPercent: 2.4, confidence: 95, iterations: 1000 }, label: "Ротация · single-target", createdAt: new Date().toISOString(), stale: false },
  { id: "22222222-2222-4222-8222-222222222222", kind: "gear", gameBuild: "12.0.5", profileFingerprint: "old-profile", scenario: { id: "aoe", durationSeconds: 120, targets: 5 }, engine: "SimulationCraft QA", metrics: { candidateDps: 210000, deltaPercent: 1.1, iterations: 750 }, label: "Экипировка · Старый предмет", createdAt: new Date(Date.now() - 86400000).toISOString(), stale: true },
];

await context.route("**/api/wow/workspace/**", async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  if (url.pathname.endsWith("/history") && method === "GET") {
    runs[0].profileFingerprint = url.searchParams.get("fingerprint") ?? "current-profile"; runs[0].stale = false;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs }) });
  }
  if (url.pathname.endsWith("/history") && method === "POST") {
    const body = request.postDataJSON(); recorded.push(body);
    const run = { ...body, id: crypto.randomUUID(), createdAt: new Date().toISOString(), stale: false };
    runs.unshift(run);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(run) });
  }
  if (url.pathname.endsWith("/share") && method === "POST") {
    const runId = url.pathname.split("/").at(-2), id = crypto.randomUUID(); shares.set(id, runId);
    const run = runs.find((item) => item.id === runId); if (run) run.activeShareId = id;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id, token: "a".repeat(43) }) });
  }
  if (url.pathname.includes("/shares/") && method === "DELETE") {
    const id = url.pathname.split("/").at(-1); shares.delete(id); for (const run of runs) if (run.activeShareId === id) delete run.activeShareId;
    return route.fulfill({ status: 204, body: "" });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
});
await context.route("**/api/wow/workspace?**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ documents: [] }) }));
await context.route("**/api/wow/talent-simulation", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ singleTargetDelta: 0, aoeDelta: 0, baselineSingleTargetDps: 100000, candidateSingleTargetDps: 100000, baselineAoeDps: 400000, candidateAoeDps: 400000, engine: "SimulationCraft QA", iterations: 750, encounter: { duration: 60, aoeTargets: 5 }, uncertainty: { confidence: 95, singleTargetDps: 10, singleTargetPercent: .01, aoeDps: 20, aoePercent: .01 }, statDeltas: { primary: 0, crit: 0, haste: 0, mastery: 0, versatility: 0 } }) }));
await context.route("**/api/wow/gear-candidates", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [], rejectedByReason: {} }) }));

const page = await context.newPage();
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text()); });
await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
const history = page.getByRole("region", { name: "История реальных расчётов" });
await history.waitFor({ timeout: 120000 });
await history.getByText("Актуален", { exact: true }).first().waitFor();
await history.getByText("Устарел", { exact: true }).waitFor();
await history.getByRole("button", { name: "Поделиться" }).first().click();
await history.getByText("Безопасная ссылка скопирована", { exact: false }).waitFor();
const copied = await page.evaluate(() => navigator.clipboard.readText());
if (!copied.endsWith(`/ru/wow/shared/${"a".repeat(43)}`)) throw new Error(`unexpected clipboard link: ${copied}`);
await history.getByRole("button", { name: "Отозвать" }).first().click();
await history.getByText("Ссылка отозвана", { exact: false }).waitFor();
await new Promise(resolve => setTimeout(resolve, 900));
if (!recorded.length) throw new Error("successful talent simulation was not written to history");
const allowed = new Set(["clientRunId", "kind", "gameBuild", "profileFingerprint", "scenario", "engine", "metrics", "label"]);
for (const key of Object.keys(recorded[0])) if (!allowed.has(key)) throw new Error(`unsafe history property: ${key}`);
const serialized = JSON.stringify(recorded).toLowerCase();
for (const forbidden of ["accesstoken", "armory", "equipment", "talentloadout", "battlenetid"]) if (serialized.includes(forbidden)) throw new Error(`history payload leaked ${forbidden}`);
if (errors.length) throw new Error(errors.join(" | "));
console.log(JSON.stringify({ status: "passed", freshAndStale: true, automaticRunRecorded: recorded.length, shareCopied: true, shareRevoked: shares.size === 0, serializedKeys: [...allowed], browserErrors: errors }, null, 2));
await context.close(); await browser.close();
