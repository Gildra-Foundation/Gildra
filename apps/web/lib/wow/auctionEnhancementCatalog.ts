import { professionEligibility, type CharacterProfessions } from "./characterProfessions";
import snapshot from "../../data/wow/auction-enhancements/catalog.json" with { type: "json" };

type Payload = Record<string, string>;
type Row = { table: string; id: number; artifactId: string | null; payload: Payload };
export type Enhancement = {
  key: string; kind: "gem" | "enchant"; consumableItemId: number; simulationId: number;
  profession?: { id: number; rank: number }; category?: { id: number; limit: number };
};
export type EnhancementRecord = Enhancement & {
  /** Verified en_US ItemSparse display name; absent for installed-only native records. */
  name?: string;
  /** Explicit later authoritative mapping, only with generator-verified engine-chain parity. */
  mappingBuild?: string;
  build: string; revision: string; requiredLevel: number; qualityId: number; rank: number | null;
  minItemLevel: number; maxItemLevel: number; gemPropertiesId?: number; color?: number;
  itemClassId?: number; inventoryMask?: number; subclassMask?: number;
  requiredFaction?: "HORDE" | "ALLIANCE";
  requiresNoOnUseEffect?: true;
  categoryKnown: boolean; restrictionReason?: string; uniqueEquipped: boolean;
  sourceRowIds: string[];
};
export type EnhancementTarget = {
  itemId: number; inventoryType: number; itemClassId: number; itemSubclassId: number;
  itemLevel: number; socketColors: readonly number[]; build: string; revision: string;
  engine: string; hasOnUseEffect?: boolean;
};
export type EnhancementCharacter = { level: number; faction?: string; professions?: CharacterProfessions | readonly { id: number; rank: number }[] };
type CoverageGap = "no_supported_enchant" | "no_supported_gem" | "profession_unverified" | "faction_unverified" | "target_effects_unverified";
export type EnhancementResolution = { verified: false; reason: string } | {
  verified: true; enchantApplicable: boolean; enchantChoices: EnhancementRecord[]; gemChoices: Record<string, EnhancementRecord[]>;
  coverageGaps?: CoverageGap[];
};

const rows = snapshot.rows as Row[];
const table = (name: string) => rows.filter(r => r.table === name);
const index = (name: string) => new Map(table(name).map(r => [r.id, r]));
const num = (p: Payload, key: string) => p[key] !== undefined && /^-?\d+$/.test(p[key]) ? Number(p[key]) : NaN;
const item = index("Item"), gem = index("GemProperties"), enchant = index("SpellItemEnchantment"), category = index("ItemLimitCategory");
const effects = index("ItemEffect");
const ref = (r: Row) => `${r.table}:${r.id}`;

function record(sparse: Row, enchantRow: Row, kind: "gem" | "enchant", chain: Row[], color?: number): EnhancementRecord {
  const s = sparse.payload, e = enchantRow.payload, categoryId = num(s, "LimitCategory");
  const c = category.get(categoryId), skill = num(e, "RequiredSkillID") || num(s, "RequiredSkill");
  const skillRank = Math.max(num(e, "RequiredSkillRank"), num(s, "RequiredSkillRank"));
  const categoryKnown = categoryId === 0 || Boolean(c && num(c.payload, "Flags") === 1 && num(c.payload, "Quantity") > 0);
  const flags = num(s, "Flags_1"), factionBits = flags & 3;
  const special = !Number.isSafeInteger(flags) || factionBits === 3 ||
    ["RequiredAbility", "RequiredHoliday", "RequiredPVPRank", "RequiredPVPMedal", "MinFactionID", "MinReputation", "ZoneBound_0", "ZoneBound_1", "InstanceBound"].some(k => num(s,k) !== 0)
    || num(s,"AllowableClass") !== -1 || num(s,"AllowableRaces_0") !== -1 || num(s,"AllowableRaces_1") !== -1
    || num(e,"Condition_ID") !== 0 || num(e,"TransmogUseConditionID") !== 0
    || !Number.isFinite(skill) || !Number.isFinite(skillRank)
    || (num(e,"RequiredSkillID") > 0 && num(s,"RequiredSkill") > 0 && num(e,"RequiredSkillID") !== num(s,"RequiredSkill"));
  return {
    key: `${kind}:${sparse.id}:${enchantRow.id}`, kind, consumableItemId: sparse.id,
    ...(s.Display_lang?.trim() ? {name:s.Display_lang} : {}),
    simulationId: kind === "gem" ? sparse.id : enchantRow.id,
    build: snapshot.build, revision: snapshot.revision, requiredLevel: num(s,"RequiredLevel"),
    qualityId: item.get(sparse.id) ? num(item.get(sparse.id)!.payload,"CraftingQualityID") : 0,
    rank: null,
    minItemLevel: num(e,"ItemLevelMin"), maxItemLevel: num(e,"ItemLevelMax"),
    ...(factionBits === 1 ? {requiredFaction:"HORDE" as const} : factionBits === 2 ? {requiredFaction:"ALLIANCE" as const} : {}),
    ...(kind === "enchant" && [0,1,2].some(i=>num(e,`Effect_${i}`)===7) ? {requiresNoOnUseEffect:true} : {}),
    ...(skill > 0 ? {profession:{id:skill, rank:skillRank}} : {}),
    ...(c && categoryKnown ? {category:{id:categoryId,limit:num(c.payload,"Quantity")}} : {}),
    categoryKnown, uniqueEquipped: (num(s,"Flags_0") & 0x80000) !== 0,
    ...(special ? {restrictionReason:"unsupported_condition"} : {}),
    ...(kind === "gem" ? {gemPropertiesId:num(s,"Gem_properties"),color} : {}),
    sourceRowIds: [sparse,...chain,enchantRow,...(c?[c]:[])].map(ref),
  };
}

