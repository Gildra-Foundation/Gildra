import { chromium } from "playwright";
import { talentSimulationIntegrityError } from "../lib/wow/talentSimulationIntegrity.ts";

const baseURL = (process.env.CHARACTER_TALENTS_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const workerURL = (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");
const maxBuilds = Number(process.env.CHARACTER_TALENTS_BUILDS ?? 12);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const browserErrors = [];
const captured = [];
const waiters = [];
let injectContradiction = false;

page.on("pageerror", (error) => browserErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) browserErrors.push(message.text());
});
await page.route("**/api/wow/talent-simulation", async (route) => {
  const body = route.request().postDataJSON();
  captured.push(body);
  waiters.shift()?.(body);
  const contradictory = injectContradiction && body.removedRanks > 0 && body.addedRanks === 0;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      singleTargetDelta: contradictory ? -4 : 0,
      aoeDelta: contradictory ? 2 : 0,
      baselineSingleTargetDps: 300000,
      candidateSingleTargetDps: contradictory ? 288000 : 300000,
      baselineAoeDps: 500000,
      candidateAoeDps: contradictory ? 510000 : 500000,
      engine: "SimulationCraft QA capture",
      iterations: 750,
      encounter: { duration: 60, aoeTargets: 5 },
      statDeltas: { primary: 0, crit: 0, haste: 0, mastery: 0, versatility: 0 },
    }),
  });
});

function nextCaptured(timeout = 3000) {
  return new Promise((resolve, reject) => {
    const done = (body) => { clearTimeout(timer); resolve(body); };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(done);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error("Talent edit did not produce a simulation request"));
    }, timeout);
    waiters.push(done);
  });
}

