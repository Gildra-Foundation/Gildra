import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { planAuctionGear, searchAuctionGearOptions } from "../lib/wow/auctionGearPlanner.ts";

// Opt-in integration test: the real offline SimC binary, its maintained APL,
// then the real auction planner. No Blizzard, account or production worker calls.
// The stat-only items are deliberately artificial controls, never auction offers.
const binary = process.env.GILDRA_ITEM_EFFECTS_SIMC;
assert(binary, "Set GILDRA_ITEM_EFFECTS_SIMC to the pinned offline SimulationCraft binary");
const exec = promisify(execFile);
const profile = await readFile(new URL("../tests/auction/item-effects/fury.simc", import.meta.url), "utf8");
const scratch = await mkdtemp(join(tmpdir(), "gildra-item-effects-"));
const cases = new Map();
try {
  for (const name of ["native", "active-stat-control", "passive-stat-control", "stats-only-control", "higher-stats-control"]) {
    const text = profile.split("\n").map(line => {
      if (line.startsWith("trinket1=") && ["active-stat-control", "stats-only-control", "higher-stats-control"].includes(name)) {
        return name === "higher-stats-control"
          ? "trinket1=active_stat_control,ilevel=354,stats=155crit"
          : "trinket1=active_stat_control,ilevel=344,stats=149crit";
      }
      if (line.startsWith("trinket2=") && ["passive-stat-control", "stats-only-control", "higher-stats-control"].includes(name)) {
        return "trinket2=passive_stat_control,ilevel=344,stats=197stragi";
      }
      return line;
    }).join("\n");
    const input = join(scratch, name + ".simc"), output = join(scratch, name + ".json");
    await writeFile(input, text, { mode: 0o600 });
    await exec(binary, [input, "iterations=500", "threads=1", "max_time=120", "fixed_time=1",
      "vary_combat_length=0", "deterministic=1", "report_details=1", "json2=" + output],
    { cwd: scratch, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.sim.options.confidence, 0.95);
    const player = report.sim.players[0];
    const dps = player.collected_data.dps;
    assert(dps.mean > 0 && Number.isFinite(dps.mean_std_dev));
    cases.set(name, { player, measurement: { dps: dps.mean, dpsError: dps.mean_std_dev, confidence: 95,
      iterations: report.sim.options.iterations, engine: `SimulationCraft ${report.version} · ${report.git_revision?.slice(0, 7)}` } });
  }
  const get = name => cases.get(name);
  const native = get("native"), statOnly = get("stats-only-control");
  const actions = row => row.player.collected_data.action_sequence.filter(action => action.name?.startsWith("use_item"));
  const damage = row => row.player.stats.find(stat => stat.name === "perfected_guillotine")?.portion_aps?.mean ?? 0;
  assert(actions(native).some(action => action.name === "use_item_voracious_heart_of_ulatek"), "Native APL must activate the item");
  assert.equal(actions(get("active-stat-control")).length, 0, "The control must actually remove the active effect");
  assert(damage(native) > 0, "The passive must deal real simulated damage");
  assert.equal(damage(get("passive-stat-control")), 0, "The control must actually remove the passive");
  for (const name of ["active-stat-control", "passive-stat-control", "stats-only-control"]) {
    const row = get(name);
    for (const slot of ["trinket1", "trinket2"]) {
      for (const key of ["ilevel", "crit_rating", "stragi"]) assert.equal(row.player.gear[slot][key], native.player.gear[slot][key], `${name}: ${slot}.${key}`);
    }
    const margin = 1.96 * Math.hypot(native.measurement.dpsError, row.measurement.dpsError);
    assert(native.measurement.dps - row.measurement.dps > margin, `${name}: effect contribution must exceed measurement noise`);
  }
  assert(get("higher-stats-control").player.gear.trinket1.ilevel > native.player.gear.trinket1.ilevel);
  assert(get("higher-stats-control").player.gear.trinket1.crit_rating > native.player.gear.trinket1.crit_rating);

  const option = (id, slot, ilvl, bonusIds) => ({ id, auctionId: id === "active" ? 1 : id === "passive" ? 2 : 3,
    costCopper: 100, quantity: 1, variantKey: id, candidate: {
      entityId: id, itemId: id === "passive" ? 270173 : 270175, name: "Integration fixture: " + id,
      slotType: slot, itemLevel: ilvl, inventoryType: 12, itemClassId: 4, itemSubclassId: 0, eligible: true,
      constraints: { uniqueEquipped: true, crafted: false, allowableClassMask: "0", requiredLevel: 90 },
      variants: [{ key: id, itemLevel: ilvl, contextId: 0, bonusIds }],
    } });
  const active = option("active", "TRINKET_1", 344, [13335, 13848]);
  const passive = option("passive", "TRINKET_2", 344, [13335, 13848]);
  // Different identity prevents real planner grouping from merging the synthetic
  // higher-level control into the actual native item's simulation.
  const higher = option("higher", "TRINKET_1", 354, []);
  higher.candidate.itemId = 999999;
  const simulate = async selections => {
    const ids = new Set(selections.map(option => option.id));
    assert(!(ids.has("higher") && ids.size > 1));
    return get(ids.has("higher") ? "higher-stats-control" : ids.has("active") && ids.has("passive") ? "native"
      : ids.has("active") ? "passive-stat-control" : ids.has("passive") ? "active-stat-control" : "stats-only-control").measurement;
  };
  const base = { budgetCopper: 200, loadout: [], specId: 72, market: { sourceUpdatedAt: new Date().toUTCString() },
    signal: new AbortController().signal, simulate, objective: "dps" };
  const search = await searchAuctionGearOptions({ ...base, searchId: "item-effects-integration", options: [higher, active], selectedSlots: ["TRINKET_1"] });
  const lowResult = search.result.items.find(item => item.optionId === "active");
  const highResult = search.result.items.find(item => item.optionId === "higher");
  assert.equal(lowResult.evaluation, "upgrade");
  assert(lowResult.comparison.candidateDps > highResult.comparison.candidateDps, "An effect can outweigh higher item level and stats");
  const ranked = await planAuctionGear({ ...base, options: [higher, active] });
  assert.deepEqual(ranked.purchases.map(item => item.auctionId), [1], "Choose measured DPS over higher item level");
  const assembled = await planAuctionGear({ ...base, options: [active, passive] });
  assert.deepEqual(assembled.purchases.map(item => item.auctionId).sort(), [1, 2], "Evaluate active and passive together in the complete set");
  assert.equal(assembled.comparison.candidateDps, native.measurement.dps);
  const evidence = {
    status: "verified", checkedAt: new Date().toISOString(), scope: "Public reference fixture and artificial stat-only controls; no account or market requests",
    fixtureSha256: createHash("sha256").update(profile).digest("hex"), engine: native.measurement.engine,
    measurements: Object.fromEntries([...cases].map(([name, row]) => [name, row.measurement])),
    activeItemUses: actions(native).length, passiveDamageDps: damage(native),
    lowerItemLevelWins: true, fullSetIncludesBoth: true,
  };
  if (process.env.GILDRA_ITEM_EFFECTS_OUTPUT) await writeFile(process.env.GILDRA_ITEM_EFFECTS_OUTPUT, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