function buildRecords(): EnhancementRecord[] {
  function groupByField(name: string, field: string) {
    const groups = new Map<number, Row[]>();
    for (const row of table(name)) {
      const id = num(row.payload, field);
      const group = groups.get(id);
      if (group) group.push(row);
      else groups.set(id, [row]);
    }
    return groups;
  }
  const linksByItem = groupByField("ItemXItemEffect", "ItemID");
  const effectsBySpell = groupByField("SpellEffect", "SpellID");
  const requirementsBySpell = groupByField("SpellEquippedItems", "SpellID");
  const result: EnhancementRecord[] = [];
  for (const sparse of table("ItemSparse")) {
    if (![0,2,3].includes(num(sparse.payload,"Bonding"))) continue;
    const classId = num(item.get(sparse.id)?.payload ?? {}, "ClassID");
    const g = gem.get(num(sparse.payload,"Gem_properties"));
    if (g) {
      const e = enchant.get(num(g.payload,"Enchant_ID"));
      if (classId===3 && num(g.payload,"Type")===14 && e) result.push(record(sparse,e,"gem",[g],num(g.payload,"Type")));
      continue;
    }
    const links = linksByItem.get(sparse.id) ?? [];
    if (![0,8].includes(classId) || links.length !== 1) continue;
    for (const link of links) {
      const effect = effects.get(num(link.payload,"ItemEffectID"));
      if (!effect || num(effect.payload,"Charges")!==-1 || num(effect.payload,"TriggerType")!==0 || num(effect.payload,"PlayerConditionID")!==0 || num(effect.payload,"ChrSpecializationID")!==0) continue;
      const spellId = num(effect.payload,"SpellID");
      const spellEffects = (effectsBySpell.get(spellId) ?? []).filter(r=>num(r.payload,"DifficultyID")===0);
      const applying = spellEffects.filter(r=>[53,301].includes(num(r.payload,"Effect")));
      const equipped = requirementsBySpell.get(spellId) ?? [];
      if (applying.length!==1 || equipped.length!==1) continue;
      const ranked = num(applying[0].payload,"Effect")===301;
      let enchantId=num(applying[0].payload,"EffectMiscValue_0");
      let mapping: Row | undefined;
      if (ranked) {
        const mappings=(snapshot.rankedMappings as Row[]).filter(q=>num(q.payload,"ItemID")===sparse.id
          && num(q.payload,"CraftingDataID")===enchantId
          && num(q.payload,"Rank")===num(item.get(sparse.id)?.payload??{},"CraftingQualityID"));
        if (mappings.length!==1) continue;
        mapping=mappings[0];
        if (!snapshot.rankedCompatibilityProofs.some(p=>p.itemId===sparse.id && p.qualityRowId===mapping!.id
          && p.sourceBuild===snapshot.rankedMappingSourceBuild && p.engineBuild===snapshot.build
          && p.semanticRowsetVersion===1)) continue;
        enchantId=num(mapping.payload,"SpellItemEnchantmentID");
      }
      const e = enchant.get(enchantId);
      if (!e) continue;
      const r = record(sparse,e,"enchant",[link,effect,applying[0],equipped[0]]);
      r.itemClassId=num(equipped[0].payload,"EquippedItemClass");
      r.inventoryMask=num(equipped[0].payload,"EquippedItemInvTypes");
      r.subclassMask=num(equipped[0].payload,"EquippedItemSubclass");
      const native = snapshot.nativeRules.filter(n => n.enchantId === enchantId && n.itemClassId === r.itemClassId
        && n.inventoryMask === r.inventoryMask && n.subclassMask === r.subclassMask);
      if (!native.length || native.some(n => n.rank !== native[0].rank)) continue;
      r.rank = native[0].rank;
      if (ranked) {
        r.mappingBuild=snapshot.rankedMappingSourceBuild;
        r.sourceRowIds.push(`CraftingData:${num(applying[0].payload,"EffectMiscValue_0")}`,
          `CraftingDataEnchantQuality@${r.mappingBuild}:${mapping!.id}`);
      }
      if (spellEffects.some(x=>num(x.payload,"Effect")!==(ranked?301:53) && num(x.payload,"Effect")!==0)) r.restrictionReason="additional_spell_effect";
      result.push(r);
    }
  }
  return result.sort((a,b)=>a.consumableItemId-b.consumableItemId);
}

