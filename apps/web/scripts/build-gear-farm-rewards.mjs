import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Input: original client DB2 rows decoded using their exact layout hashes.
// The download/extraction proof accompanies every table. This script performs
// only a bounded relational projection; it never invents a bonus or item level.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const sourceDir = path.resolve(option("--source-dir", path.join(webRoot, "../../.artifacts/farm-scaling/cdn")));
const destination = path.resolve(option("--out", path.join(webRoot, "data/wow/gear-farm-rewards.json")));
const journalIds = new Set([1299, 1304, 1315, 1309, 1311, 1300, 1316, 1313]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parsed = new Map();
const proof = JSON.parse(await readFile(path.join(sourceDir, "provenance-70391.json"), "utf8"));
const verified = new Map(proof.verifiedTables.map((table) => [table.table, table]));
const inputNames = [
  "JournalInstance", "JournalEncounter", "JournalEncounterItem", "MapDifficulty", "LFGDungeons",
  "ItemContextPickerEntry", "ContentTuning", "ConditionalContentTuning", "ContentTuningXLabel",
  "ItemXBonusTree", "ItemBonusTree", "ItemBonusTreeNode", "ChallengeModeItemBonusOverride",
  "ItemCreationContext", "ItemCreationContextGroup", "ItemBonusList", "ItemBonusListGroupEntry",
  "ItemBonus", "ItemScalingConfig", "ItemOffsetCurve", "ItemLevelSelector",
  "ItemLevelSelectorQualitySet", "ItemLevelSelectorQuality", "ItemBonusListLevelDelta",
  "ItemSquishEra", "Curve", "CurvePoint", "RandPropPoints", "TimeEventData", "Cfg_TimeEventRegionGroup",
  "MythicPlusSeason", "DisplaySeason",
];
for (const name of inputNames) {
  const bytes = await readFile(path.join(sourceDir, `${name}-70391.json`));
  const data = JSON.parse(bytes.toString("utf8"));
  const provenance = verified.get(name);
  if (!provenance || data.inputSHA256 !== provenance.sha256 || !Array.isArray(data.rows) ||
      data.build !== "WOWSTATIC_12_1_5_70077" || data.recordCount !== data.rows.length ||
      !String(data.decoder).includes("Pallet/PalletArray ordering corrected")) {
    throw new Error(`Missing or inconsistent verified current-client table: ${name}`);
  }
  parsed.set(name, { ...data, decodedJSONSHA256: sha256(bytes), provenance });
}
const rows = (name) => parsed.get(name).rows;
const ids = (values) => new Set(values.filter((id) => Number.isSafeInteger(id) && id > 0));
const selectIds = (name, accepted, key = "ID") => rows(name).filter((row) => accepted.has(row[key]));
const tables = {};
tables.JournalInstance = selectIds("JournalInstance", journalIds);
if (tables.JournalInstance.length !== journalIds.size) throw new Error("Missing supported published dungeon");
const mapIds = ids(tables.JournalInstance.map((row) => row.MapID));
tables.JournalEncounter = selectIds("JournalEncounter", journalIds, "JournalInstanceID");
const encounterIds = ids(tables.JournalEncounter.map((row) => row.ID));
tables.JournalEncounterItem = selectIds("JournalEncounterItem", encounterIds, "JournalEncounterID");
if (!tables.JournalEncounterItem.length) throw new Error("No journal loot found");
const itemIds = ids(tables.JournalEncounterItem.map((row) => row.ItemID));
tables.MapDifficulty = rows("MapDifficulty").filter((row) => mapIds.has(row.MapID) && row.DifficultyID === 1);
if (tables.MapDifficulty.length !== mapIds.size) throw new Error("Missing supported normal map difficulty");
tables.LFGDungeons = rows("LFGDungeons").filter((row) => mapIds.has(row.MapID) && row.DifficultyID === 1);
const pickerIds = ids(tables.MapDifficulty.map((row) => row.ItemContextPickerID));
tables.ItemContextPickerEntry = selectIds("ItemContextPickerEntry", pickerIds, "ItemContextPickerID");

// Selected condition rows are verified independently of the two unavailable
// encrypted EOF frames. Their whole section and shared metadata are covered.
const conditionSource = JSON.parse(await readFile(path.join(sourceDir, "PlayerCondition-70391-selected.json"), "utf8"));
const conditionProof = JSON.parse(await readFile(path.join(sourceDir, "PlayerCondition-selected-byte-proof.json"), "utf8"));
if (conditionSource.inputSHA256 !== conditionProof.partialFileSHA256 ||
    !String(conditionSource.decoder).includes("Pallet/PalletArray ordering corrected")) {
  throw new Error("Unverified selected player-condition input");
}
const conditionIds = ids(tables.ItemContextPickerEntry.map((row) => row.PlayerConditionID));
tables.PlayerCondition = conditionSource.rows.filter((row) => conditionIds.has(row.ID));
for (const id of conditionIds) {
  const covered = conditionProof.results.find((row) => row.ID === id);
  if (!tables.PlayerCondition.some((row) => row.ID === id) || !covered?.allRequiredBytesOutsideUnknownRanges) {
    throw new Error(`Missing verified condition ${id}`);
  }
}
const tuningIds = ids([...tables.MapDifficulty.map((row) => row.ContentTuningID),
  ...tables.PlayerCondition.map((row) => row.ContentTuningID)]);
for (let changed = true; changed;) {
  changed = false;
  for (const row of rows("ConditionalContentTuning")) {
    if (tuningIds.has(row.ParentContentTuningID) && row.RedirectContentTuningID && !tuningIds.has(row.RedirectContentTuningID)) {
      tuningIds.add(row.RedirectContentTuningID); changed = true;
    }
  }
}
tables.ContentTuning = selectIds("ContentTuning", tuningIds);
tables.ConditionalContentTuning = selectIds("ConditionalContentTuning", tuningIds, "ParentContentTuningID");
tables.ContentTuningXLabel = selectIds("ContentTuningXLabel", tuningIds, "ContentTuningID");
tables.ItemXBonusTree = selectIds("ItemXBonusTree", itemIds, "ItemID");
const treeIds = ids(tables.ItemXBonusTree.map((row) => row.ItemBonusTreeID));
for (let changed = true; changed;) {
  changed = false;
  const add = (id) => { if (id > 0 && !treeIds.has(id)) { treeIds.add(id); changed = true; } };
  for (const row of rows("ItemBonusTreeNode")) if (treeIds.has(row.ParentItemBonusTreeID)) add(row.ChildItemBonusTreeID);
  for (const row of rows("ChallengeModeItemBonusOverride")) if (treeIds.has(row.SrcItemBonusTreeID)) add(row.DstItemBonusTreeID);
  if (treeIds.size > 1024) throw new Error("Reward tree closure exceeds bound");
}
tables.ItemBonusTree = selectIds("ItemBonusTree", treeIds);
tables.ItemBonusTreeNode = selectIds("ItemBonusTreeNode", treeIds, "ParentItemBonusTreeID");
tables.ChallengeModeItemBonusOverride = selectIds("ChallengeModeItemBonusOverride", treeIds, "SrcItemBonusTreeID");
const groupIds = ids(tables.ItemBonusTreeNode.map((row) => row.ItemCreationContextGroupID));
tables.ItemCreationContextGroup = selectIds("ItemCreationContextGroup", groupIds);
tables.ItemCreationContext = selectIds("ItemCreationContext", groupIds, "ItemCreationContextGroupID");
const bonusGroupIds = ids(tables.ItemBonusTreeNode.map((row) => row.ChildItemBonusListGroupID));
tables.ItemBonusListGroupEntry = rows("ItemBonusListGroupEntry").filter((row) =>
  bonusGroupIds.has(row.ItemBonusListGroupID ?? row.ParentItemBonusListGroupID));
const selectorIds = ids([...tables.ItemBonusTreeNode.map((row) => row.ChildItemLevelSelectorID),
  ...tables.ItemBonusListGroupEntry.map((row) => row.ItemLevelSelectorID)]);
tables.ItemLevelSelector = selectIds("ItemLevelSelector", selectorIds);
const qualityIds = ids(tables.ItemLevelSelector.map((row) => row.ItemLevelSelectorQualitySetID));
tables.ItemLevelSelectorQualitySet = selectIds("ItemLevelSelectorQualitySet", qualityIds);
tables.ItemLevelSelectorQuality = selectIds("ItemLevelSelectorQuality", qualityIds, "ParentILSQualitySetID");
const bonusIds = ids([...tables.ItemBonusTreeNode.map((row) => row.ChildItemBonusListID),
  ...tables.ItemBonusListGroupEntry.map((row) => row.ItemBonusListID),
  ...tables.ItemLevelSelectorQuality.map((row) => row.QualityItemBonusListID)]);
for (let changed = true; changed;) {
  changed = false;
  for (const row of rows("ItemBonus")) if (bonusIds.has(row.ParentItemBonusListID) && row.Type === 50 &&
      row.Value_0 > 0 && !bonusIds.has(row.Value_0)) { bonusIds.add(row.Value_0); changed = true; }
  if (bonusIds.size > 2048) throw new Error("Reward bonus closure exceeds bound");
}
tables.ItemBonusList = selectIds("ItemBonusList", bonusIds);
tables.ItemBonus = selectIds("ItemBonus", bonusIds, "ParentItemBonusListID");
const scalingIds = ids(tables.ItemBonus.filter((row) => [49, 51, 66, 67].includes(row.Type)).map((row) => row.Value_0));
tables.ItemScalingConfig = selectIds("ItemScalingConfig", scalingIds);
tables.ItemOffsetCurve = selectIds("ItemOffsetCurve", ids(tables.ItemScalingConfig.map((row) => row.ItemOffsetCurveID)));
tables.ItemBonusListLevelDelta = rows("ItemBonusListLevelDelta");
tables.ItemSquishEra = rows("ItemSquishEra");
const curveIds = ids([...tables.ItemOffsetCurve.map((row) => row.CurveID),
  ...tables.ItemSquishEra.map((row) => row.ItemLevelCurveID ?? row.CurveID),
  ...tables.ItemBonus.filter((row) => [48, 65, 68].includes(row.Type)).map((row) => row.Value_0)]);
tables.Curve = selectIds("Curve", curveIds);
tables.CurvePoint = selectIds("CurvePoint", curveIds, "CurveID");
// The full 1..1300 budget table is small and preserves exact float budgets for
// the native resolver audit; its values are never used to fabricate variants.
tables.RandPropPoints = rows("RandPropPoints");
tables.TimeEventData = rows("TimeEventData");
tables.Cfg_TimeEventRegionGroup = rows("Cfg_TimeEventRegionGroup");
tables.MythicPlusSeason = rows("MythicPlusSeason").filter((row) => row.ExpansionLevel === 11);
tables.DisplaySeason = rows("DisplaySeason").filter((row) => row.ExpansionID === 11);
const provenance = {};
for (const [name, data] of parsed) provenance[name] = {
  ...data.provenance, layoutHash: data.layoutHash, dbdSHA256: data.dbdSHA256,
  decodedJSONSHA256: data.decodedJSONSHA256, decoder: data.decoder,
  totalDecodedRows: data.recordCount, includedRows: tables[name]?.length ?? 0,
};
provenance.PlayerCondition = {
  coverage: "selected verified rows from unencrypted section; full content MD5 not verified",
  selectedRecordIds: [...conditionIds].sort((a,b) => a-b),
  inputSHA256: conditionSource.inputSHA256, layoutHash: conditionSource.layoutHash,
  dbdSHA256: conditionSource.dbdSHA256, decoder: conditionSource.decoder,
  source: conditionProof.source,
  byteProof: conditionProof.results.filter((row) => conditionIds.has(row.ID)),
};
const gameTables = {};
for (const name of ["CombatRatingsMultByILvl", "StaminaMultByILvl"]) {
  const bytes = await readFile(path.join(sourceDir, `${name}-70391.txt`));
  const provenanceRow = verified.get(name);
  if (!provenanceRow || sha256(bytes) !== provenanceRow.sha256) throw new Error(`Invalid game table ${name}`);
  const [header, ...lines] = bytes.toString("utf8").trim().split(/\r?\n/).map((line) => line.split("\t"));
  if (header.join("|") !== "Item Level|Armor Multiplier|Weapon Multiplier|Trinket Multiplier|Jewelry Multiplier") {
    throw new Error(`Unexpected current game-table schema: ${name}`);
  }
  gameTables[name] = lines.map((cells) => {
    if (cells.length !== header.length || cells.some((cell) => cell === "" || !Number.isFinite(Number(cell)))) {
      throw new Error(`Invalid game-table row: ${name}`);
    }
    return Object.fromEntries(header.map((field, index) => [field, Number(cells[index])]));
  });
  provenance[name] = { ...provenanceRow, includedRows: gameTables[name].length };
}
const result = {
  schemaVersion: 1, clientBuild: "12.1.5.70391", staticBuild: "12.1.5.70077",
  source: { product: "wow", observedAt: proof.observedAtUTC, buildConfig: proof.buildConfig,
    cdnConfig: proof.cdnConfig, rootContentKey: proof.rootContentKey, encodingContentKey: proof.encodingContentKey },
  scope: { journalInstanceIds: [...journalIds].sort((a,b) => a-b), difficultyIds: [1],
    itemIds: [...itemIds].sort((a,b) => a-b),
    policy: "Published supported dungeon journal loot; deterministic context/tree closure including every possible seasonal override. Unknown event and player conditions remain unknown." },
  provenance, tables, gameTables,
};
await writeFile(destination, JSON.stringify(result) + "\n");
console.log(`Wrote ${destination}: ${itemIds.size} loot items; ${treeIds.size} bonus trees; ${bonusIds.size} bonus lists`);
