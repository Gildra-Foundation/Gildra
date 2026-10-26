import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { getMidnightRaid } from "../../lib/data/wow/raid/midnightRaidData";
import { getVoidspireBossPlan } from "../../components/wow/raid/voidspireBossPlans.server";

const bosses = getMidnightRaid("the-voidspire")!.bosses;

test("six complete bilingual encounters have official arenas and role tasks at every stage", () => {
  assert.equal(bosses.length, 6);
  let stages = 0;
  for (const boss of bosses) {
    const plan = getVoidspireBossPlan(boss);
    stages += plan.pulls.length;
    assert.equal(plan.encounter?.bossSlug, boss.slug);
    assert.equal(plan.coverage, "encounters");
    assert.equal(plan.routePath, "");
    assert.ok(plan.atlas?.arenas[boss.slug]?.length);
    assert.deepEqual(Object.keys(plan.atlas!.arenas), [boss.slug]);
    assert.ok(plan.atlas!.floors.every(floor => floor.pins.every(pin => pin.bossSlug === boss.slug)));
    assert.equal(plan.atlas!.progression, undefined);
    assert.equal(new Set(plan.pulls.map(pull => pull.id)).size, plan.pulls.length);
    for (const pull of plan.pulls) {
      assert.ok(pull.title.ru && pull.title.en && pull.call.ru && pull.call.en);
      assert.ok(pull.enemies.length && pull.abilities.length);
      assert.equal(pull.steps.length, 0);
      for (const role of ["tank", "healer", "dps"] as const) {
        assert.ok(pull.roles[role].every(task => task.ru && task.en));
        assert.ok(pull.roles[role].length);
      }
      assert.ok(pull.enemies.every(enemy => enemy.name.ru && enemy.name.en && enemy.count === undefined));
      assert.equal(new Set(pull.abilities.map(a => a.spellId)).size, pull.abilities.length);
      for (const ability of pull.abilities) {
        assert.ok(ability.spellId && ability.response?.ru && ability.response.en && ability.roles.length);
        assert.ok(ability.icon && existsSync(new URL(`../../public${ability.icon}`, import.meta.url)));
      }
      const diagram = plan.encounter!.diagrams[pull.id];
      assert.ok(diagram.markers.length && diagram.zones.length);
      assert.ok(diagram.markers.every(m => m.x > 0 && m.x < 100 && m.y > 0 && m.y < 100));
    }
    assert.ok(!/vexis|mystic|nova|grave|memberId|Arcane Surge|Shield Wall/.test(JSON.stringify(plan)));
    assert.ok(!plan.pulls.some(p => p.abilities.some(a => a.spellId === 1255749)), "Mythic-only Gathering Darkness");
  }
  assert.equal(stages, 17);
});

test("Crown includes both intermissions and Alleria's clone rather than the obsolete Xal'atath stage", () => {
  const plan = getVoidspireBossPlan(bosses.find(b => b.slug === "crown-of-the-cosmos")!);
  assert.equal(plan.pulls.length, 5);
  assert.equal(plan.pulls.filter(p => p.id.includes("singularity")).length, 2);
  assert.ok(plan.pulls[2].title.en.includes("Alleria"));
  assert.ok(!JSON.stringify(plan).includes("Xal'atath"));
  for (const ability of plan.pulls.flatMap(p => p.abilities).filter(a => a.spellId === 1233865)) {
    assert.equal(ability.action, "defensive");
    assert.deepEqual(ability.roles, ["healer"]);
    assert.ok(ability.response!.en.includes("transfers"));
  }
});

test("actual encounter casts are linked and Heroic changes do not overwrite the Normal response", () => {
  const plans = bosses.map(getVoidspireBossPlan);
  const ids = new Set(plans.flatMap(p => p.pulls.flatMap(stage => stage.abilities.map(a => a.spellId))));
  for (const id of [1260712, 1260052, 1241692, 1256855, 1235617]) assert.ok(ids.has(id));
  for (const id of [1281735, 1260046, 1244012, 1241864, 1243982]) assert.ok(!ids.has(id));
  const walls = plans[1].pulls[1].abilities.find(a => a.spellId === 1259184)!;
  assert.ok(walls.heroic?.en.includes("Two explosions"));
  assert.ok(!walls.response?.en.includes("Two explosions"));
});
