export type GearAcquisitionSource = {
  type: "encounter" | "crafting_recipe" | "quest" | "vendor" | "container" | "world_drop" | "blizzard_api" | "community_provider" | "unknown";
  id?: number;
  name?: string;
  location?: string;
  difficultyMask?: number;
  evidence: "catalog" | "missing";
};

export type GearCandidateConstraints = {
  uniqueEquipped: boolean;
  limitCategoryId?: number;
  limitQuantity?: number;
  crafted: boolean;
  setId?: number;
  setName?: string;
  allowableClassMask: string;
  requiredLevel: number;
};

export type GearCandidate = {
  entityId: string;
  itemId: number;
  name: string;
  iconUrl?: string;
  itemLevel: number;
  quality?: number;
  slotType: string;
  inventoryType: number;
  itemClassId: number;
  itemSubclassId: number;
  season: { id: string; patch: string; status: "current" | "unknown" | "legacy"; evidence: string };
  source: GearAcquisitionSource;
  constraints: GearCandidateConstraints;
  compatibility: { specId: number; method: "equipped-anchor"; itemClassId: number; itemSubclassId: number };
  provenance: { buildId?: number; build?: string; buildNumber?: number; sourceUrl?: string; updatedAt?: string };
  variants: GearCandidateVariant[];
  eligible: boolean;
  rejectionReasons: string[];
};

export type GearCandidateVariant = {
  key: string;
  itemLevel: number;
  bonusIds: number[];
  contextId: number;
  craftedQuality?: number;
  upgradeTrackId?: number;
  upgradeRank?: number;
  sourceArtifactId?: string;
};

export type CatalogGearEntity = {
  id: string;
  externalId: number;
  name: string;
  iconUrl?: string;
  quality?: number;
  buildId?: number;
  updatedAt?: string;
  payload?: Record<string, unknown>;
  tooltip?: { blocks?: Array<Record<string, unknown>> };
};

export type GearCandidateContext = {
  classId: number;
  specId: number;
  characterLevel: number;
  slotType: string;
  currentItemLevel: number;
  anchorItemClassId: number;
  anchorItemSubclassId: number;
  season: { id: string; patch: string; expansionId: number; build?: string; sourceUrl: string; activityNames: string[] };
};

const slotInventoryTypes: Record<string, number[]> = {
  HEAD: [1], NECK: [2], SHOULDER: [3], SHIRT: [4], CHEST: [5, 20], WAIST: [6], LEGS: [7], FEET: [8],
  WRIST: [9], HANDS: [10], FINGER_1: [11], FINGER_2: [11], TRINKET_1: [12], TRINKET_2: [12],
  BACK: [16], MAIN_HAND: [13, 17, 21], OFF_HAND: [13, 14, 22, 23], TABARD: [19],
};

export const gearSlotCategoryPaths: Record<string, string> = {
  HEAD: "equipment/slots/head", NECK: "equipment/accessories/neck", SHOULDER: "equipment/slots/shoulder",
  CHEST: "equipment/slots/chest", WAIST: "equipment/slots/waist", LEGS: "equipment/slots/legs",
  FEET: "equipment/slots/feet", WRIST: "equipment/slots/wrist", HANDS: "equipment/slots/hands",
  FINGER_1: "equipment/accessories/finger", FINGER_2: "equipment/accessories/finger",
  TRINKET_1: "equipment/accessories/trinkets", TRINKET_2: "equipment/accessories/trinkets",
  BACK: "equipment/accessories/back", MAIN_HAND: "equipment/weapons", OFF_HAND: "equipment",
};

export function gearCandidateCatalogQuery(slotType: string, currentItemLevel: number) {
  const category = gearSlotCategoryPaths[slotType];
  if (!category) throw new Error("unsupported_equipment_slot");
  return { locale: "ru_RU" as const, product: "wow", type: "item", category, minItemLevel: currentItemLevel, limit: 100, includeTotal: false, fresh: true };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9а-яё]+/gi, " ").trim().toLocaleLowerCase("en-US");
}

function block(entity: CatalogGearEntity, type: string) {
  return entity.tooltip?.blocks?.find((entry) => entry.type === type);
}

function blocks(entity: CatalogGearEntity, type: string) {
  return entity.tooltip?.blocks?.filter((entry) => entry.type === type) ?? [];
}

