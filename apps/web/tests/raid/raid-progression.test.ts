import assert from "node:assert/strict";
import test from "node:test";
import { getRaidProgression } from "../../components/wow/raid/raidProgression";
import { raidHubEntries } from "../../components/wow/raid/raidHubData";

test("progression references real bosses and covers each raid without cycles", () => {
  for (const raid of raidHubEntries) {
    const plan = getRaidProgression(raid.slug)!;
    assert.ok(plan, raid.slug);
    const bosses = new Set(raid.bosses.map((boss) => boss.slug));
    assert.equal(new Set(plan.links.map((link) => `${link.from}:${link.to}`)).size, plan.links.length);
    assert.ok(plan.sources.length && plan.sources.every((source) => new URL(source.url).protocol === "https:"));
    for (const link of plan.links) assert.ok(bosses.has(link.from) && bosses.has(link.to), `${raid.slug}: ${link.from} → ${link.to}`);
    const incoming = (slug: string) => plan.links.filter((link) => link.to === slug).map((link) => link.from);
    const roots = raid.bosses.filter((boss) => !incoming(boss.slug).length);
    assert.equal(roots.length, 1, raid.slug);
    const visited = new Set<string>();
    const walk = (slug: string, ancestors: Set<string>) => {
      assert.ok(!ancestors.has(slug), `${raid.slug}: cycle at ${slug}`);
      visited.add(slug);
      for (const link of plan.links.filter((link) => link.from === slug)) walk(link.to, new Set([...ancestors, slug]));
    };
    walk(roots[0].slug, new Set());
    assert.deepEqual([...visited].sort(), [...bosses].sort(), raid.slug);
    for (const lieutenant of plan.lieutenants) {
      if (lieutenant.beforeBoss) assert.ok(bosses.has(lieutenant.beforeBoss));
      if (lieutenant.afterBoss) assert.ok(bosses.has(lieutenant.afterBoss));
    }
  }
  assert.equal(getRaidProgression("missing-raid"), undefined);
  assert.equal(getRaidProgression("toString"), undefined);
});

test("Venomous branches both join before Twin Fangs without a catalog-order shortcut", () => {
  const plan = getRaidProgression("venomous-abyss")!;
  const outgoing = (slug: string) => plan.links.filter((link) => link.from === slug).map((link) => link.to).sort();
  const incoming = (slug: string) => plan.links.filter((link) => link.to === slug).map((link) => link.from).sort();
  assert.deepEqual(outgoing("nekzali-the-soulcoiler"), ["entombed-sentinels", "the-lost-explorers"]);
  assert.deepEqual(outgoing("entombed-sentinels"), ["vashnik-the-malignant"]);
  assert.deepEqual(outgoing("the-lost-explorers"), ["sszorak"]);
  assert.deepEqual(incoming("the-twin-fangs"), ["sszorak", "vashnik-the-malignant"]);
  assert.match(plan.note.en, /Only after both wings/);
  assert.match(plan.note.ru, /Только после обеих ветвей/);
});

test("Voidspire preserves both wings and Slauros difficulty gate", () => {
  const plan = getRaidProgression("the-voidspire")!;
  assert.deepEqual(plan.links.filter((link) => link.to === "vaelgor-ezzorak").map((link) => link.from).sort(), ["fallen-king-salhadaar", "vorasius"]);
  const slauros = plan.lieutenants.find((lieutenant) => lieutenant.npcId === 252066)!;
  assert.match(slauros.note.en, /Heroic and Mythic.*Vorasius and Fallen-King Salhadaar/);
  assert.ok(plan.lieutenants.some((lieutenant) => lieutenant.npcId === 252067));
  assert.ok(!plan.lieutenants.some((lieutenant) => lieutenant.npcId === 256614));
});

test("single-encounter raids do not invent inter-boss links or lieutenants", () => {
  for (const slug of ["the-dreamrift", "sporefall"]) {
    const plan = getRaidProgression(slug)!;
    assert.deepEqual(plan.links, []);
    assert.deepEqual(plan.lieutenants, []);
  }
});
