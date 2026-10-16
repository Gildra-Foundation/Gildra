import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAuctionGearRecommendations } from "../lib/wow/auctionGearRecommendations.ts";
import { assembleAuctionGear, auctionSelectionEffectKey } from "../lib/wow/auctionGearPlanner.ts";
import { auctionGearSlots } from "../lib/wow/auctionGearSelection.ts";

// These small guard cases are synthetic offline inputs, never market evidence.
const positive = { optionId: "synthetic-positive", evaluation: "upgrade", lotCostCopper: 10,
  stats: { strength: 1 }, comparison: { deltaDps: 10, uncertainty: { significant: true } } };
const otherLot = { ...positive, optionId: "synthetic-other-lot", lotCostCopper: 20 };
const rejected = [
  { ...positive, optionId: "negative", comparison: { deltaDps: -1, uncertainty: { significant: true } } },
  { ...positive, optionId: "zero", comparison: { deltaDps: 0, uncertainty: { significant: true } } },
  { ...positive, optionId: "uncertain", comparison: { deltaDps: 10, uncertainty: { significant: false } } },
  { ...positive, optionId: "truthy-not-true", comparison: { deltaDps: 10, uncertainty: { significant: 1 } } },
  { ...positive, optionId: "pending", evaluation: "pending", comparison: null },
  ...["not_upgrade", "inconclusive", "requires_combination"].map(evaluation => ({ ...positive, optionId: evaluation, evaluation })),
  { ...positive, optionId: "missing-comparison", comparison: null },
];
const synthetic = Object.freeze([Object.freeze(positive), ...rejected.map(Object.freeze), Object.freeze(otherLot)]);
const beforeSynthetic = structuredClone(synthetic);
const filtered = getAuctionGearRecommendations(synthetic);
assert.deepEqual(filtered, [positive, otherLot]);
assert.notEqual(filtered, synthetic);
assert.equal(filtered[0], positive);
assert.equal(filtered[1], otherLot);
assert.deepEqual(synthetic, beforeSynthetic);
assert.deepEqual(getAuctionGearRecommendations([]), []);
assert.deepEqual(getAuctionGearRecommendations(rejected), []);
console.log("PASS: offline synthetic recommendation guards, both positive financial choices and unchanged input objects.");

