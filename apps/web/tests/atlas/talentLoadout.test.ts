import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentCalculatorData, TalentKind, TalentNode } from "../../lib/talentCalculatorData.ts";
import { encodeWoWTalentLoadout } from "../../lib/wowTalentLoadout.ts";
import {
  buildSearchParams, countRanksByTree, createTalentNodeCatalog, decodeLoadout, encodeLoadout, loadoutFromSearch,
  nodeAvailability, nodeShape, parseBuildInput, removeInvalidDependents, sanitizeLoadout, treeGeometry,
} from "../../lib/talentLoadoutState.ts";
import { placeTooltip } from "../../lib/talentTooltipPlacement.ts";
import { resolvePluralForms } from "../../lib/talentText.ts";

const copy = { talentFallback: (id: number) => `#${id}`, chooseOne: (name: string) => `need ${name}`, chooseAnyOf: (names: string[]) => `need one of ${names.join(", ")}`, spendMore: (points: number) => `spend ${points}` };

let nextChoice = 1000;
function node(kind: TalentKind, nodeId: number, x: number, y: number, extra: Partial<TalentNode> = {}): TalentNode {
  const choices = extra.choices ?? [{ externalId: nextChoice++, name: `T${nodeId}`, description: "", iconSource: "fallback" as const, maxRanks: extra.maxRanks ?? 1, talentType: "passive" as const }];
  return { id: `${kind}-${nodeId}`, nodeId, x, y, row: 0, column: 0, maxRanks: 1, talentType: "passive", nodeType: "single", prevNodeIds: [], nextNodeIds: [], requiresNodeIds: [], entryNode: false, freeNode: false, ...extra, choices };
}

const choiceA = { externalId: 501, name: "Left", description: "", iconSource: "fallback" as const, maxRanks: 1, talentType: "choice" as const };
const choiceB = { externalId: 502, name: "Right", description: "", iconSource: "fallback" as const, maxRanks: 1, talentType: "choice" as const };

const classNodes = [
  node("class", 1, 25, 10, { entryNode: true, nextNodeIds: [2, 3] }),
  node("class", 2, 25, 30, { prevNodeIds: [1], nextNodeIds: [4] }),
  node("class", 3, 75, 30, { prevNodeIds: [1], nodeType: "choice", talentType: "choice", choices: [choiceA, choiceB] }),
  node("class", 4, 25, 50, { prevNodeIds: [2], requiredPoints: 2, maxRanks: 2 }),
];
const heroNodes = [node("hero", 11, 50, 10, { entryNode: true, nextNodeIds: [12] }), node("hero", 12, 50, 40, { prevNodeIds: [11], talentType: "active" })];
const specNodes = [node("spec", 21, 50, 10, { entryNode: true, freeNode: true, nextNodeIds: [22] }), node("spec", 22, 50, 40, { prevNodeIds: [21], maxRanks: 2 })];
const all = [...classNodes, ...heroNodes, ...specNodes];

const data = {
  specId: 71, buildId: 1, buildVersion: "x", buildNumber: 1, className: "Warrior", specName: "Arms", heroName: "Colossus",
  heroSubtreeId: 62, heroSelectionNodeId: 900, heroSelectionEntryIndex: 0,
  fullNodeOrder: [...all.map((entry) => entry.nodeId), 900],
  loadoutNodes: [...all.map((entry) => ({ nodeId: entry.nodeId, maxRanks: entry.maxRanks, nodeType: entry.nodeType, freeNode: entry.freeNode, choiceEntryIds: entry.choices.map((choice) => choice.externalId) })), { nodeId: 900, maxRanks: 1, nodeType: "subtree" as const, freeNode: false, choiceEntryIds: [62, 60] }],
  heroIconUrl: "",
  trees: {
    class: { kind: "class", nodes: classNodes, totalRanks: 0, sourceNodeCount: 0, sourceEdgeCount: 0 },
    hero: { kind: "hero", nodes: heroNodes, totalRanks: 0, sourceNodeCount: 0, sourceEdgeCount: 0 },
    spec: { kind: "spec", nodes: specNodes, totalRanks: 0, sourceNodeCount: 0, sourceEdgeCount: 0 },
  },
  pvpTalents: [{ externalId: 7, name: "P", description: "", iconSource: "fallback", specId: 71, buildId: 1, buildVersion: "x", sourceUrl: "" }],
  source: { kind: "official_catalog", label: "", url: "", observedAt: "" },
} satisfies TalentCalculatorData;

const catalog = createTalentNodeCatalog(data);
const ranksOf = (entries: Array<[string, number]>) => new Map(entries);