const candidates = [];
try {
  const initialRequest = nextCaptured(120000);
  const response = await page.goto(`${baseURL}/ru/wow/demo/furybar`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (!response || response.status() !== 200) throw new Error(`Character fixture returned ${response?.status() ?? "no response"}`);
  await page.getByRole("heading", { name: "Что изменится, если поменять талант?" }).waitFor({ timeout: 120000 });
  const baselineRequest = await initialRequest;
  const baselineLoadout = baselineRequest.baselineLoadout;
  if (!baselineLoadout || baselineRequest.candidateLoadout !== baselineLoadout || baselineRequest.editDistance !== 0) {
    throw new Error("The unchanged fixture did not produce an exact zero-edit baseline");
  }
  async function reloadBaseline() {
    const pending = nextCaptured(120000);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("heading", { name: "Что изменится, если поменять талант?" }).waitFor({ timeout: 120000 });
    const request = await pending;
    if (request.candidateLoadout !== baselineLoadout || request.editDistance !== 0) throw new Error("Reload did not restore the exact baseline");
  }

  const treeNames = ["Класс", "Герой", "Специализация"];
  for (const treeName of treeNames) {
    await reloadBaseline();
    await page.getByRole("navigation", { name: "Деревья талантов" }).getByRole("button", { name: new RegExp(`^${treeName}`) }).click();
    const tree = page.locator(".talent-calculator .tc-tree-canvas");
    const selected = tree.locator("button.tc-node[aria-pressed='true']");
    const labels = await selected.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? "").filter(Boolean));
    labels.sort((left, right) => Number(right.startsWith("Wrath and Fury")) - Number(left.startsWith("Wrath and Fury")));
    let acceptedInTree = 0;
    for (const label of labels) {
      if (candidates.length >= maxBuilds || acceptedInTree >= Math.ceil(maxBuilds / treeNames.length)) break;
      await reloadBaseline();
      await page.getByRole("navigation", { name: "Деревья талантов" }).getByRole("button", { name: new RegExp(`^${treeName}`) }).click();
      const button = tree.getByRole("button", { name: label, exact: true });
      const pending = nextCaptured(4000).catch(() => null);
      await button.click({ button: "right" });
      const request = await pending;
      if (!request) continue;
      if (request.candidateLoadout === baselineLoadout || request.removedRanks < 1 || request.addedRanks !== 0) continue;
      candidates.push({ tree: treeName, talent: label.split(", ранг")[0], ...request });
      acceptedInTree += 1;
    }
  }

  if (candidates.length < Math.min(12, maxBuilds)) throw new Error(`Captured only ${candidates.length} distinct build edits`);
  if (!candidates.some((candidate) => candidate.talent === "Wrath and Fury")) throw new Error("Wrath and Fury was not covered by the build matrix");
  if (new Set(candidates.map((candidate) => candidate.candidateLoadout)).size !== candidates.length) throw new Error("Build matrix contains duplicate export strings");

  const encounters = [
    { id: "solo-pve", duration: 45, aoeTargets: 3 },
    { id: "pve-aoe", duration: 45, aoeTargets: 8 },
    { id: "mythic-plus", duration: 60, aoeTargets: 5 },
    { id: "raid", duration: 180, aoeTargets: 2 },
  ];
  const workerCache = new Map();
  async function workerSim(loadout, duration, targets) {
    const key = `${loadout}:${duration}:${targets}`;
    if (workerCache.has(key)) return workerCache.get(key);
    const result = fetch(`${workerURL}/v1/wow/rotation/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ spec: "fury-warrior", scenario: targets === 1 ? "single-target" : "aoe", fightLengthSeconds: duration, targets, rules: ["rampage"], talentLoadout: loadout }),
      signal: AbortSignal.timeout(60000),
    }).then(async (workerResponse) => {
      const payload = await workerResponse.json().catch(() => ({}));
      if (workerResponse.status !== 201 || !String(payload.engine ?? "").startsWith("SimulationCraft") || !Number.isFinite(payload.dps) || payload.dps <= 0) {
        throw new Error(`Worker rejected a build: ${workerResponse.status} ${JSON.stringify(payload)}`);
      }
      return payload;
    });
    workerCache.set(key, result);
    return result;
  }

  const results = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const encounter = encounters[index % encounters.length];
    // The worker intentionally serializes SimulationCraft to cap CPU and memory.
    const baselineSingle = await workerSim(baselineLoadout, encounter.duration, 1);
    const candidateSingle = await workerSim(candidate.candidateLoadout, encounter.duration, 1);
    const baselineAoe = await workerSim(baselineLoadout, encounter.duration, encounter.aoeTargets);
    const candidateAoe = await workerSim(candidate.candidateLoadout, encounter.duration, encounter.aoeTargets);
    const relative = (value, baseline) => ((value - baseline) / baseline) * 100;
    const singleTargetDelta = relative(candidateSingle.dps, baselineSingle.dps);
    const aoeDelta = relative(candidateAoe.dps, baselineAoe.dps);
    const integrityError = talentSimulationIntegrityError({ ...candidate, singleTargetDelta, aoeDelta });
    const contradictory = Math.max(singleTargetDelta, aoeDelta) > .25;
    if (contradictory && !integrityError) throw new Error(`Uncaught contradictory gain for ${candidate.talent}: ST ${singleTargetDelta}, AoE ${aoeDelta}`);
    results.push({ tree: candidate.tree, talent: candidate.talent, scenario: encounter.id, singleTargetDelta, aoeDelta, guarded: Boolean(integrityError) });
  }

  // Property loop: no finite/huge/removal-only contradiction may pass the shared
  // integrity boundary used by both the API and the browser.
  for (let index = 0; index < 1000; index += 1) {
    const aoeDelta = -30 + (index * 7919 % 6000) / 100;
    const singleTargetDelta = -30 + (index * 3571 % 6000) / 100;
    const error = talentSimulationIntegrityError({ editDistance: 1, addedRanks: 0, removedRanks: 1, singleTargetDelta, aoeDelta });
    if ((Math.max(aoeDelta, singleTargetDelta) > .25 || Math.max(Math.abs(aoeDelta), Math.abs(singleTargetDelta)) > 25) && !error) {
      throw new Error(`Integrity fuzz case escaped: ${singleTargetDelta}/${aoeDelta}`);
    }
  }

  injectContradiction = true;
  await reloadBaseline();
  await page.getByRole("navigation", { name: "Деревья талантов" }).getByRole("button", { name: /^Специализация/ }).click();
  const contradictoryRequest = nextCaptured();
  await page.locator(".talent-calculator .tc-tree-canvas").getByRole("button", { name: /^Wrath and Fury, ранг 1 из/ }).click({ button: "right" });
  await contradictoryRequest;
  await page.getByText("Результат не принят:", { exact: false }).waitFor({ timeout: 10000 });
  injectContradiction = false;

  const wrath = results.find((result) => result.talent === "Wrath and Fury");
  console.log(JSON.stringify({
    status: "passed",
    builds: results.length,
    trees: Object.fromEntries(treeNames.map((name) => [name, results.filter((result) => result.tree === name).length])),
    scenarios: Object.fromEntries(encounters.map((encounter) => [encounter.id, results.filter((result) => result.scenario === encounter.id).length])),
    guardedContradictions: results.filter((result) => result.guarded).length,
    wrathAndFury: wrath,
    integrityFuzzCases: 1000,
    contradictoryUiResultBlocked: true,
    browserErrors,
  }, null, 2));
  if (browserErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