export const auctionEnhancementRecords: readonly EnhancementRecord[] = buildRecords();
export const auctionEnhancementConsumableIds = [...new Set(auctionEnhancementRecords.map(r=>r.consumableItemId))];
export const auctionEnhancementCatalogInfo = {
  version: snapshot.schemaVersion, build: snapshot.build, revision: snapshot.revision,
  simcRevision: snapshot.simcRevision, completeness: "supported_subset" as const,
  rankedMappingSourceBuild:snapshot.rankedMappingSourceBuild,
  coverage: { gems:auctionEnhancementRecords.filter(r=>r.kind==="gem").length, enchants:auctionEnhancementRecords.filter(r=>r.kind==="enchant").length },
  missing: ["historical_CraftingDataEnchantQuality", "ranked_effect_288", "conditional_enhancements", "non_prismatic_socket_types"],
};

export function lookupInstalled(kind: Enhancement["kind"], simulationId: number): {verified:true; enhancement:EnhancementRecord} | {verified:false;reason:string} {
  const records = auctionEnhancementRecords.filter(r=>r.kind===kind && r.simulationId===simulationId);
  const r = records[0];
  // Installed permanent enchant IDs do not require a purchasable scroll mapping. ItemLimitCategory
  // constrains items/gems, not the consumed scroll after installation. Never price this sentinel.
  if (!r && kind==="enchant" && snapshot.nativeRules.some(n=>n.enchantId===simulationId)) {
    const e=enchant.get(simulationId);
    if (e && num(e.payload,"Condition_ID")===0 && num(e.payload,"TransmogUseConditionID")===0) {
      const skill=num(e.payload,"RequiredSkillID"), rank=num(e.payload,"RequiredSkillRank");
      if (!Number.isSafeInteger(skill)||!Number.isSafeInteger(rank)) return {verified:false,reason:"installed_profession_unknown"};
      return {verified:true,enhancement:{key:`retained:enchant:${simulationId}`,kind,simulationId,consumableItemId:0,
        build:snapshot.build,revision:snapshot.revision,requiredLevel:0,qualityId:0,rank:null,
        minItemLevel:num(e.payload,"ItemLevelMin"),maxItemLevel:num(e.payload,"ItemLevelMax"),
        categoryKnown:true,uniqueEquipped:false,sourceRowIds:[ref(e)],...(skill>0?{profession:{id:skill,rank}}:{})}};
    }
  }
  if (!r || !r.categoryKnown || r.restrictionReason) return {verified:false,reason:"installed_enhancement_unknown"};
  if (records.some(x=>JSON.stringify(x.category)!==JSON.stringify(r.category))) return {verified:false,reason:"ambiguous_installed_category"};
  return {verified:true,enhancement:r};
}

// Only item restrictions from the pinned catalog belong in this index. Character
// eligibility and the equipped item's on-use effects are checked on every call.
const supportedRecords = auctionEnhancementRecords.filter(r => r.categoryKnown && !r.restrictionReason);
const catalogEnchants = supportedRecords.filter(r => r.kind === "enchant");
const prismaticGems = supportedRecords.filter(r => r.kind === "gem" && r.color === 14);
type ItemEnchantRules = { applicable: boolean; choices: EnhancementRecord[] };
const itemEnchantRules = new Map<string, ItemEnchantRules>();