// Real replay is explicit and must fail if any requested evidence is missing.
// The ignored source snapshots are deliberately not bundled as pretend fresh data.
const proofRoot = process.env.AUCTION_RECOMMENDATIONS_PROOF_ROOT;
if (proofRoot) {
  const expectedIds = [
    "1071542782:WRIST:auction:73593c23ac5e7a3f20396c3188d48012",
    "1071542809:WRIST:auction:73593c23ac5e7a3f20396c3188d48012",
    "1071542840:WRIST:auction:73593c23ac5e7a3f20396c3188d48012",
    "1071542874:WRIST:auction:73593c23ac5e7a3f20396c3188d48012",
    "1071542906:WRIST:auction:d607351e50fa410bd25c4ae14789c6fe",
    "1071542933:WRIST:auction:d607351e50fa410bd25c4ae14789c6fe",
    "1071542967:WRIST:auction:d607351e50fa410bd25c4ae14789c6fe",
    "1071542985:WRIST:auction:d607351e50fa410bd25c4ae14789c6fe",
    "1071543012:WRIST:auction:d607351e50fa410bd25c4ae14789c6fe",
    "1072592796:WRIST:auction:f0daf471c5c8e9ca6f136ce77f98ac01",
  ];
  const sha = value => "sha256:" + createHash("sha256").update(value).digest("hex");
  const evidence = {};
  async function readEvidence(name) {
    const bytes = await readFile(resolve(proofRoot, name));
    evidence[name] = sha(bytes);
    return JSON.parse(bytes.toString());
  }
  const source = await readEvidence("summary.json");
  assert.equal(source.status, "verified");
  const search = await readEvidence("all-slots-search-002.json");
  const checkpoint = await readEvidence("all-slots-search-checkpoint-002.json");
  const domain = await readEvidence("focused-native-domain.json");
  assert.equal(search.items.length, 608);
  assert.equal(search.searchComplete, true);
  assert.equal(search.pendingItems, 0);
  assert.deepEqual([...search.selectedSlots].sort(), [...auctionGearSlots].sort());
  for (const [name, digest] of Object.entries(evidence)) {
    if (source.evidence[name]) assert.equal(digest, source.evidence[name], `source_evidence_changed:${name}`);
  }
  const original = structuredClone(search.items);
  const recommended = getAuctionGearRecommendations(search.items);
  assert.deepEqual(recommended.map(item => item.optionId), expectedIds);
  assert.equal(new Set(recommended.map(item => item.variantKey)).size, 3);
  for (const item of recommended) {
    assert.equal(item, search.items.find(current => current.optionId === item.optionId));
    assert(item.comparison.deltaDps > 0 && item.comparison.uncertainty.significant === true);
    assert.equal(item.evaluation, "upgrade");
  }
  assert.deepEqual(search.items, original, "recommendations_mutated_native_stats_prices_or_ids");
  const options = domain.options.filter(option => expectedIds.includes(option.id));
  assert.equal(options.length, 10, "missing_real_option");
  for (const option of options) {
    const row = recommended.find(item => item.optionId === option.id);
    const variant = option.candidate.variants.find(item => item.key === option.variantKey);
    assert.equal(option.costCopper, row.lotCostCopper);
    assert.equal(option.quantity, row.quantity);
    assert.equal(option.auctionId, row.auctionId);
    assert.deepEqual(variant.resolution.stats, row.stats);
    assert.equal(variant.itemLevel, row.itemLevel);
    assert(checkpoint.simulationCache[auctionSelectionEffectKey([option])]);
  }
  // Replay uses the recorded verification time, preserving the actual market
  // timestamp and never claiming yesterday's snapshot is current market data.
  const originalNow = Date.now;
  Date.now = () => Date.parse(source.verifiedAt);
  let assembly, exclusion;
  try {
    const common = { searchId: search.searchId, budgetCopper: search.budgetCopper, options,
      selectedSlots: [...auctionGearSlots], loadout: domain.loadout, specId: domain.specId,
      market: { sourceUpdatedAt: source.market.updatedAt }, signal: new AbortController().signal,
      baseline: checkpoint.baseline, simulationCache: checkpoint.simulationCache,
      simulate: async () => { throw new Error("Unexpected native/API request in offline saved-result replay"); } };
    assembly = await assembleAuctionGear(common);
    const bestId = assembly.result.purchases.map(item => `${item.auctionId}:${item.slotType}:${item.variantKey}`)[0];
    assert.equal(bestId, expectedIds[0]);
    exclusion = await assembleAuctionGear({ ...common, options: options.filter(option => option.id !== bestId) });
  } finally {
    Date.now = originalNow;
  }
  for (const [result, count] of [[assembly.result, 11], [exclusion.result, 10]]) {
    assert.equal(result.exhaustiveComplete, true);
    assert.equal(result.combinationCount, String(count));
    assert.equal(result.combinationsChecked, count);
    assert.equal(result.validCombinations, count);
    assert.equal(result.simulations, 0);
    assert.equal(result.spentCopper, 150_000);
    assert.equal(result.comparison.baselineDps, 14273);
    assert.equal(result.comparison.candidateDps, 14645);
    assert.equal(result.comparison.deltaDps, 372);
    assert.equal(result.comparison.uncertainty.significant, true);
    assert.equal(result.purchases.length, 1);
    assert(result.purchases.every(item => expectedIds.includes(`${item.auctionId}:${item.slotType}:${item.variantKey}`)));
  }
  assert.notEqual(exclusion.result.purchases[0].auctionId, assembly.result.purchases[0].auctionId);
  assert.deepEqual(search.items, original);
  const proof = { status: "verified", mode: "offline replay of saved real public market/native results",
    locale: source.locale, sourceVerifiedAt: source.verifiedAt, originalMarket: source.market,
    syntheticGuardCases: synthetic.length, rawRows: 608, confirmedPositiveLots: recommended.length,
    recommendationIds: expectedIds, selectedSlots: [...auctionGearSlots],
    assembly: assembly.result, excludedOptionIds: [expectedIds[0]], exclusion: exclusion.result,
    nativeRequests: 0, apiRequests: 0, originalStatsPricesAndInputsPreserved: true, evidence };
  if (process.env.AUCTION_RECOMMENDATIONS_OUTPUT) await writeFile(resolve(process.env.AUCTION_RECOMMENDATIONS_OUTPUT),
    JSON.stringify(proof, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(`PASS: saved real ${source.locale} 608 rows → 10 positive lots; all 16 slots, 11 exact assignments; exclusion 10; 15 gold / +372 DPS; zero network/native requests.`);
}
