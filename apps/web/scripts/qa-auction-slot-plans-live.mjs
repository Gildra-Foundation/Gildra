import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getBattleNetSimulationSnapshot } from "../lib/wow/battleNetCharacterDetails.ts";
import { auctionGearSlots } from "../lib/wow/auctionGearSelection.ts";
import { getAuctionGearSearch } from "../lib/wow/auctionGearSearchStore.ts";
import { startAuctionGearSearchFromSnapshot, continueAuctionGearSearch, verifyAuctionGearSearch, assembleAuctionGearSearch } from "../lib/wow/auctionGearRunner.ts";
import { auctionPlanCost, auctionPlanLoadout, auctionSelectionEffectKey } from "../lib/wow/auctionGearPlanner.ts";

// Trusted developer QA of actual server source. No HTTP ownership check is bypassed.
// The explicit false below applies only to this process's public character witness.
const locale = process.env.AUCTION_SLOT_QA_LOCALE ?? "en";
assert(["en", "ru"].includes(locale), "invalid_qa_locale");
assert(process.env.AUCTION_SLOT_QA_OUTPUT, "missing_qa_output");
const output = resolve(process.env.AUCTION_SLOT_QA_OUTPUT);
const startedAt = new Date().toISOString();
const signal = AbortSignal.timeout(30 * 60_000);
const owner = `trusted-live-auction-slots-${locale}`;
let tokenForRedaction = "";
const budgetCopper = 10_000 * 10_000;
const hashes = {}, variantProof = [], nativeProof = [], equipmentProof = [], itemProof = [], presetProof = [];
const sha = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const save = async (name, value) => {
  const text = JSON.stringify(value, null, 2) + "\n";
  await writeFile(resolve(output, name), text, { mode: 0o600, flag: "wx" });
  hashes[name] = `sha256:${sha(text)}`;
};
const upstreamFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  const response = await upstreamFetch(input, init);
  if (url.pathname === "/v1/wow/gear/variants" && response.ok) {
    variantProof.push({ request: JSON.parse(init.body), response: await response.clone().json() });
  } else if (url.pathname === "/v1/wow/rotation/simulations" && response.ok) {
    const body = JSON.parse(init.body);
    nativeProof.push({ requestSHA256: `sha256:${sha(init.body)}`, request: {
      spec: body.spec, scenario: body.scenario, fightLengthSeconds: body.fightLengthSeconds, targets: body.targets,
      ruleCount: body.rules?.length, rulesSHA256: `sha256:${sha(body.rules)}`, gearChanges: body.gearChanges ?? [],
    }, engineHeader: response.headers.get("x-gildra-engine"), response: await response.clone().json() });
  } else if (url.pathname === "/v1/wow/rotation/fury-warrior" && response.ok) {
    const body = await response.clone().json();
    presetProof.push({ locale: url.searchParams.get("locale"), status: response.status,
      ruleCount: body.defaultRules?.length, rulesSHA256: `sha256:${sha(body.defaultRules)}` });
  } else if (url.hostname.endsWith(".api.blizzard.com") && /\/profile\/wow\/character\/[^/]+\/[^/]+\/equipment$/.test(url.pathname) && response.ok) {
    const body = await response.clone().json();
    equipmentProof.push({ locale: url.searchParams.get("locale"), sha256: `sha256:${sha(body)}`, characterId: body.character?.id,
      items: body.equipped_items?.map(item => ({ itemId: item.item?.id, slotType: item.slot?.type, name: item.name,
        itemLevel: item.level?.value, contextId: item.context ?? 0, bonusIds: item.bonus_list ?? [], stats: item.stats })) });
  } else if (url.hostname.endsWith(".api.blizzard.com") && /^\/data\/wow\/item\/\d+$/.test(url.pathname) && response.ok) {
    const body = await response.clone().json();
    itemProof.push({ locale: url.searchParams.get("locale"), response: body });
  }
  return response;
};
async function flushProofs() {
  for (const [name, value] of [["native-variant-proof.json", variantProof], ["native-simulation-proof.json", nativeProof],
    ["official-item-proof.json", itemProof], ["official-equipment-proof.json", equipmentProof], ["maintained-preset-proof.json", presetProof]]) {
    if (!Object.hasOwn(hashes, name)) await save(name, value);
  }
}