function payloadValue(entity: CatalogGearEntity, ...keys: string[]) {
  const root = object(entity.payload);
  const db2 = object(root.db2);
  const raidbots = object(root.raidbots);
  for (const key of keys) {
    if (root[key] !== undefined) return root[key];
    if (db2[key] !== undefined) return db2[key];
    if (raidbots[key] !== undefined) return raidbots[key];
  }
  return undefined;
}

function variantsFor(entity: CatalogGearEntity): GearCandidateVariant[] {
  const entries = block(entity, "item_variants")?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((raw) => {
    const entry = object(raw);
    const bonusIds = Array.isArray(entry.bonus_list_ids)
      ? entry.bonus_list_ids.map((value) => number(value)).filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const key = text(entry.key);
    const itemLevel = number(entry.item_level);
    if (!key || itemLevel <= 0 || !bonusIds.length) return [];
    return [{
      key, itemLevel, bonusIds, contextId: number(entry.context_id),
      craftedQuality: number(entry.crafted_quality) || undefined,
      upgradeTrackId: number(entry.upgrade_track_id) || undefined,
      upgradeRank: number(entry.upgrade_rank) || undefined,
      sourceArtifactId: text(entry.source_artifact_id) || undefined,
    }];
  }).sort((a, b) => b.itemLevel - a.itemLevel || a.key.localeCompare(b.key));
}

function classAllowed(maskText: string, classId: number) {
  const mask = BigInt(maskText || "0");
  return mask === 0n || (mask & (1n << BigInt(classId - 1))) !== 0n;
}

function sourceFor(entity: CatalogGearEntity): GearAcquisitionSource {
  const sources = blocks(entity, "acquisition");
  if (!sources.length) return { type: "unknown", evidence: "missing" };
  const source = sources[0];
  const candidate = text(source.source_type) as GearAcquisitionSource["type"];
  const allowed = new Set<GearAcquisitionSource["type"]>(["encounter", "crafting_recipe", "quest", "vendor", "container", "world_drop", "blizzard_api", "community_provider"]);
  return {
    type: allowed.has(candidate) ? candidate : "unknown",
    id: number(source.source_id) || undefined,
    name: text(source.name) || undefined,
    location: text(source.location) || undefined,
    difficultyMask: number(source.difficulty_mask) || undefined,
    evidence: "catalog",
  };
}