function enchantsForItem(target: EnhancementTarget): ItemEnchantRules | null {
  const { itemClassId, itemSubclassId, inventoryType, itemLevel } = target;
  const key = [itemClassId, itemSubclassId, inventoryType, itemLevel].join("/");
  const cached = itemEnchantRules.get(key);
  if (cached !== undefined) return cached;
  const inventoryBit = 2 ** inventoryType, subclassBit = 2 ** itemSubclassId;
  const matches = (rule: { itemClassId?: number; inventoryMask?: number; subclassMask?: number }) =>
    rule.itemClassId === itemClassId && (rule.inventoryMask === 0 || ((rule.inventoryMask ?? 0) & inventoryBit) !== 0)
      && (rule.subclassMask === 0 || ((rule.subclassMask ?? 0) & subclassBit) !== 0);
  let applicable = false;
  for (const rule of snapshot.nativeRules) {
    if (!matches(rule)) continue;
    const payload = enchant.get(rule.enchantId)?.payload;
    const min = num(payload ?? {}, "ItemLevelMin"), max = num(payload ?? {}, "ItemLevelMax");
    if (!Number.isSafeInteger(min) || min < 0 || !Number.isSafeInteger(max) || max < 0 || (max > 0 && max < min)) return null;
    if (itemLevel >= min && (max === 0 || itemLevel <= max)) applicable = true;
  }
  const choices = catalogEnchants.filter(r => matches(r) && itemLevel >= r.minItemLevel && (r.maxItemLevel === 0 || itemLevel <= r.maxItemLevel));
  const result = { applicable, choices };
  if (itemEnchantRules.size >= 512) itemEnchantRules.delete(itemEnchantRules.keys().next().value!);
  itemEnchantRules.set(key, result);
  return result;
}

/** Returns choices, not equipment-wide certification. Caller must enforce category/unique limits
 * across retained AND new enhancements and apply prices to the same simulation IDs. */
export function resolveExactEnhancements(target: EnhancementTarget, character: EnhancementCharacter): EnhancementResolution {
  if (target.build!==snapshot.build || target.revision!==snapshot.simcRevision) return {verified:false,reason:"engine_build_mismatch"};
  if (!target.engine.includes("SimulationCraft")) return {verified:false,reason:"unsupported_engine"};
  if (![target.itemId,target.itemLevel,character.level].every(n=>Number.isSafeInteger(n)&&n>0)
    || ![target.inventoryType,target.itemClassId,target.itemSubclassId].every(n=>Number.isSafeInteger(n)&&n>=0&&n<32)
    || target.socketColors.length!==3 || target.socketColors.some(n=>n!==0&&n!==14)) return {verified:false,reason:"target_metadata_unknown"};
  const professions = character.professions && ("ranks" in character.professions ? character.professions :
    { complete: true, ranks: Object.fromEntries(character.professions.map(p => [p.id, p.rank])) });
  const eligible = (record: EnhancementRecord) => record.profession
    ? professionEligibility(professions, record.profession.id, record.profession.rank) : "eligible";
  if (snapshot.nativeRules.length !== snapshot.nativeRulesSource.rowCount) return {verified:false,reason:"enchant_applicability_unknown"};
  const rules = enchantsForItem(target);
  if (!rules) return {verified:false,reason:"enchant_applicability_unknown"};
  const enchantApplicable = rules.applicable;
  const coverageGaps: CoverageGap[] = [];
  const factionKnown = character.faction === "HORDE" || character.faction === "ALLIANCE";
  const usable = (r: EnhancementRecord) => {
    if (!(character.level >= r.requiredLevel)) return false;
    const skill = eligible(r);
    if (skill === "insufficient" || (r.requiredFaction && factionKnown && r.requiredFaction !== character.faction)
      || (r.requiresNoOnUseEffect && target.hasOnUseEffect === true)) return false;
    const unknown: CoverageGap[] = [];
    if (skill === "unknown") unknown.push("profession_unverified");
    if (r.requiredFaction && !factionKnown) unknown.push("faction_unverified");
    if (r.requiresNoOnUseEffect && target.hasOnUseEffect !== false) unknown.push("target_effects_unverified");
    for (const gap of unknown) if (!coverageGaps.includes(gap)) coverageGaps.push(gap);
    return unknown.length === 0;
  };
  const enchantChoices = rules.choices.filter(usable);
  const availableGems = target.socketColors.includes(14) ? prismaticGems.filter(r => target.itemLevel >= r.minItemLevel &&
    (r.maxItemLevel === 0 || target.itemLevel <= r.maxItemLevel) && usable(r)) : [];
  if (enchantApplicable && !enchantChoices.length) coverageGaps.push("no_supported_enchant");
  const gemChoices: Record<string,EnhancementRecord[]> = {};
  target.socketColors.forEach((color,i)=>{if(color===14) gemChoices[String(i)]=availableGems;});
  if (Object.values(gemChoices).some(v=>!v.length)) coverageGaps.push("no_supported_gem");
  return {verified:true,enchantApplicable,enchantChoices,gemChoices,...(coverageGaps.length ? {coverageGaps} : {})};
}
