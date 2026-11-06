import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRussianTalentText, pickSpecVariant, resolvePluralForms } from "../../lib/talentText.ts";
import { loadoutDistance, loadoutNodeRecords, loadoutSpecId, popularBuilds } from "../../lib/talentPopularBuilds.ts";
import { heroTreeLines, specResource, specStrengths } from "../../lib/data/wow/classFacts.ts";
import { talentSpecThemes } from "../../lib/talentSpecThemes.ts";

const warrior = { specName: "Неистовство", classSpecNames: ["Оружие", "Неистовство", "Защита"] };

describe("Russian talent text", () => {
  it("computes formulas over attack power and health", () => {
    assert.equal(
      formatRussianTalentText("Могучий удар, суммарно наносящий [([206.998% of Attack Power]) + ([206.998% of Attack Power])] ед. физического урона.", warrior),
      "Могучий удар, суммарно наносящий физический урон в размере 414% силы атаки.",
    );
    assert.equal(
      formatRussianTalentText("Действует 8 сек. или пока вы не получите [(0.2) * Всего очков здоровья] ед. урона от этого эффекта.", warrior),
      "Действует 8 сек. или пока вы не получите урон в размере 20% запаса здоровья от этого эффекта.",
    );
    assert.equal(
      formatRussianTalentText("Поражает противников, нанося [7 * ([271.635% of Attack Power])%] ед. физического урона за 6 сек.", warrior),
      "Поражает противников, нанося физический урон в размере 1901% силы атаки за 6 сек.",
    );
    assert.equal(formatRussianTalentText("щит, поглощающий [1875 / 100 * Сила атаки * (1 + Универсальность)] ед. урона."), "щит, поглощающий урон в размере 1875% силы атаки.");
    assert.equal(formatRussianTalentText("Дает (120 / 10) ед. ярости."), "Дает 12 ед. ярости.");
  });

  it("keeps the damage school before the amount and the value without the aura", () => {
    assert.equal(formatRussianTalentText("наносит ([190.465% of Attack Power]) ед. урона от кровотечения за 15 сек."), "наносит урон от кровотечения в размере 190% силы атаки за 15 сек.");
    assert.equal(
      formatRussianTalentText("нанося им до {?a320415[{[([40.26% of Attack Power]) * 10 * 2]][{[([40.26% of Attack Power]) * 10]] ед. урона от магии Хаоса за 2 сек."),
      "нанося им урон от магии Хаоса в размере до 403% силы атаки за 2 сек.",
    );
  });

  it("resolves talent clauses for a character without the talent", () => {
    assert.equal(
      formatRussianTalentText("Наносит ([235.68% of Attack Power]) ед. физического урона [Громовой раскат: обездвиживает их на 4 сек] и снижает скорость. Наносит меньше урона целям после 5 / Безрассудство: 8 / Разящий гром: 85-й.\n[\nДает 0 ед. ярости.]", warrior),
      "Наносит физический урон в размере 236% силы атаки и снижает скорость. Наносит меньше урона целям после 5-й.",
    );
    assert.equal(formatRussianTalentText("Время восстановления \"Печати [Печать немоты: немоты / страдания]\" на [Печать цепей: 15 / 30] сек."), "Время восстановления \"Печати страдания\" на 30 сек.");
    // The specialization's own clause stays.
    const holy = { specName: "Свет", classSpecNames: ["Послушание", "Свет", "Тьма"] };
    assert.equal(formatRussianTalentText("потребует на [ Свет: 40 / 50]% маны меньше", holy), "потребует на 40% маны меньше");
    assert.doesNotMatch(formatRussianTalentText("Радиус 40 м. [ Тьма: Дает 5 ед. безумия.]", holy), /безумия/);
  });

  it("keeps the variant of the specialization", () => {
    const text = "Оружие\nАвтоатаки дают на 1050% больше ярости.\n\nНеистовство, Защита\nАвтоатаки дают на 50% больше ярости.";
    assert.equal(pickSpecVariant(text, warrior), "Автоатаки дают на 50% больше ярости.");
    assert.equal(pickSpecVariant(text, { ...warrior, specName: "Оружие" }), "Автоатаки дают на 1050% больше ярости.");
    // "Лед" in the game text is the "Лёд" specialization.
    assert.equal(pickSpecVariant("Лед\nА.\n\nОгонь\nБ.", { specName: "Лёд", classSpecNames: ["Тайная магия", "Огонь", "Лёд"] }), "А.");
    assert.equal(pickSpecVariant("Без вариантов.", warrior), "Без вариантов.");
  });

  it("picks plural forms of longer phrases", () => {
    assert.equal(
      resolvePluralForms("4 следующие атаки, действующие на одну цель, поражают:следующих атак, действующих на одну цель, поражают до 4 целей"),
      "4 следующие атаки, действующие на одну цель, поражают до 4 целей",
    );
  });
});