const input = selectedSlots => ({ characterSlug: "eu--eversong--элкардия", budgetCopper, scenario: "single-target", locale, selectedSlots });
const progress = stage => value => console.log(JSON.stringify({ stage, progress: value }));
const getEntry = result => {
  const entry = getAuctionGearSearch(owner, result.searchId);
  assert(entry, "private_search_missing");
  assert.equal(getAuctionGearSearch(owner + "-other", result.searchId), null, "private_search_cross_owner");
  return entry;
};
function assertSearch(result, entry) {
  assert.equal(result.kind, "search");
  assert.equal(result.items.length, entry.context.options.length, "found_pool_truncated");
  assert.equal(new Set(result.items.map(item => item.optionId)).size, result.items.length);
  for (const item of result.items) {
    assert(result.selectedSlots.includes(item.slotType), "unselected_search_slot");
    assert(item.lotCostCopper > 0 && item.lotCostCopper <= budgetCopper, "invalid_found_cost");
    assert(item.iconUrl && item.currentItem?.iconUrl, "missing_item_icons");
    assert.equal(item.currentItem.slotType, item.slotType);
    const option = entry.context.options.find(option => option.id === item.optionId);
    const variant = option.candidate.variants.find(variant => variant.key === option.variantKey);
    assert.deepEqual(item.stats, variant.resolution?.stats, "stats_not_native_variant");
    assert.equal(item.itemLevel, variant.itemLevel);
    assert.equal(item.requiredLevel, option.candidate.constraints.requiredLevel);
    assert.equal(variant.resolution?.engine, result.engine, "variant_engine_changed");
    if (item.evaluation === "upgrade") assert(item.comparison.deltaDps > 0 && item.comparison.uncertainty.significant);
  }
}
async function completeSearch(label, selectedSlots, token, character, armory) {
  let result = await startAuctionGearSearchFromSnapshot(input(selectedSlots), character, armory, owner, token, signal, progress(label));
  const entry = getEntry(result);
  let chunks = 0;
  for (;;) {
    assertSearch(result, entry);
    await save(`${label}-search-${String(chunks).padStart(3, "0")}.json`, result);
    await save(`${label}-search-checkpoint-${String(chunks).padStart(3, "0")}.json`, entry.searchCheckpoint);
    console.log(JSON.stringify({ stage: label, searchChunk: chunks, complete: result.searchComplete, items: result.items.length,
      pendingItems: result.pendingItems, simulations: result.simulations,
      rowsBySlot: Object.fromEntries(selectedSlots.map(slot => [slot, result.items.filter(item => item.slotType === slot).length])),
      effectsBySlot: Object.fromEntries(selectedSlots.map(slot => [slot, new Set(result.items.filter(item => item.slotType === slot).map(item => item.variantKey)).size])) }));
    if (result.searchComplete) break;
    assert(++chunks < 100, "live_search_chunk_limit");
    await verifyAuctionGearSearch(entry, token, signal, false);
    result = await continueAuctionGearSearch(entry, signal, progress(label));
  }
  assert.equal(result.pendingItems, 0);
  return { result, entry, chunks: chunks + 1 };
}
function assertAssembly(result, entry, allowedIds) {
  assert.equal(result.kind, "assembly");
  assert.equal(result.budgetCopper, budgetCopper);
  assert(result.spentCopper <= budgetCopper && result.spentCopper >= 0, "assembly_budget_exceeded");
  assert.equal(result.remainingCopper, budgetCopper - result.spentCopper);
  const selected = result.purchases.map(purchase => {
    const id = `${purchase.auctionId}:${purchase.slotType}:${purchase.variantKey}`;
    assert(allowedIds.includes(id), "excluded_option_selected");
    assert(result.selectedSlots.includes(purchase.slotType), "locked_slot_changed");
    assert(purchase.iconUrl && purchase.currentItem?.iconUrl, "missing_purchase_icons");
    return entry.context.options.find(option => option.id === id);
  });
  assert.equal(auctionPlanCost(selected), result.spentCopper, "lot_double_charged");
  const final = auctionPlanLoadout(entry.context.loadout, selected, entry.context.specId, result.selectedSlots);
  for (const item of entry.context.loadout.filter(item => !result.selectedSlots.includes(item.slotType))) {
    assert.deepEqual(final.find(current => current.slotType === item.slotType), item, "locked_slot_changed");
  }
}
async function completeAssembly(label, entry, allowedIds, token) {
  let result, chunks = 0;
  do {
    await verifyAuctionGearSearch(entry, token, signal, false);
    result = await assembleAuctionGearSearch(entry, allowedIds, signal, progress(label));
    assertAssembly(result, entry, allowedIds);
    await save(`${label}-assembly-${String(chunks).padStart(3, "0")}.json`, result);
    await save(`${label}-assembly-checkpoint-${String(chunks).padStart(3, "0")}.json`, entry.assemblyCheckpoint);
    console.log(JSON.stringify({ stage: label, assemblyChunk: chunks, complete: result.exhaustiveComplete,
      combinationsChecked: result.combinationsChecked, combinationCount: result.combinationCount, simulations: result.simulations }));
    assert(++chunks < 200, "live_assembly_chunk_limit");
  } while (!result.exhaustiveComplete);
  return { result, chunks, oracle: proveNativeMaximum(entry, allowedIds, result) };
}

