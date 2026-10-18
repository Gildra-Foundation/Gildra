import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runActiveRecoveryChild } from "./active-recovery-support.mjs";

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-active-recovery-"));
  try { return await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

for (const kind of ["initial", "linked", "resume", "assemble", "assemble-allowed"]) {
  test(`cold authenticated tab discovers interrupted ${kind} without starting it, then explicitly resumes exact intent`, async () => withDirectory(async directory => {
    const accepted = await runActiveRecoveryChild(directory, "seed", { kind });
    const recovered = await runActiveRecoveryChild(directory, "recover", accepted);
    assert.equal(recovered.tasks, 1);
    assert.equal(recovered.kind, kind === "initial" ? "start" : kind.startsWith("assemble") ? "assemble" : "resume");
  }));
}

test("a cold tab can durably cancel parked work without resuming it, including failed cancellation ACK retry", async () => withDirectory(async directory => {
  const accepted = await runActiveRecoveryChild(directory, "seed", { kind: "assemble" });
  const cancelled = await runActiveRecoveryChild(directory, "cancel", accepted);
  assert.equal(cancelled.tasks, 0);
  const restarted = await runActiveRecoveryChild(directory, "after-cancel", accepted);
  assert.equal(restarted.cancelled, true);
}));

test("expired assembly context still exposes a cancellable owned handle without inventing form intent", async () => withDirectory(async directory => {
  const accepted = await runActiveRecoveryChild(directory, "seed", { kind: "assemble" });
  assert.equal((await runActiveRecoveryChild(directory, "missing-context", accepted)).cancelled, true);
}));

test("POST conflict includes owner-bound recovery and completed discovery/open races stay terminal", async () => withDirectory(async directory => {
  const observed = await runActiveRecoveryChild(directory, "race");
  assert.equal(observed.conflictRecoverable, true);
  assert.equal(observed.completedRacePreserved, true);
}));

test("active discovery returns null for absent work and rejects malformed or mixed identity queries", async () => withDirectory(async directory => {
  assert.equal((await runActiveRecoveryChild(directory, "empty")).passed, true);
}));
