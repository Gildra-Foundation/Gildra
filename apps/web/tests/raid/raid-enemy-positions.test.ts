import assert from "node:assert/strict";
import test from "node:test";
import { getRaidPullPlan } from "../../components/wow/raid/raidPullPlans.server";
import { raidPullRouteModel } from "../../components/wow/raid/raidPullRouteModel";
import { getRaidProgression } from "../../components/wow/raid/raidProgression";

test("recommended groups replace individual observations and remain floor scoped", () => {
  const plan = getRaidPullPlan("the-voidspire")!;
  assert.ok(plan.atlas!.floors.every(floor => !("enemies" in floor)));
  const ground = raidPullRouteModel(plan, "map", "16340-0")!;
  const crown = raidPullRouteModel(plan, "map", "16340-1")!;
  assert.deepEqual(ground.markers.map(point => point.index), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(crown.markers.map(point => point.index), [6]);
  assert.equal(ground.schematic, false);
  const arena = raidPullRouteModel(plan, "arena", "main")!;
  assert.equal(arena.schematic, true);
  assert.deepEqual(arena.markers.map(point => point.index), plan.pulls.map((_, index) => index));
  assert.notDeepEqual(arena.markers[0], ground.markers[0]);
  assert.ok(ground.path.includes("39.8 68.5") && ground.path.includes("65.6 76.4"));
  for (const point of [...ground.markers, ...crown.markers, ...arena.markers]) {
    assert.ok(point.x > 0 && point.x < 100 && point.y > 0 && point.y < 100);
  }
});

test("Celestial Behemoth uses the raid identity and abilities instead of its Voidstorm namesake", () => {
  const plan = getRaidPullPlan("the-voidspire")!;
  const pull = plan.pulls.find(pull => pull.id === "voidspire-06")!;
  assert.deepEqual(pull.enemies.map(enemy => enemy.npcId), [252070]);
  assert.deepEqual(pull.abilities.map(ability => ability.spellId), [1259291, 1259328]);
  assert.ok(pull.abilities.every(ability => ability.caster?.en === "Celestial Behemoth" && ability.icon));
  assert.ok(getRaidProgression("the-voidspire")!.lieutenants.some(npc => npc.npcId === 252070));
  assert.ok(!JSON.stringify(pull).includes("Umbral Ejection"));
});

test("Voidspire samples do not leak onto unrelated raid maps", () => {
  for (const slug of ["the-dreamrift", "march-on-queldanas", "venomous-abyss", "sporefall"]) {
    assert.equal(raidPullRouteModel(getRaidPullPlan(slug)!, "map", "0"), undefined);
  }
});