/** Independent recursion over the real pool, using actual native results already recorded by production code. */
function proveNativeMaximum(entry, allowedIds, result) {
  const choices = entry.context.input.selectedSlots.map(slot => [null, ...entry.context.options.filter(option => option.candidate.slotType === slot && allowedIds.includes(option.id))]);
  let assignments = 0, valid = 0, overBudget = 0, incompatible = 0;
  let bestDps = entry.searchCheckpoint.baseline.dps, bestCost = 0;
  const cache = entry.assemblyCheckpoint.simulationCache;
  const visit = (depth, selected) => {
    if (depth < choices.length) {
      for (const option of choices[depth]) visit(depth + 1, option ? [...selected, option] : selected);
      return;
    }
    assignments++;
    let cost;
    try { cost = auctionPlanCost(selected); } catch { incompatible++; return; }
    if (cost > budgetCopper) { overBudget++; return; }
    try { auctionPlanLoadout(entry.context.loadout, selected, entry.context.specId, entry.context.input.selectedSlots); }
    catch { incompatible++; return; }
    valid++;
    const measured = cache[auctionSelectionEffectKey(selected)];
    assert(measured, "exhaustive_result_missing_native_effect");
    assert.equal(measured.engine, result.engine);
    if (measured.dps > bestDps || measured.dps === bestDps && cost < bestCost) { bestDps = measured.dps; bestCost = cost; }
  };
  visit(0, []);
  assert.equal(String(assignments), result.combinationCount, "oracle_domain_mismatch");
  assert.equal(bestDps, result.comparison.candidateDps, "not_maximum_measured_dps");
  assert.equal(bestCost, result.spentCopper, "not_cheapest_maximum");
  return { independentRecursion: true, assignments, valid, overBudget, incompatible, bestDps, bestCostCopper: bestCost };
}

function mechanics(armory) {
  const value = { level: armory.profile.level, classId: armory.profile.character_class?.id,
    specId: armory.activeSpecializationId, talentLoadout: armory.activeTalentLoadout,
    equipment: armory.equipment.equipped_items.map(item => ({ itemId: item.item.id, slotType: item.slot.type,
      itemLevel: item.level?.value, contextId: item.context ?? 0, bonusIds: [...(item.bonus_list ?? [])].sort((a, b) => a - b),
      modifiers: item.modifiers ?? [], stats: (item.stats ?? []).map(stat => ({ type: stat.type.type, value: stat.value, negated: stat.is_negated === true })).sort((a, b) => a.type.localeCompare(b.type)),
      armor: item.armor?.value, enchantments: item.enchantments?.map(enchant => enchant.enchantment_id),
    })).sort((a, b) => a.slotType.localeCompare(b.slotType)) };
  return { ...value, sha256: `sha256:${sha(value)}` };
}

