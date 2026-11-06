import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import mdt from "../../data/wow/mythic-reviews/mdt.json";
import { clusterKills, placePulls, replayFromRaiderIo, type MapNode } from "../../lib/games/wow/mythicPlusReplayModel.ts";
import { logPositionOnMap, replayFromWarcraftLogs, type WclRunRaw } from "../../lib/games/wow/mythicPlusReplayWcl.ts";
import { toRunDetail } from "../../lib/games/wow/mythicPlusRunTypes.ts";

// One real key, logged twice: Raider.IO run 23351424 (Den of Nalorakk +24, 27:54) and the same fight in
// Warcraft Logs (report BV19wgKxrnZ2dFj8, fight 1), trimmed to the fields the replay reads.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const den = (mdt as unknown as Record<string, { total: number; nodes: MapNode[] }>)["den-of-nalorakk"];
const run = toRunDetail(fixture("raiderio-run-logged.json"))!;
const wcl = fixture("warcraftlogs-run-fight.json") as WclRunRaw;

describe("Mythic+ run replay", () => {
  it("keeps Raider.IO's kill timeline, deaths and realm slugs", () => {
    assert.equal(run.id, 23351424);
    assert.equal(run.log?.totalForces, 729);
    assert.ok((run.log?.kills.length ?? 0) > 100);
    assert.deepEqual(run.log?.deaths.map((death) => death.player), ["Speedamn"]);
    assert.ok(run.players.every((player) => /^[a-z-]+$/.test(player.realmSlug)));
  });

  it("rebuilds the pulls from Raider.IO's log", () => {
    const replay = replayFromRaiderIo(run, den.nodes)!;
    assert.equal(replay.source, "raiderio");
    assert.equal(replay.pulls.length, 17);
    assert.equal(replay.pulls.reduce((sum, pull) => sum + pull.forces, 0), 729);
    assert.deepEqual(replay.pulls.filter((pull) => pull.boss).map((pull) => pull.boss), ["The Hoardmonger", "Sentinel of Winter", "Nalorakk"]);
    assert.ok(replay.pulls.every((pull) => pull.x! >= 0 && pull.x! <= 100 && pull.y! >= 0 && pull.y! <= 100));
    assert.equal(replay.deaths[0].pull, replay.pulls.find((pull) => pull.boss === "Sentinel of Winter")!.n);
    assert.equal(replay.curve.at(-1)![1], 729);
  });

  it("rebuilds the same key from Warcraft Logs with positions, Bloodlust and output", () => {
    const replay = replayFromWarcraftLogs(wcl, "den-of-nalorakk", den.nodes, den.total, run.players.map((player) => player.name))!;
    const fromRaiderIo = replayFromRaiderIo(run, den.nodes)!;
    assert.equal(replay.source, "warcraftlogs");
    assert.deepEqual(replay.pulls.map((pull) => pull.forces), fromRaiderIo.pulls.map((pull) => pull.forces));
    assert.equal(replay.lust.length, 3);
    assert.equal(replay.fights.filter((fight) => fight.kill).length, 3);
    assert.deepEqual(replay.deaths.map((death) => [death.player, death.ability?.name]), [["Speedamn", "Raging Squall"]]);
    assert.deepEqual(new Set(replay.stats.map((stat) => stat.player)), new Set(run.players.map((player) => player.name)));
    assert.ok(replay.stats.every((stat) => (stat.dps ?? 0) > 0 && (stat.interrupts ?? 0) > 0));
    assert.equal(replay.reportUrl, "https://www.warcraftlogs.com/reports/BV19wgKxrnZ2dFj8#fight=1");
    // The first pull is in The Foraging (left half, lower part of the map).
    assert.ok(replay.pulls[0].x! < 30 && replay.pulls[0].y! > 50);
  });

  it("projects log positions only on calibrated maps", () => {
    const point = logPositionOnMap("den-of-nalorakk", 2514, 524146, 426156);
    assert.ok(point && point.x > 0 && point.x < 100 && point.y > 0 && point.y < 100);
    assert.equal(logPositionOnMap("den-of-nalorakk", 2513, 484600, 501596), undefined);
    assert.equal(logPositionOnMap("ruby-life-pools", 2094, 1, 1), undefined);
  });

  it("splits pulls on quiet gaps and folds forceless adds into the fight", () => {
    const kill = (atMs: number, forces = 5) => ({ atMs, npcId: 1, count: 1, forces });
    const groups = clusterKills([kill(1_000), kill(5_000), kill(24_000, 0), kill(40_000), kill(41_000)], []);
    assert.deepEqual(groups.map((group) => group.length), [2, 3]);
    const boss = clusterKills([kill(10_000), kill(30_000), kill(60_000)], [{ name: "Boss", startMs: 5_000, endMs: 65_000, kill: true }]);
    assert.equal(boss.length, 1);
  });

  it("uses each spawn once and follows log positions", () => {
    const nodes: MapNode[] = [
      { id: "a", npcId: 7, x: 10, y: 10, forces: 4, boss: false },
      { id: "b", npcId: 7, x: 90, y: 90, forces: 4, boss: false },
    ];
    const places = placePulls([[{ atMs: 0, npcId: 7, count: 1, forces: 4, at: { x: 88, y: 92 } }], [{ atMs: 30_000, npcId: 7, count: 1, forces: 4 }]], nodes);
    assert.deepEqual(places, [{ x: 90, y: 90 }, { x: 10, y: 10 }]);
  });

  it("has no replay for a run nobody logged", () => {
    const unlogged = toRunDetail({ ...fixture("raiderio-run-logged.json"), logged_details: null })!;
    assert.equal(unlogged.log, undefined);
    assert.equal(replayFromRaiderIo(unlogged, den.nodes), null);
  });
});