export function normalizeGearCandidate(entity: CatalogGearEntity, context: GearCandidateContext): GearCandidate {
  const registry = block(entity, "item_registry") ?? {};
  const requirements = block(entity, "item_requirements") ?? {};
  const set = block(entity, "item_set") ?? {};
  const provenance = block(entity, "provenance") ?? {};
  const source = sourceFor(entity);
  const inventoryType = number(registry.inventory_type ?? payloadValue(entity, "InventoryType", "inventoryType"));
  const itemClassId = number(registry.class_id ?? payloadValue(entity, "ItemClass", "itemClass"), -1);
  const itemSubclassId = number(registry.subclass_id ?? payloadValue(entity, "ItemSubClass", "itemSubClass"), -1);
  const itemLevel = number(payloadValue(entity, "itemLevel", "ItemLevel", "BaseItemLevel"));
  const requiredLevel = number(requirements.required_level ?? payloadValue(entity, "RequiredLevel"));
  const allowableClassMask = text(requirements.class_mask ?? payloadValue(entity, "AllowableClass")) || "0";
  const expansionId = number(payloadValue(entity, "ExpansionID"), -1);
  const location = normalize(source.location ?? "");
  const currentLocations = new Set(context.season.activityNames.map(normalize));
  const currentSource = Boolean(location && currentLocations.has(location));
  const crafted = source.type === "crafting_recipe";
  const seasonStatus = expansionId === context.season.expansionId && (currentSource || crafted) ? "current"
    : expansionId >= 0 && expansionId !== context.season.expansionId ? "legacy" : "unknown";
  const permittedInventory = slotInventoryTypes[context.slotType] ?? [];
  const rejectionReasons: string[] = [];
  if (!permittedInventory.includes(inventoryType)) rejectionReasons.push("slot_mismatch");
  if (!classAllowed(allowableClassMask, context.classId)) rejectionReasons.push("class_restricted");
  if (requiredLevel > context.characterLevel) rejectionReasons.push("level_restricted");
  if (itemLevel < context.currentItemLevel) rejectionReasons.push("below_equipped_item_level");
  if (context.anchorItemClassId >= 0 && itemClassId !== context.anchorItemClassId) rejectionReasons.push("item_class_mismatch");
  if (context.anchorItemSubclassId >= 0 && [2, 4].includes(context.anchorItemClassId) && itemSubclassId !== context.anchorItemSubclassId) rejectionReasons.push("item_subclass_mismatch");
  if (seasonStatus !== "current") rejectionReasons.push(seasonStatus === "legacy" ? "legacy_season" : "season_unverified");
  if (source.evidence === "missing") rejectionReasons.push("acquisition_source_missing");
  const unique = Boolean(block(entity, "unique_equipped"));
  const limitCategoryId = number(payloadValue(entity, "LimitCategory")) || undefined;
  const limitQuantity = number(payloadValue(entity, "LimitCategoryQuantity")) || undefined;
  const setId = number(set.set_id ?? payloadValue(entity, "ItemSet")) || undefined;
  const variants = variantsFor(entity);
  if (!variants.length) rejectionReasons.push("simulation_variant_missing");
  return {
    entityId: entity.id, itemId: entity.externalId, name: entity.name, iconUrl: entity.iconUrl,
    itemLevel, quality: entity.quality, slotType: context.slotType, inventoryType, itemClassId, itemSubclassId,
    season: { id: context.season.id, patch: context.season.patch, status: seasonStatus, evidence: currentSource ? source.location! : crafted ? "crafting_recipe + expansion" : "missing" },
    source,
    constraints: { uniqueEquipped: unique, limitCategoryId, limitQuantity, crafted, setId, setName: text(set.name) || undefined, allowableClassMask, requiredLevel },
    compatibility: { specId: context.specId, method: "equipped-anchor", itemClassId: context.anchorItemClassId, itemSubclassId: context.anchorItemSubclassId },
    provenance: { buildId: entity.buildId, build: text(provenance.build) || undefined, buildNumber: number(provenance.build_number) || undefined, sourceUrl: text(provenance.source_url) || undefined, updatedAt: text(provenance.updated_at) || entity.updatedAt },
    variants,
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
  };
}

export function buildGearCandidatePool(entities: CatalogGearEntity[], context: GearCandidateContext) {
  const all = entities.map((entity) => normalizeGearCandidate(entity, context));
  const candidates = all.filter((candidate) => candidate.eligible)
    .sort((a, b) => b.itemLevel - a.itemLevel || a.name.localeCompare(b.name) || a.itemId - b.itemId);
  const rejectedByReason = all.flatMap((candidate) => candidate.rejectionReasons)
    .reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  return { candidates, rejected: all.filter((candidate) => !candidate.eligible), rejectedByReason };
}

export function validateGearCandidateRelations(candidates: GearCandidate[], context: GearCandidateContext) {
  const errors: string[] = [];
  const ids = new Set<number>();
  for (const candidate of candidates) {
    if (ids.has(candidate.itemId)) errors.push(`duplicate_item:${candidate.itemId}`);
    ids.add(candidate.itemId);
    if (!candidate.eligible || candidate.rejectionReasons.length) errors.push(`ineligible_candidate:${candidate.itemId}`);
    if (candidate.slotType !== context.slotType) errors.push(`slot_relation:${candidate.itemId}`);
    if (candidate.compatibility.specId !== context.specId || candidate.compatibility.method !== "equipped-anchor") errors.push(`spec_relation:${candidate.itemId}`);
    if (candidate.season.id !== context.season.id || candidate.season.status !== "current") errors.push(`season_relation:${candidate.itemId}`);
    if (candidate.source.evidence !== "catalog" || candidate.source.type === "unknown") errors.push(`source_relation:${candidate.itemId}`);
    if (!candidate.provenance.build && !candidate.provenance.buildId && !candidate.provenance.buildNumber) errors.push(`build_provenance:${candidate.itemId}`);
    if (candidate.constraints.setId && !candidate.constraints.setName) errors.push(`set_relation:${candidate.itemId}`);
    if (candidate.constraints.crafted !== (candidate.source.type === "crafting_recipe")) errors.push(`crafted_relation:${candidate.itemId}`);
  }
  return { valid: errors.length === 0, errors };
}