describe("talent availability", () => {
  it("opens entry nodes and nodes under a learned parent only", () => {
    const ranks = ranksOf([["spec-21", 1]]);
    assert.equal(nodeAvailability(classNodes[0], "class", ranks, 0, catalog, copy).available, true);
    const locked = nodeAvailability(classNodes[1], "class", ranks, 0, catalog, copy);
    assert.equal(locked.available, false);
    assert.equal(locked.reason, "need T1");
    assert.deepEqual(locked.blockerNodeIds, ["class-1"]);
  });

  it("gates on points spent in the tree before the node", () => {
    const ranks = ranksOf([["class-1", 1], ["class-2", 1]]);
    assert.match(nodeAvailability(classNodes[3], "class", ranks, 2, catalog, copy).reason, /^$/);
    const short = nodeAvailability(classNodes[3], "class", ranksOf([["class-1", 1]]), 1, catalog, copy);
    assert.equal(short.available, false);
    assert.match(short.reason, /spend 1/);
  });

  it("removing a parent removes its dependents and reports the lost ranks", () => {
    const ranks = ranksOf([["class-2", 1], ["class-4", 2], ["class-3", 1]]);
    const choices = new Map([["class-3", 502]]);
    const removed = removeInvalidDependents(data, ranks, choices, catalog);
    assert.equal(removed, 4);
    assert.equal(ranks.size, 0);
    assert.equal(choices.size, 0);
  });
});

describe("talent loadout sanitizing", () => {
  it("clamps ranks, adds free nodes, keeps a valid choice and drops unknown or duplicate PvP", () => {
    const result = sanitizeLoadout(data, { ranks: ranksOf([["class-1", 5], ["class-3", 1], ["class-99", 1]]), choices: new Map([["class-3", 502]]), pvp: [7, 7, 123] });
    assert.equal(result.ranks.get("class-1"), 1);
    assert.equal(result.ranks.get("spec-21"), 1);
    assert.equal(result.choices.get("class-3"), 502);
    assert.deepEqual(result.pvp, [7, null, null]);
    assert.equal(result.adjusted, true);
  });

  it("defaults a choice node to its first option", () => {
    const result = sanitizeLoadout(data, { ranks: ranksOf([["class-1", 1], ["class-3", 1]]), choices: new Map() });
    assert.equal(result.choices.get("class-3"), 501);
    assert.equal(result.adjusted, false);
  });

  it("counts spent points per tree without free nodes", () => {
    assert.deepEqual(countRanksByTree(ranksOf([["class-1", 1], ["spec-21", 1], ["spec-22", 2], ["hero-11", 1]]), data), { class: 1, hero: 1, spec: 2 });
  });
});

describe("talent loadout transport", () => {
  const build = { ranks: ranksOf([["class-1", 1], ["class-3", 1], ["hero-11", 1], ["spec-21", 1], ["spec-22", 1]]), choices: new Map([["class-3", 502]]), pvp: [null, 7, null] };

  it("round-trips the URL state (in-game string + PvP)", () => {
    const params = buildSearchParams(data, build);
    assert.ok(params.get("build"));
    assert.equal(params.get("pvp"), "0.7.0");
    const back = loadoutFromSearch(data, params);
    assert.equal(back.source, "url");
    assert.deepEqual([...back.loadout!.ranks].sort(), [...build.ranks].sort());
    assert.equal(back.loadout!.choices.get("class-3"), 502);
    assert.deepEqual(back.loadout!.pvp, [null, 7, null]);
  });

  it("leaves the hero tree out for the other hero path's link and writes nothing for an empty build", () => {
    const params = buildSearchParams(data, build, true);
    const back = loadoutFromSearch(data, params).loadout!;
    assert.equal(back.ranks.has("hero-11"), false);
    assert.equal(back.ranks.get("class-1"), 1);
    assert.equal(buildSearchParams(data, { ranks: ranksOf([["spec-21", 1]]), choices: new Map(), pvp: [null, null, null] }).toString(), "");
  });

  it("still reads the older compact ?loadout= code and flags a broken one", () => {
    const code = encodeLoadout(build.ranks, build.choices, build.pvp);
    assert.deepEqual(decodeLoadout(code)?.pvp, [null, 7, null]);
    assert.equal(loadoutFromSearch(data, new URLSearchParams({ loadout: code })).loadout?.ranks.get("spec-22"), 1);
    assert.equal(loadoutFromSearch(data, new URLSearchParams({ loadout: "%%%" })).source, "invalid");
    assert.equal(loadoutFromSearch(data, new URLSearchParams({ build: "AAAA" })).source, "invalid");
  });
});

