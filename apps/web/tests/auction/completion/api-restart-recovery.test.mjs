import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runApiChild } from "./api-process-support.mjs";

for (const kind of ["initial", "linked", "resume", "assemble"]) test(`owned HTTP recovery reattaches interrupted ${kind} work once after restart`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-http-restart-"));
  try {
    const accepted = await runApiChild(directory, "seed", { kind });
    const recovered = await runApiChild(directory, "recover", accepted);
    assert.equal(recovered.status, "passed"); assert.equal(recovered.tasks, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