/** A version-2 string: header (8 + 16 + 128 bits), then one record per node. */
function loadout(specId: number, nodes: Array<0 | 1 | [number, number?]>) {
  const bits: number[] = [];
  const write = (width: number, value: number) => { for (let index = 0; index < width; index += 1) bits.push((value >> index) & 1); };
  write(8, 2); write(16, specId); for (let index = 0; index < 16; index += 1) write(8, 0);
  for (const node of nodes) {
    if (node === 0) { write(1, 0); continue; }
    write(1, 1); write(1, 1);
    if (node === 1) { write(1, 0); write(1, 0); continue; }
    write(1, 1); write(6, node[0]);
    if (node[1] === undefined) write(1, 0); else { write(1, 1); write(2, node[1]); }
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let index = 0; index < bits.length; index += 6) {
    let value = 0;
    for (let bit = 0; bit < 6; bit += 1) value |= (bits[index + bit] ?? 0) << bit;
    out += alphabet[value];
  }
  return out;
}

describe("popular builds", () => {
  const base: Array<0 | 1 | [number, number?]> = [1, 1, 0, [2], 1, 0, 1, [1, 1], 0, 1];
  const swap = (index: number, other: number) => base.map((node, at) => (at === index ? base[other] : at === other ? base[index] : node));
  const player = (name: string, score: number, nodes = base, heroId = 60) => ({ name, realm: "Kazzak", region: "eu", score, loadout: loadout(72, nodes), heroId });

  it("reads the node records and the specialization of a string", () => {
    const records = loadoutNodeRecords(loadout(72, base));
    assert.equal(loadoutSpecId(loadout(72, base)), 72);
    assert.deepEqual(records, ["r0c0", "r0c0", "", "r2c0", "r0c0", "", "r0c0", "r1c1", "", "r0c0"]);
    assert.equal(loadoutDistance(records!, loadoutNodeRecords(loadout(72, swap(1, 2)))!), 2);
    assert.equal(loadoutNodeRecords("not a loadout!"), null);
  });

  it("groups near builds per hero tree and keeps every hero tree", () => {
    const builds = popularBuilds([
      player("A", 4100), player("B", 4000), player("C", 3900, swap(1, 2)),
      player("D", 4200, base.map((node) => (node === 0 ? 1 : 0)) as typeof base),
      ...Array.from({ length: 4 }, (_, index) => player(`E${index}`, 3000 + index, base.map(() => 1), 61)),
      ...Array.from({ length: 5 }, (_, index) => player(`F${index}`, 3500 + index, base.map(() => [3] as [number]), 60)),
    ], { tolerance: 2, limit: 2 });
    assert.deepEqual(builds.map((build) => [build.heroId, build.count]), [[60, 5], [61, 4]]);
    assert.equal(builds[0].players.length, 3);
  });

  it("puts the most common string forward and ranks players by rating", () => {
    const [build] = popularBuilds([player("A", 4100, swap(1, 2)), player("B", 4000), player("C", 3900)], { tolerance: 2 });
    assert.equal(build.loadout, loadout(72, base));
    assert.equal(build.count, 3);
    assert.deepEqual(build.players.map((item) => item.name), ["A", "B", "C"]);
    assert.equal(build.share, 1);
  });
});

describe("class facts", () => {
  it("cover every specialization and hero tree", () => {
    for (const theme of talentSpecThemes) {
      assert.ok(specResource[theme.slug], `resource of ${theme.slug}`);
      assert.equal(specStrengths[theme.slug]?.length, 3, `strengths of ${theme.slug}`);
      for (const hero of theme.heroPaths) assert.ok(heroTreeLines[hero.id], `hero tree ${hero.id} of ${theme.slug}`);
    }
  });
});