describe("talent import box", () => {
  const game = encodeWoWTalentLoadout(data, ranksOf([["class-1", 1], ["spec-21", 1], ["spec-22", 2]]), new Map());

  it("accepts an in-game string, a Gildra link, a calculator link and JSON", () => {
    for (const input of [game, `  ${game}\n`, `https://gildra.net/talents/arms-warrior?build=${encodeURIComponent(game)}`, `https://www.wowhead.com/talent-calc/blizzard/${game}`, JSON.stringify({ build: game })]) {
      const result = parseBuildInput(data, input);
      assert.equal(result.kind, "ok", input);
      if (result.kind === "ok") assert.equal(result.loadout.ranks.get("spec-22"), 2);
    }
  });

  it("names what is wrong: empty, another spec, another hero path, damaged, unknown", () => {
    assert.equal(parseBuildInput(data, "   ").kind, "empty");
    const otherSpec = encodeWoWTalentLoadout({ ...data, specId: 258 }, new Map(), new Map());
    const parsedOther = parseBuildInput(data, otherSpec);
    assert.equal(parsedOther.kind, "other-spec");
    if (parsedOther.kind === "other-spec") assert.equal(parsedOther.specId, 258);
    const otherHero = encodeWoWTalentLoadout({ ...data, heroSelectionEntryIndex: 1 }, ranksOf([["class-1", 1]]), new Map());
    assert.equal(parseBuildInput(data, otherHero).kind, "other-hero");
    assert.equal(parseBuildInput(data, game.slice(0, 27)).kind, "damaged");
    assert.equal(parseBuildInput(data, "hello there").kind, "unknown");
    assert.equal(parseBuildInput(data, "{not json").kind, "damaged");
  });
});

describe("talent tree geometry", () => {
  it("derives the game grid and connections", () => {
    const geometry = treeGeometry(data.trees.class);
    assert.equal(geometry.cellsX, 3);
    assert.equal(geometry.cellsY, 5);
    assert.equal(geometry.edges.length, 3);
    assert.equal(nodeShape(classNodes[2]), "choice");
    assert.equal(nodeShape(heroNodes[1]), "square");
    assert.equal(nodeShape(classNodes[0]), "round");
  });
});

describe("talent tooltip placement", () => {
  const viewport = { width: 1440, height: 900 };
  const box = (left: number, top: number, size = 40) => ({ left, top, right: left + size, bottom: top + size, width: size, height: size });
  const covers = (anchor: ReturnType<typeof box>, spot: { x: number; y: number }, width: number, height: number) =>
    !(spot.x >= anchor.right || spot.x + width <= anchor.left || spot.y >= anchor.bottom || spot.y + height <= anchor.top);
  const inside = (spot: { x: number; y: number }, width: number, height: number, view = viewport) => spot.x >= 0 && spot.y >= 0 && spot.x + width <= view.width && spot.y + height <= view.height;

  it("goes beside the node, flips at the right edge and stays on screen", () => {
    for (const anchor of [box(100, 400), box(1380, 400), box(700, 10), box(700, 850), box(1390, 860)]) {
      const spot = placeTooltip(anchor, 340, 260, viewport);
      assert.equal(covers(anchor, spot, 340, 260), false, JSON.stringify(anchor));
      assert.equal(inside(spot, 340, 260), true, JSON.stringify(anchor));
    }
    assert.ok(placeTooltip(box(1380, 400), 340, 260, viewport).x < 1380);
  });

  it("on a narrow screen it goes above or below, never over the node", () => {
    const phone = { width: 390, height: 844 };
    for (const anchor of [box(20, 300), box(330, 600), box(175, 40)]) {
      const spot = placeTooltip(anchor, 366, 240, phone);
      assert.equal(covers(anchor, spot, 366, 240), false, JSON.stringify(anchor));
      assert.equal(inside(spot, 366, 240, phone), true, JSON.stringify(anchor));
    }
  });
});

describe("talent description text", () => {
  it("keeps the plural form the number needs", () => {
    assert.equal(resolvePluralForms("совершить 3 дополнительных удара:дополнительных ударов глефой по целям"), "совершить 3 дополнительных удара глефой по целям");
    assert.equal(resolvePluralForms("вы совершаете вместо этого 6 удара:ударов."), "вы совершаете вместо этого 6 ударов.");
    assert.equal(resolvePluralForms("до 21 цели:целей рядом"), "до 21 цели рядом");
    assert.equal(resolvePluralForms("Урон: 5% и время: 3 сек."), "Урон: 5% и время: 3 сек.");
  });
});
