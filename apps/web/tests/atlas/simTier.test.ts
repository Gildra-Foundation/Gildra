import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { simRows, type SimEntry, type SimTable } from "../../components/blocks/wow/tierWorkspace/simTierRows.ts";

const entry = (rank: number, spec: string, cls: string, dps: SimEntry["dps"]): SimEntry => ({
  rank, tier: "A", role: "dps", spec_id: rank, class_name: cls, class_slug: cls.toLowerCase().replace(/ /g, "-"),
  spec_name: spec, spec_slug: spec.toLowerCase(), dps, best: Math.max(...Object.values(dps).map(Number)), behind_pct: 0,
});

const table: SimTable = {
  role: "dps", targets: 1, specs_total: 3,
  entries: [
    entry(1, "Devourer", "Demon Hunter", { popular: 250_000, simcbis: 272_000, top50: 251_000 }),
    entry(2, "Frost", "Death Knight", { popular: 255_000, simcbis: 259_000 }),
    entry(3, "Havoc", "Demon Hunter", { popular: 240_000, simcbis: 255_000, top50: 254_000 }),
  ],
};

describe("sim tier rows", () => {
  it("keeps the source order for the best set and measures the gap to the leader", () => {
    const rows = simRows(table, "best", {});
    assert.deepEqual(rows.map((row) => row.spec_slug), ["devourer", "frost", "havoc"]);
    assert.equal(rows[0].behind, 0);
    assert.equal(rows[1].behind.toFixed(1), "-4.8");
  });

  it("re-ranks by another gear set and leaves out specs without it", () => {
    const popular = simRows(table, "popular", {});
    assert.deepEqual(popular.map((row) => [row.spec_slug, row.position]), [["frost", 1], ["devourer", 2], ["havoc", 3]]);
    const top50 = simRows(table, "top50", {});
    assert.deepEqual(top50.map((row) => row.spec_slug), ["havoc", "devourer"]);
  });

  it("uses localized names by spec theme slug", () => {
    const rows = simRows(table, "best", { "devourer-demon-hunter": { specName: "Пожиратель", className: "Охотник на демонов" } });
    assert.equal(rows[0].specName, "Пожиратель");
    assert.equal(rows[1].specName, "Frost");
  });

  it("returns nothing for a missing table", () => {
    assert.deepEqual(simRows(undefined, "best", {}), []);
  });
});
