const baseURL = (process.env.TALENT_OPTIMIZER_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const endpoint = `${baseURL}/api/wow/talent-optimizer`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function start(maxCandidates) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterSlug: "furybar", spec: "fury-warrior", scenario: "raid", dataMode: "fixture", maxCandidates }),
  });
  const payload = await response.json();
  assert(response.status === 202, `Optimizer did not accept the job: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function read(id) {
  const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}&dataMode=fixture`);
  const payload = await response.json();
  assert(response.ok, `Optimizer job could not be read: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const started = await start(3);
const observed = [];
let completed = started;
const deadline = Date.now() + 180_000;
while (!["completed", "failed", "cancelled"].includes(completed.status) && Date.now() < deadline) {
  await wait(250);
  completed = await read(started.id);
  observed.push({ status: completed.status, phase: completed.phase, completed: completed.completed });
}
assert(completed.status === "completed", `Optimizer did not complete: ${JSON.stringify(completed)}`);
assert(completed.completed === completed.total && completed.results.length === 3, "Optimizer lost candidate results");
assert(completed.result?.baseline?.dps > 0, "Optimizer baseline is missing");
assert(completed.result?.winner && completed.result?.verification?.dps > 0, "Winner was not verified");
assert(completed.result.verification.fromCache === false, "Winner verification came from cache");
assert(Math.abs(completed.result.verifiedWinnerDpsDelta) <= 2 * Math.max(1, completed.result.verification.dpsError), "Winner verification is outside SimulationCraft uncertainty");
assert(new Set(completed.results.map((entry) => entry.tree)).size === 3, "Bounded search did not cover class, hero and spec trees");
assert(completed.results.some((entry) => entry.kind === "rank-swap"), `Bounded search contains no rank swaps: ${JSON.stringify(completed.results.map((entry) => ({ tree: entry.tree, kind: entry.kind, id: entry.candidateId })))}`);
assert(completed.results.every((entry) => Number.isFinite(entry.singleTargetDeltaPercent) && Number.isFinite(entry.aoeDeltaPercent)), "Top candidates are missing live ST/AoE cross-checks");
for (let index = 1; index < observed.length; index += 1) assert(observed[index].completed >= observed[index - 1].completed, "Optimizer progress moved backwards");

const cancellable = await start(3);
const cancelledResponse = await fetch(`${endpoint}?id=${encodeURIComponent(cancellable.id)}&dataMode=fixture`, { method: "DELETE" });
const cancelled = await cancelledResponse.json();
assert(cancelledResponse.ok && cancelled.status === "cancelled", `Optimizer cancellation failed: ${JSON.stringify(cancelled)}`);

console.log(JSON.stringify({
  status: "passed",
  engine: completed.result.verification.engine,
  baselineDps: completed.result.baseline.dps,
  candidates: completed.results.map((entry) => ({ id: entry.candidateId, tree: entry.tree, dps: entry.dps, selectedDelta: entry.deltaPercent, singleTargetDelta: entry.singleTargetDeltaPercent, aoeDelta: entry.aoeDeltaPercent })),
  winner: { id: completed.result.winner.candidateId, dps: completed.result.winner.dps, verifiedDps: completed.result.verification.dps },
  progressSamples: observed.length,
  cancellation: cancelled.status,
}, null, 2));
