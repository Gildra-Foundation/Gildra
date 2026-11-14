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
  categoryKnown: boolean; restrictionReason?: string; uniqueEquipped: boolean;
  sourceRowIds: string[];
};
export type EnhancementTarget = {
  itemId: number; inventoryType: number; itemClassId: number; itemSubclassId: number;
  itemLevel: number; socketColors: readonly number[]; build: string; revision: string;
  engine: string;
};
export type EnhancementCharacter = { level: number; professions: readonly { id: number; rank: number }[] };
export type EnhancementResolution = { verified: false; reason: string } | {
  verified: true; enchantApplicable: boolean; enchantChoices: EnhancementRecord[]; gemChoices: Record<string, EnhancementRecord[]>;
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
  const special = ["RequiredAbility", "RequiredHoliday", "MinFactionID", "MinReputation", "ZoneBound_0", "ZoneBound_1", "InstanceBound"].some(k => num(s,k) !== 0)
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
    rank: kind === "enchant" ? snapshot.nativeRules.find(r=>r.enchantId===enchantRow.id)?.rank ?? null : null,
    minItemLevel: num(e,"ItemLevelMin"), maxItemLevel: num(e,"ItemLevelMax"),
    ...(skill > 0 ? {profession:{id:skill, rank:skillRank}} : {}),
    ...(c && categoryKnown ? {category:{id:categoryId,limit:num(c.payload,"Quantity")}} : {}),
    categoryKnown, uniqueEquipped: (num(s,"Flags_0") & 0x80000) !== 0,
    ...(special ? {restrictionReason:"unsupported_condition"} : {}),
    ...(kind === "gem" ? {gemPropertiesId:num(s,"Gem_properties"),color} : {}),
    sourceRowIds: [sparse,...chain,enchantRow,...(c?[c]:[])].map(ref),
  };
}

function buildRecords(): EnhancementRecord[] {
  const result: EnhancementRecord[] = [];
  for (const sparse of table("ItemSparse")) {
    const g = gem.get(num(sparse.payload,"Gem_properties"));
    if (g) {
      const e = enchant.get(num(g.payload,"Enchant_ID"));
      if (e) result.push(record(sparse,e,"gem",[g],num(g.payload,"Type")));
      continue;
    }
    for (const link of table("ItemXItemEffect").filter(r=>num(r.payload,"ItemID")===sparse.id)) {
      const effect = effects.get(num(link.payload,"ItemEffectID"));
      if (!effect || num(effect.payload,"TriggerType")!==0 || num(effect.payload,"PlayerConditionID")!==0 || num(effect.payload,"ChrSpecializationID")!==0) continue;
      const spellId = num(effect.payload,"SpellID");
      const spellEffects = table("SpellEffect").filter(r=>num(r.payload,"SpellID")===spellId && num(r.payload,"DifficultyID")===0);
      const applying = spellEffects.filter(r=>[53,301].includes(num(r.payload,"Effect")));
      const equipped = table("SpellEquippedItems").filter(r=>num(r.payload,"SpellID")===spellId);
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
      if (ranked) {
        const native=snapshot.nativeRules.filter(n=>n.enchantId===enchantId && n.itemClassId===r.itemClassId
          && n.inventoryMask===r.inventoryMask && n.subclassMask===r.subclassMask);
        if (!native.length || native.some(n=>n.rank!==native[0].rank)) continue;
        r.rank=native[0].rank;
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

/** Returns choices, not equipment-wide certification. Caller must enforce category/unique limits
 * across retained AND new enhancements and apply prices to the same simulation IDs. */
export function resolveExactEnhancements(target: EnhancementTarget, character: EnhancementCharacter): EnhancementResolution {
  if (target.build!==snapshot.build || target.revision!==snapshot.simcRevision) return {verified:false,reason:"engine_build_mismatch"};
  if (!target.engine.includes("SimulationCraft")) return {verified:false,reason:"unsupported_engine"};
  if (![target.itemId,target.itemLevel,character.level].every(n=>Number.isSafeInteger(n)&&n>0)
    || ![target.inventoryType,target.itemClassId,target.itemSubclassId].every(n=>Number.isSafeInteger(n)&&n>=0&&n<32)
    || target.socketColors.length!==3 || target.socketColors.some(n=>n!==0&&n!==14)) return {verified:false,reason:"target_metadata_unknown"};
  const allowed = auctionEnhancementRecords.filter(r=>r.categoryKnown && !r.restrictionReason
    && character.level>=r.requiredLevel && target.itemLevel>=r.minItemLevel && (r.maxItemLevel===0||target.itemLevel<=r.maxItemLevel)
    && (!r.profession || character.professions.some(p=>p.id===r.profession!.id&&p.rank>=r.profession!.rank)));
  const enchantChoices = allowed.filter(r=>r.kind==="enchant" && r.itemClassId===target.itemClassId
    && (r.inventoryMask===0 || ((r.inventoryMask??0)&(2**target.inventoryType))!==0)
    && (r.subclassMask===0 || ((r.subclassMask??0)&(2**target.itemSubclassId))!==0));
  const nativeApplicable = snapshot.nativeRules.filter(r=>r.itemClassId===target.itemClassId
    && (r.inventoryMask===0||(r.inventoryMask&(2**target.inventoryType))!==0)
    && (r.subclassMask===0||(r.subclassMask&(2**target.itemSubclassId))!==0));
  if (nativeApplicable.some(r=>!enchant.has(r.enchantId))) return {verified:false,reason:"enchant_applicability_unknown"};
  const enchantApplicable = nativeApplicable.some(r=>{
    const e=enchant.get(r.enchantId)!.payload;
    return target.itemLevel>=num(e,"ItemLevelMin") && (num(e,"ItemLevelMax")===0||target.itemLevel<=num(e,"ItemLevelMax"));
  });
  if (enchantApplicable && !enchantChoices.length) return {verified:false,reason:"no_supported_enchant"};
  const gemChoices: Record<string,EnhancementRecord[]> = {};
  target.socketColors.forEach((color,i)=>{if(color===14) gemChoices[String(i)]=allowed.filter(r=>r.kind==="gem"&&r.color===14);});
  if (Object.values(gemChoices).some(v=>!v.length)) return {verified:false,reason:"no_supported_gem"};
  return {verified:true,enchantApplicable,enchantChoices,gemChoices};
}
