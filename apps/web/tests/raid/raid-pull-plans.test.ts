import assert from "node:assert/strict";
import test from "node:test";
import { getRaidPullPlan } from "../../components/wow/raid/raidPullPlans.server";
import { raidHubEntries } from "../../components/wow/raid/raidHubData";
import { midnightRaidRoutes } from "../../components/wow/raid/midnightRaidRoutes";

test("every published raid has a usable bilingual plan and existing boss destinations", () => {
  for (const raid of raidHubEntries) {
    const plan = getRaidPullPlan(raid.slug)!;
    assert.ok(plan?.pulls.length, raid.slug);
    assert.ok(plan.name.en && plan.name.ru);
    assert.equal(new Set(plan.pulls.map((pull) => pull.id)).size, plan.pulls.length);
    assert.ok(plan.sources.every((source) => new URL(source.url).protocol === "https:"));
    for (const pull of plan.pulls) {
      assert.ok(pull.x > 0 && pull.x < 100 && pull.y > 0 && pull.y < 100);
      assert.ok(pull.title.en && pull.title.ru && pull.call.en && pull.call.ru);
      assert.ok(raid.bosses.some((boss) => boss.slug === pull.bossSlug));
      for (const role of ["tank", "healer", "dps"] as const) {
        assert.ok(pull.roles[role].length);
        assert.ok(pull.roles[role].every((task) => task.en && task.ru));
      }
    }
  }
  assert.equal(getRaidPullPlan("missing-raid"), undefined);
});

test("trash counts and spell identities stay faithful to the authored source", () => {
  for (const route of Object.values(midnightRaidRoutes)) {
    const plan = getRaidPullPlan(route.raid)!;
    assert.equal(plan.coverage, "route-draft");
    assert.equal(plan.pulls.length, route.pulls.length);
    for (const original of route.pulls) {
      const pull = plan.pulls.find((entry) => entry.id === original.id)!;
      assert.deepEqual(pull.enemies.map((enemy) => [enemy.npcId, enemy.count]), original.enemies.map((enemy) => [enemy.npcId, enemy.count]));
      assert.deepEqual(pull.abilities.map((ability) => ability.spellId), original.abilities.map((ability) => ability.spellId));
    }
  }
});

test("interrupt briefing names the correct source mob and keeps role assignment", () => {
  const plan = getRaidPullPlan("the-voidspire")!;
  const pull = plan.pulls[0];
  const interrupt = pull.abilities.find((ability) => ability.spellId === 1228330)!;
  assert.equal(interrupt.caster?.en, "Abyssal Caller");
  assert.equal(interrupt.action, "interrupt");
  assert.ok(interrupt.roles.includes("dps"));
  assert.ok(!interrupt.roles.includes("healer"));
  assert.ok(pull.roles.dps.every((task) => !pull.abilities.some((ability) => ability.response?.en === task.en)));
});

test("reviewed Voidspire omits invented counts, duplicate steps and the unsupported final pack", () => {
  const plan = getRaidPullPlan("the-voidspire")!;
  assert.ok(plan.pulls.flatMap((pull) => pull.enemies).every((enemy) => enemy.count === undefined));
  assert.ok(plan.pulls.every((pull) => pull.steps.length === 0));
  assert.equal(plan.pulls.at(-1)?.kind, "rally");
  assert.equal(plan.pulls.at(-1)?.abilities.length, 0);
  assert.ok(plan.pulls.flatMap((pull) => pull.abilities).every((ability) => ability.caster));
  assert.ok(!plan.pulls.flatMap((pull) => pull.abilities).some((ability) => ability.spellId === 1274846));
  const crush = plan.pulls[0].abilities.find((ability) => ability.spellId === 1230690)!;
  assert.equal(crush.action, "defensive");
  assert.ok(crush.response && !crush.response.en.includes("six yards"));
});

test("Dreamrift rally does not manufacture trash or combat tasks", () => {
  const pull = getRaidPullPlan("the-dreamrift")!.pulls[0];
  assert.equal(pull.kind, "rally");
  assert.equal(pull.enemies.length, 0);
  assert.equal(pull.abilities.length, 0);
  assert.ok(pull.roles.tank[0].en.includes("before entering"));
});

test("current encounters are explicitly scoped and do not invent fixed add wave sizes", () => {
  const plan = getRaidPullPlan("venomous-abyss")!;
  assert.equal(plan.coverage, "encounters");
  assert.equal(plan.pulls.length, 8);
  assert.ok(plan.pulls.every((pull) => pull.kind === "boss"));
  assert.ok(plan.pulls.every((pull) => pull.enemies[0].priority === "boss"));
  assert.ok(plan.pulls.flatMap((pull) => pull.enemies).every((enemy) => enemy.count === undefined));
  assert.ok(plan.pulls[0].enemies.some((enemy) => enemy.name.en === "Restless Amani"));
  assert.ok(plan.pulls.flatMap((pull) => pull.abilities).every((ability) => ability.effect && ability.icon));
});

test("Sporefall keeps authentic identities without publishing unverified spell descriptions", () => {
  const plan = getRaidPullPlan("sporefall")!;
  assert.equal(plan.coverage, "encounters");
  assert.equal(plan.pulls.length, 1);
  assert.ok(plan.pulls[0].abilities.length > 0);
  assert.ok(plan.pulls[0].abilities.every((ability) => ability.icon && !ability.effect));
  assert.ok(plan.pulls[0].roles.dps.some((task) => task.en.includes("Poison Burst")));
});
