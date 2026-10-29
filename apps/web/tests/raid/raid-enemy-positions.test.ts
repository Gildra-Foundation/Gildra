import assert from "node:assert/strict";
import test from "node:test";
import { getRaidPullPlan } from "../../components/wow/raid/raidPullPlans.server";
import { getRaidProgression } from "../../components/wow/raid/raidProgression";

test("Wowhead floor coordinates stay on their own floor without invented packs", () => {
  const plan = getRaidPullPlan("the-voidspire")!;
  const ground = plan.atlas!.floors.find(floor => floor.id === "16340-0")!;
  const crown = plan.atlas!.floors.find(floor => floor.id === "16340-1")!;
  assert.deepEqual(ground.enemies!.find(enemy => enemy.npcId === 240548)?.points, [
    { x: 32.2, y: 74.2 }, { x: 33.2, y: 78 }, { x: 34.6, y: 79.1 }, { x: 38.1, y: 76.9 },
  ]);
  assert.deepEqual(crown.enemies!.map(enemy => enemy.npcId), [253036]);
  assert.ok(crown.enemies![0].points.some(point => point.x === 35.4 && point.y === 30.2));
  assert.ok(!ground.enemies!.some(enemy => enemy.npcId === 253036));
  // These lieutenants have no coordinate samples; narrative directions cannot
  // be converted into made-up map positions.
  for (const npcId of [240864, 240831, 252066, 256598]) {
    assert.ok(!plan.atlas!.floors.some(floor => floor.enemies?.some(enemy => enemy.npcId === npcId)));
  }
  for (const floor of plan.atlas!.floors) for (const enemy of floor.enemies ?? []) {
    assert.ok(enemy.name.en && enemy.name.ru);
    assert.equal(enemy.sourceURL, `https://www.wowhead.com/npc=${enemy.npcId}`);
    assert.equal(new Set(enemy.points.map(point => `${point.x}:${point.y}`)).size, enemy.points.length);
    assert.ok(enemy.points.every(point => Number.isFinite(point.x) && point.x >= 0 && point.x <= 100 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 100));
    assert.ok(!("count" in enemy));
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
    assert.ok(getRaidPullPlan(slug)!.atlas!.floors.every(floor => !floor.enemies?.length));
  }
});