async function localizedCandidateNames(result, token) {
  if (locale !== "ru") return { locale, source: "published English catalog", checked: result.items.length };
  const names = new Map();
  for (const item of result.items) names.set(item.itemId, [...(names.get(item.itemId) ?? []), item.name]);
  const ids = [...names.keys()], mismatches = [];
  let exactMatches = 0, translatedItems = 0;
  for (let offset = 0; offset < ids.length; offset += 4) await Promise.all(ids.slice(offset, offset + 4).map(async id => {
    const response = await fetch(`https://eu.api.blizzard.com/data/wow/item/${id}?namespace=static-eu&locale=ru_RU`,
      { headers: { Authorization: `Bearer ${token}` }, signal });
    assert.equal(response.status, 200, "localized_item_control_unavailable");
    const official = await response.json();
    assert.equal(official.id, id, "localized_item_control_mismatch");
    if (/[А-Яа-яЁё]/.test(official.name)) {
      assert(names.get(id).every(name => /[А-Яа-яЁё]/.test(name)), "candidate_name_english_fallback");
      translatedItems++;
    }
    if (names.get(id).every(name => name === official.name)) exactMatches++;
    else mismatches.push({ itemId: id, publishedNames: [...new Set(names.get(id))], officialName: official.name });
  }));
  return { locale, source: "Published Russian catalog with fresh official Russian item-name controls", checkedItems: ids.length, translatedItems, exactMatches, mismatches };
}

try {
  const auth = await fetch("https://oauth.battle.net/token", { method: "POST", headers: {
    Authorization: `Basic ${Buffer.from(`${process.env.BATTLENET_CLIENT_ID}:${process.env.BATTLENET_CLIENT_SECRET}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  }, body: "grant_type=client_credentials", signal });
  assert.equal(auth.status, 200, "oauth_unavailable");
  const token = (await auth.json()).access_token;
  tokenForRedaction = token;
  const profileResponse = await fetch(`https://eu.api.blizzard.com/profile/wow/character/eversong/${encodeURIComponent("элкардия")}?namespace=profile-eu&locale=en_GB`,
    { headers: { Authorization: `Bearer ${token}` }, signal });
  assert.equal(profileResponse.status, 200, "profile_unavailable");
  const profile = await profileResponse.json();
  const character = { id: profile.id, name: profile.name, level: profile.level, realm: profile.realm,
    playableClass: profile.character_class, playableRace: profile.race, faction: profile.faction, region: "eu", accountId: 0, armoryUrl: "" };
  const armory = await getBattleNetSimulationSnapshot(token, character);
  assert.equal(character.level, 81, "character_level_changed");
  assert.equal(armory.activeSpecializationId, 72, "character_specialization_changed");
  await save("character-mechanics.json", mechanics(armory));
  const full = await completeSearch("all-slots", [...auctionGearSlots], token, character, armory);
  assert(full.result.items.length > 28, "live_pool_not_beyond_old_cap");
  assert.deepEqual(full.result.selectedSlots.slice().sort(), [...auctionGearSlots].sort());
  const focused = await completeSearch("focused", ["HEAD", "WRIST"], token, character, armory);
  assert(focused.result.items.some(item => item.slotType === "HEAD") && focused.result.items.some(item => item.slotType === "WRIST"), "focused_real_slots_empty");
  const allowedIds = focused.result.items.map(item => item.optionId);
  await save("focused-native-domain.json", { options: focused.entry.context.options, loadout: focused.entry.context.loadout,
    selectedSlots: focused.entry.context.input.selectedSlots, specId: focused.entry.context.specId, budgetCopper });
  const assembled = await completeAssembly("focused-full-pool", focused.entry, allowedIds, token);
  assert(assembled.result.purchases.length && assembled.result.comparison.deltaDps > 0, "focused_improvement_missing");
  const first = assembled.result.purchases[0];
  const excludedId = `${first.auctionId}:${first.slotType}:${first.variantKey}`;
  const alternatives = allowedIds.filter(id => id !== excludedId);
  assert(alternatives.length, "no_real_exclusion_alternative");
  const alternative = await completeAssembly("focused-excluded", focused.entry, alternatives, token);
  assert(alternative.result.comparison.candidateDps <= assembled.result.comparison.candidateDps, "subset_exceeded_superset_maximum");
  const localized = equipmentProof.filter(proof => proof.locale === (locale === "ru" ? "ru_RU" : "en_GB")).at(-1);
  assert(localized, "official_equipment_localization_missing");
  const currentNames = new Map(localized.items.map(item => [item.slotType, item.name]));
  assert(full.result.items.every(item => item.currentItem.name === currentNames.get(item.slotType)), "equipped_name_not_official_locale");
  const nameProof = await localizedCandidateNames(full.result, token);
  assert(presetProof.length && nativeProof.length, "native_or_preset_proof_missing");
  assert(nativeProof.every(proof => proof.engineHeader === "simulationcraft" && presetProof.some(preset => preset.rulesSHA256 === proof.request.rulesSHA256)), "native_not_maintained_preset");
  const summary = { status: "verified", startedAt, verifiedAt: new Date().toISOString(), locale,
    character: { id: character.id, name: character.name, level: character.level, specId: armory.activeSpecializationId },
    method: "Trusted host source with public Blizzard snapshot and actual API/native worker; actual deployed image identities recorded separately",
    authenticatedBrowserJob: false, executedInsideWebContainer: false, engine: full.result.engine,
    mechanicsSHA256: mechanics(armory).sha256, market: full.result.market,
    allSlots: { selectedSlots: full.result.selectedSlots, rows: full.result.items.length, upgrades: full.result.items.filter(item => item.evaluation === "upgrade").length,
      evaluations: Object.fromEntries([...new Set(full.result.items.map(item => item.evaluation))].map(evaluation => [evaluation, full.result.items.filter(item => item.evaluation === evaluation).length])),
      chunks: full.chunks, searchComplete: full.result.searchComplete, simulations: full.result.simulations,
      rewardIcons: full.result.items.filter(item => item.iconUrl).length, currentIcons: full.result.items.filter(item => item.currentItem?.iconUrl).length,
      localizedCurrentNamesVerified: true, localizedCandidateNames: nameProof, coverage: full.result.coverage, searchLimited: full.result.searchLimited },
    focused: { selectedSlots: focused.result.selectedSlots, rows: focused.result.items.length, searchChunks: focused.chunks,
      assemblyChunks: assembled.chunks, result: assembled.result, oracle: assembled.oracle },
    exclusion: { excludedOptionId: excludedId, allowedOptions: alternatives.length, assemblyChunks: alternative.chunks,
      result: alternative.result, oracle: alternative.oracle },
    fullSixteenSlotAssemblyAttempted: false,
    scope: "Full retained 16-slot search; exhaustive assembly proven over every found HEAD/WRIST option, plus one explicit user exclusion. No market-wide or full16-assembly maximum claim.",
    evidence: hashes };
  await flushProofs();
  await save("summary.json", summary);
  console.log(JSON.stringify({ status: "verified", locale, allSlotRows: summary.allSlots.rows, searchChunks: summary.allSlots.chunks,
    focusedRows: summary.focused.rows, focusedAssemblyComplete: assembled.result.exhaustiveComplete,
    budgetCopper, spentCopper: assembled.result.spentCopper, comparison: assembled.result.comparison }));
} catch (error) {
  await flushProofs();
  const message = error instanceof Error ? error.message : "";
  let sanitizedMessage = message;
  for (const secret of [tokenForRedaction, process.env.BATTLENET_CLIENT_ID, process.env.BATTLENET_CLIENT_SECRET]) {
    if (secret) sanitizedMessage = sanitizedMessage.replaceAll(secret, "[redacted]");
  }
  sanitizedMessage = sanitizedMessage.replace(/(?:Bearer|Basic)\s+[^\s"']+/gi, "[redacted authorization]")
    .replace(/([?&](?:access_token|token|client_secret)=)[^&\s]+/gi, "$1[redacted]").slice(0, 500);
  await save("failure.json", { status: "failed", startedAt, failedAt: new Date().toISOString(), locale,
    error: /^[a-z_]{3,100}$/.test(message) ? message : "live_qa_assertion_or_upstream_failure", name: error?.name,
    sanitizedMessage, sourceFrames: String(error?.stack ?? "").split("\n").filter(line => /^\s+at /.test(line) && line.includes("/apps/web/")).slice(0, 8),
    evidence: hashes, rawHeadersPersisted: false, secretsPersisted: false });
  console.log(JSON.stringify({ status: "failed", locale, error: /^[a-z_]{3,100}$/.test(message) ? message : "live_qa_assertion_or_upstream_failure" }));
  process.exitCode = 1;
}
