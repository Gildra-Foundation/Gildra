import { getCatalogEntity, getCatalogPage, type CatalogRecord, type GameEntity } from "@/lib/api/client";
import { midnightManifest } from "@/lib/midnightManifest";

export type TalentKind = "class" | "hero" | "spec";
export type TalentNodeType = "single" | "choice" | "tiered" | "subtree";

export type TalentChoice = {
  externalId: number;
  spellId?: number;
  definitionId?: number;
  entryIndex?: number;
  name: string;
  description: string;
  iconUrl?: string;
  iconName?: string;
  iconSource: "blizzard-render" | "fallback";
  iconFallback?: boolean;
  maxRanks: number;
  talentType: "active" | "passive" | "choice";
};

export type PvPTalent = {
  externalId: number;
  spellId?: number;
  name: string;
  description: string;
  iconUrl?: string;
  iconName?: string;
  iconSource: "blizzard-render" | "fallback";
  iconFallback?: boolean;
  specId: number;
  levelRequired?: number;
  playerConditionId?: number;
  buildId: number;
  buildVersion: string;
  sourceUrl: string;
};

export type TalentNode = {
  id: string;
  nodeId: number;
  x: number;
  y: number;
  row: number;
  column: number;
  maxRanks: number;
  talentType: TalentChoice["talentType"];
  nodeType: TalentNodeType;
  prevNodeIds: number[];
  nextNodeIds: number[];
  requiresNodeIds: number[];
  requiredPoints?: number;
  entryNode: boolean;
  freeNode: boolean;
  freeLevel?: number;
  rankLevels?: Array<{ level: number; maxRanks: number }>;
  choices: TalentChoice[];
};

export type TalentTree = {
  kind: TalentKind;
  nodes: TalentNode[];
  totalRanks: number;
  sourceNodeCount: number;
  sourceEdgeCount: number;
};

export type TalentCalculatorData = {
  buildId: number;
  buildVersion: string;
  buildNumber: number;
  className: string;
  specName: string;
  heroName: string;
  heroSubtreeId: number;
  heroIconUrl: string;
  trees: Record<TalentKind, TalentTree>;
  pvpTalents: PvPTalent[];
};

type RecordValue = Record<string, unknown>;
type TooltipBlock = RecordValue & { type?: string };
type RawNode = RecordValue & { id: number; type: TalentNodeType; entries: RawEntry[]; posX: number; posY: number };
type RawEntry = RecordValue & { id: number; name: string; type: string; maxRanks: number; index: number; spellId?: number; definitionId?: number; icon?: string };
type Topology = {
  traitTreeId: number;
  classId: number;
  specId: number;
  className: string;
  specName: string;
  nodes: Record<TalentKind, RawNode[]>;
  heroSubtreeId: number;
  heroName: string;
  buildId: number;
  buildVersion: string;
  buildNumber: number;
};

const locale = "ru_RU" as const;
const specId = 72;
const facet = "classes/warrior/fury";
const heroSubtreeId = 61;
const unavailableOfficialIcons = new Set(["inv121_ability_warrior_javelineer"]);

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function russianPlural(value: number, forms: [string, string, string]) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  return forms[mod10 === 1 && mod100 !== 11 ? 0 : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 1 : 2];
}

function asNumberArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asNumber(item)).filter((item) => item > 0);
  const single = asNumber(value);
  return single > 0 ? [single] : [];
}

function parseRawEntry(value: unknown): RawEntry | null {
  const item = asRecord(value);
  const id = asNumber(item?.id);
  if (!item || !id) return null;
  return {
    ...item,
    id, name: String(item.name ?? ""), type: String(item.type ?? "passive"),
    maxRanks: Math.max(1, asNumber(item.maxRanks, 1)), index: asNumber(item.index),
    spellId: asNumber(item.spellId) || undefined, definitionId: asNumber(item.definitionId) || undefined,
    icon: typeof item.icon === "string" ? item.icon : undefined,
  };
}

export const cleanTalentDescription = (value: unknown) => String(value ?? "")
  .replace(/\|c[0-9A-Fa-f]{8}|\|r/g, "")
  .replace(/\$\?[^\[]+\[([^\]]*)\](?:\?[^\[]+\[([^\]]*)\])?(?:\[([^\]]*)\])?/g, (_, first: string, second?: string, third?: string) => first || second || third || "")
  .replace(/\$\?a[^\[]+\[([^\]]*)\]\[([^\]]*)\]/g, (_, first: string, second: string) => second || first)
  .replace(/\$\?[^\[]+\[([^\]]*)\](?:\[([^\]]*)\])?/g, (_, first: string, second?: string) => first || second || "")
  .replace(/\$@(?:spell)?(?:icon|name|desc)\d+/g, "")
  .replace(/\$<([^>]+)>/g, (_, token: string) => token.toLowerCase().includes("damage") || token.toLowerCase().includes("dmg") ? "урон зависит от характеристик персонажа" : "эффект зависит от контекста")
  .replace(/\$\{[^}]+\}/g, "эффект зависит от контекста")
  .replace(/\$proccooldown/gi, "время восстановления")
  .replace(/\$\d*t\d*/gi, "длительность эффекта")
  .replace(/\$\d*o\d*/gi, "урон")
  .replace(/\$\d*[aA]\d*/g, "радиус действия")
  .replace(/\$\d*u\d*/gi, "число повторений")
  .replace(/\$\d*h\d*/gi, "эффект зависит от контекста")
  .replace(/\$\d*[sm]\d*/gi, "эффект зависит от контекста")
  .replace(/\?c\d+\[/g, "")
  .replace(/\$[a-zA-Z][\w<>/-]*/g, "")
  .replace(/\$[a-zA-Z0-9_<>/-]+/g, "")
  .replace(/\[\]/g, "")
  .replace(/\]/g, "")
  .replace(/(на|by)\s+-([0-9]+(?:[.,][0-9]+)?)%/gi, "$1 $2%")
  .replace(/эффект зависит от контекста\s*%/gi, "величину, зависящую от характеристик персонажа")
  .replace(/с вероятностью\s+эффект зависит от контекста%/gi, "с неподтвержденной вероятностью")
  .replace(/с вероятностью\s+величину, зависящую от характеристик персонажа/gi, "с неподтвержденной вероятностью")
  .replace(/урон зависит от характеристик персонажа\s+ед\./gi, "урон, зависящий от характеристик персонажа")
  .replace(/на\s+эффект зависит от контекста\s+сек\.?/gi, "; точное значение времени не подтверждено источником")
  .replace(/получите\s+эффект зависит от контекста\s+ед\.\s+урона от этого эффекта/gi, "получите дополнительный урон от этого эффекта; точное значение не подтверждено источником")
  .replace(/эффект зависит от контекста\s+ед\.\s+ярости/gi, "дополнительную ярость; точное значение не подтверждено источником")
  .replace(/на\s+эффект зависит от контекста\s+ед\.\s+меньше ярости/gi, "меньше ярости; точное значение не подтверждено источником")
  .replace(/автоатаки дают на 10\?\[20\[50% больше ярости/gi, "автоатаки дают ярость; точное значение не подтверждено источником")
  .replace(/\"Смертельный удар\" и \"Рассекающий удар\" могут\"Буйство\" может\[\"Реванш\" может восполнить 1010\[50% затраченной ярости с вероятностью (?:исцеление%|величину, зависящую от характеристик персонажа)/gi, "условия срабатывания зависят от выбранного таланта; точные значения не подтверждены источником")
  .replace(/\"Смертельный удар\" и \"Рассекающий удар\" могут\"Буйство\" может\[\"Реванш\" может восполнить 1010\[50% затраченной ярости с неподтвержденной вероятностью/gi, "условия срабатывания зависят от выбранного таланта; точные числа не подтверждены источником")
  .replace(/еще\s+урон\s+ед\.\s+физического урона/gi, "дополнительный физический урон; точное значение не подтверждено источником")
  .replace(/после\s+эффект зависит от контекста-й/gi, "после указанного порога")
  .replace(/на\s+временной интервал/gi, "; точный интервал не подтвержден источником")
  .replace(/максимум\s+[–-]\s*эффект зависит от контекста\s+ед\.\s+ярости/gi, "максимум — дополнительная ярость; точное значение не подтверждено источником")
  .replace(/(\d+)\s+эффект:эффекта:эффектов;/gi, "$1 эффекта")
  .replace(/(\d+)\s+заряд:заряда:зарядов;/gi, (_, value: string) => `${value} ${russianPlural(Number(value), ["заряд", "заряда", "зарядов"])}`)
  .replace(/(\d+)\s+раз:раза:раз;/gi, (_, value: string) => `${value} ${russianPlural(Number(value), ["раз", "раза", "раз"])}`)
  .replace(/число повторений\s+следующая атака, действующая на одну цель, поражает:следующие атаки, действующие на одну цель, поражают:следующих атак, действующих на одну цель, поражают;\s*до 4 дополнительной цели, нанося ей:дополнительных целей, нанося им:дополнительных целей, нанося им;\s*65% базового урона/gi, "следующая атака, действующая на одну цель, поражает до 4 дополнительных целей, нанося им 65% базового урона")
  .replace(/временной интервал/gi, "точный интервал не подтвержден источником")
  .replace(/дополнительный физический урон; точное значение не подтверждено источником за\s+(\d+(?:[.,]\d+)?)\s+сек/gi, "дополнительный физический урон за $1 сек; точное число не подтверждено источником")
  .replace(/ед\.\s+ярости\.?/gi, "ярость; точное количество не подтверждено источником")
  .replace(/точное значение/gi, "точное число")
  .replace(/точные значения/gi, "точные числа")
  .replace(/сокращается\s*;\s*точное число времени не подтверждено источником/gi, "сокращается; точное число не подтверждено источником")
  .replace(/в радиусе\s+радиус действия\s*м/gi, "в радиусе действия")
  .replace(/радиус действия\s*м/gi, "радиус действия")
  .replace(/время восстановления\s*сек\.?/gi, "время восстановления")
  .replace(/длительность эффекта\s*сек\.?/gi, "длительность эффекта")
  .replace(/(\d{4,})\s*сек\.?/gi, "временной интервал")
  .replace(/(цель|цели|целей):(?:цель|цели|целей):(?:цель|цели|целей);/gi, "цели")
  .replace(/\b([^:;]{1,40}):([^:;]{1,40}):([^;]{1,40});/g, "$1")
  .replace(/число повторений\s+раз/gi, "несколько раз")
  .replace(/;\d+s\d+/gi, "")
  .replace(/\s+([.,:])/g, "$1")
  .replace(/\s+на\./gi, "")
  .replace(/\s+эффект зависит от контекста\s+ед\./gi, " значение")
  .replace(/эффект зависит от контекста/gi, "значение, зависящее от характеристик")
  .replace(/\.\s*:/g, ".")
  .replace(/:\s*\n/g, "\n")
  .replace(/\(\s*\)/g, "")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .replace(/\s+([.,:])/g, "$1")
  .replace(/\s{2,}/g, " ")
  .trim();

function asTalentType(value: unknown): TalentChoice["talentType"] {
  if (value === "active" || value === "choice") return value;
  return "passive";
}

function parseRawNode(value: unknown): RawNode | null {
  const raw = asRecord(value);
  const id = asNumber(raw?.id);
  if (!raw || !id) return null;
  const entries = Array.isArray(raw.entries) ? raw.entries.map(parseRawEntry).filter((entry): entry is RawEntry => entry !== null) : [];
  const nodeType = raw.type === "choice" || raw.type === "tiered" || raw.type === "subtree" ? raw.type : "single";
  return {
    ...raw,
    id,
    type: nodeType,
    entries,
    posX: asNumber(raw.posX),
    posY: asNumber(raw.posY),
  };
}

function rawNodes(value: unknown) {
  return Array.isArray(value) ? value.map(parseRawNode).filter((node): node is RawNode => node !== null) : [];
}

function readTopology(entity: GameEntity | null): Topology | null {
  const block = (entity?.tooltip?.blocks ?? []).find((item) => String(item.type ?? "") === "talent_tree_topology") as TooltipBlock | undefined;
  if (!block) return null;
  const subtreeRoot = rawNodes(block.subTreeNodes)[0];
  const subtreeEntries = subtreeRoot?.entries ?? [];
  const mountain = subtreeEntries.find((entry) => asNumber(entry.traitSubTreeId) === heroSubtreeId);
  const provenance = (entity?.tooltip?.blocks ?? []).find((item) => String(item.type ?? "") === "provenance") as TooltipBlock | undefined;
  return {
    traitTreeId: asNumber(block.traitTreeId), classId: asNumber(block.classId), specId: asNumber(block.specId),
    className: String(block.className ?? "Warrior"), specName: String(block.specName ?? "Fury"),
    nodes: { class: rawNodes(block.classNodes), hero: rawNodes(block.heroNodes), spec: rawNodes(block.specNodes) },
    heroSubtreeId,
    heroName: mountain?.name === "Mountain Thane" ? "Горный тан" : String(mountain?.name ?? "Горный тан"),
    buildId: asNumber(entity?.buildId, 1),
    buildVersion: String(provenance?.build ?? ""),
    buildNumber: asNumber(provenance?.build_number),
  };
}

async function getAllTalentSummaries() {
  const rows: CatalogRecord[] = [];
  let cursor = "";
  for (let page = 0; page < 100; page += 1) {
    const result = await getCatalogPage({ locale, product: "wow", type: "talent", facets: [facet], cursor, limit: 100, includeTotal: false, fresh: false });
    rows.push(...result.data);
    if (!result.pagination.hasMore || !result.pagination.nextCursor) break;
    cursor = result.pagination.nextCursor;
    if (page === 99) throw new Error("Talent catalog pagination exceeded the safety limit");
  }
  return [...new Map(rows.map((row) => [row.externalId, row])).values()];
}

async function getTalentTreeEntity() {
  const page = await getCatalogPage({ locale, product: "wow", type: "talent_tree", limit: 100, includeTotal: false, fresh: false });
  const summary = page.data.find((row) => row.externalId === specId);
  if (!summary) throw new Error(`Talent tree ${specId} is missing from the active Midnight catalog`);
  return getCatalogEntity(summary.id, locale, "", true);
}

async function getAllPvpTalentSummaries() {
  const rows: CatalogRecord[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const result = await getCatalogPage({ locale, product: "wow", type: "pvp_talent", cursor, limit: 100, includeTotal: false, fresh: false });
    rows.push(...result.data);
    if (!result.pagination.hasMore || !result.pagination.nextCursor) break;
    cursor = result.pagination.nextCursor;
  }
  const allowed = new Set<number>(midnightManifest.furyPvpTalentIds);
  return [...new Map(rows.filter((row) => allowed.has(row.externalId)).map((row) => [row.externalId, row])).values()];
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}

async function getEntityWithRetry(id: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getCatalogEntity(id, locale, "", false);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Catalog entity request failed after retries");
}

type TalentEntityRecord = CatalogRecord | GameEntity;

function entityFromSnapshot(summary: TalentEntityRecord) {
  return "tooltip" in summary && summary.tooltip ? summary as GameEntity : null;
}

async function enrich(summary: TalentEntityRecord, topology: Topology) {
  if (summary.product && summary.product !== "wow") return null;
  if (summary.locale && summary.locale !== locale) return null;
  if (summary.buildId && summary.buildId !== topology.buildId) return null;
  const snapshotEntity = entityFromSnapshot(summary);
  if (!snapshotEntity && !((summary as CatalogRecord).description || (summary as CatalogRecord).name)) return null;
  if (!snapshotEntity) {
    const appearance = (Object.entries(topology.nodes) as [TalentKind, RawNode[]][]).flatMap(([treeKind, nodes]) => nodes.map((node) => ({ treeKind, node }))).find(({ node }) => node.entries.some((entry) => entry.id === summary.externalId));
    if (!appearance || (appearance.treeKind === "hero" && appearance.node.subTreeId !== topology.heroSubtreeId)) return null;
    const sourceEntry = appearance.node.entries.find((entry) => entry.id === summary.externalId);
    if (!sourceEntry) return null;
    const iconName = summary.iconName || sourceEntry.icon;
    const iconFallback = Boolean(iconName && unavailableOfficialIcons.has(iconName));
    return {
      treeKind: appearance.treeKind,
      nodeId: appearance.node.id,
      choice: {
        externalId: summary.externalId,
        spellId: sourceEntry.spellId,
        definitionId: sourceEntry.definitionId,
        entryIndex: sourceEntry.index,
        name: summary.name,
        description: cleanTalentDescription(summary.description),
        iconUrl: iconFallback ? "/assets/classes/warrior.jpg" : summary.iconUrl || (sourceEntry.icon ? `https://render.worldofwarcraft.com/us/icons/56/${sourceEntry.icon}.jpg` : undefined),
        iconName,
        iconSource: iconFallback ? "fallback" : "blizzard-render",
        iconFallback,
        maxRanks: sourceEntry.maxRanks,
        talentType: asTalentType(sourceEntry.type),
      } satisfies TalentChoice,
      buildId: asNumber(summary.buildId, topology.buildId),
    };
  }
  const entity = snapshotEntity;
  if (entity.product !== "wow" || entity.buildId !== topology.buildId) return null;
  const blocks = (entity.tooltip?.blocks ?? []) as TooltipBlock[];
  const info = blocks.find((block) => block.type === "talent_info");
  const description = blocks.find((block) => block.type === "description");
  const provenance = blocks.find((block) => block.type === "provenance");
  const buildNumber = asNumber(provenance?.build_number);
  if (!provenance || !Object.prototype.hasOwnProperty.call(provenance, "build_number") || buildNumber !== topology.buildNumber) return null;
  const appearances = Array.isArray(info?.appearances) ? info.appearances.map(asRecord).filter((item): item is RecordValue => item !== null) : [];
  const appearance = appearances.find((item) => asNumber(item.spec_id) === specId && ["class", "hero", "spec"].includes(String(item.tree_kind)));
  if (!appearance) return null;
  const treeKind = String(appearance.tree_kind) as TalentKind;
  const nodeId = asNumber(appearance.node_id);
  const meta = topology.nodes[treeKind].find((node) => node.id === nodeId);
  if (!meta || (treeKind === "hero" && meta.subTreeId !== topology.heroSubtreeId)) return null;
  const sourceEntry = meta.entries.find((entry) => entry.id === summary.externalId);
  const iconName = entity.iconName || summary.iconName || sourceEntry?.icon;
  const iconFallback = Boolean(iconName && unavailableOfficialIcons.has(iconName));
  return {
    treeKind,
    nodeId,
    choice: {
      externalId: summary.externalId,
      spellId: asNumber(info?.spell_id) || sourceEntry?.spellId,
      definitionId: sourceEntry?.definitionId,
      entryIndex: sourceEntry?.index,
      name: entity.name || summary.name,
       description: cleanTalentDescription(description?.text || entity.description || summary.description),
       iconUrl: iconFallback ? "/assets/classes/warrior.jpg" : entity.iconUrl || summary.iconUrl || (sourceEntry?.icon ? `https://render.worldofwarcraft.com/us/icons/56/${sourceEntry.icon}.jpg` : undefined),
       iconName,
       iconSource: iconFallback ? "fallback" : "blizzard-render",
       iconFallback,
      maxRanks: Math.max(1, asNumber(info?.max_ranks, sourceEntry?.maxRanks ?? 1)),
      talentType: asTalentType(info?.talent_type),
    } satisfies TalentChoice,
    buildId: asNumber(entity.buildId, topology.buildId),
  };
}

async function enrichPvp(summary: TalentEntityRecord, topology: Topology): Promise<PvPTalent | null> {
  if (summary.product && summary.product !== "wow") return null;
  if (summary.locale && summary.locale !== locale) return null;
  if (summary.buildId && summary.buildId !== topology.buildId) return null;
  let entity = entityFromSnapshot(summary);
  if (!entity) {
    try { entity = await getEntityWithRetry(summary.id, 1); } catch { entity = null; }
  }
  if (!entity) {
    return {
      externalId: summary.externalId, name: summary.name, description: cleanTalentDescription(summary.description),
      iconUrl: summary.iconUrl, iconName: summary.iconName, iconSource: summary.iconUrl ? "blizzard-render" : "fallback",
      iconFallback: !summary.iconUrl, specId, buildId: asNumber(summary.buildId, topology.buildId), buildVersion: topology.buildVersion, sourceUrl: "",
    };
  }
  if (!entity || entity.product !== "wow" || entity.buildId !== topology.buildId) return null;
  const blocks = (entity.tooltip?.blocks ?? []) as TooltipBlock[];
  const info = blocks.find((block) => block.type === "talent_info");
  const description = blocks.find((block) => block.type === "description");
  const provenance = blocks.find((block) => block.type === "provenance");
  const buildNumber = asNumber(provenance?.build_number);
  if (!provenance || !Object.prototype.hasOwnProperty.call(provenance, "build_number") || buildNumber !== topology.buildNumber) return null;
  const appearances = Array.isArray(info?.appearances) ? info.appearances.map(asRecord).filter((item): item is RecordValue => item !== null) : [];
  const appearance = appearances.find((item) => asNumber(item.spec_id) === specId);
  if (!appearance) return null;
  const iconName = entity.iconName || summary.iconName;
  const iconFallback = Boolean(iconName && unavailableOfficialIcons.has(iconName));
  return {
    externalId: summary.externalId,
    spellId: asNumber(info?.spell_id),
    name: entity.name || summary.name,
    description: cleanTalentDescription(description?.text || entity.description || summary.description),
    iconUrl: iconFallback ? "/assets/classes/warrior.jpg" : entity.iconUrl || summary.iconUrl,
    iconName,
    iconSource: iconFallback ? "fallback" : "blizzard-render",
    iconFallback,
    specId,
    levelRequired: asNumber(info?.level_required) || undefined,
    playerConditionId: asNumber(info?.player_condition_id) || undefined,
    buildId: asNumber(entity.buildId, topology.buildId),
    buildVersion: String(provenance?.build ?? topology.buildVersion),
    sourceUrl: String(provenance?.source_url ?? ""),
  };
}

function placeNodes(kind: TalentKind, rawNodes: RawNode[], grouped: Map<number, TalentChoice[]>) {
  const visibleNodes = rawNodes.filter((raw) => grouped.has(raw.id)).sort((a, b) => a.posY - b.posY || a.posX - b.posX || a.id - b.id);
  const xs = visibleNodes.map((node) => node.posX).filter((value) => value > 0);
  const ys = visibleNodes.map((node) => node.posY).filter((value) => value > 0);
  const minX = xs.length ? Math.min(...xs) : 0; const maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0; const maxY = ys.length ? Math.max(...ys) : 1;
  const yValues = [...new Set(visibleNodes.map((node) => node.posY))].sort((a, b) => a - b);
  const sourceIds = new Set(visibleNodes.map((node) => node.id));
  const nodes = visibleNodes.map((raw) => {
    const choices = [...(grouped.get(raw.id) ?? [])].sort((a, b) => (a.entryIndex ?? 0) - (b.entryIndex ?? 0) || a.externalId - b.externalId);
    const x = maxX === minX ? 50 : 9 + ((raw.posX - minX) / (maxX - minX)) * 82;
    const y = maxY === minY ? 50 : 4 + ((raw.posY - minY) / (maxY - minY)) * 92;
    const rankLevels = Array.isArray(raw.rankLevels) ? raw.rankLevels.map((level) => { const item = asRecord(level); return item ? { level: asNumber(item.level), maxRanks: Math.max(1, asNumber(item.maxRanks, 1)) } : null; }).filter((item): item is { level: number; maxRanks: number } => item !== null) : undefined;
    const requires = asNumberArray(raw.requiresNode);
    return {
      id: `${kind}-${raw.id}`, nodeId: raw.id, x, y, row: yValues.indexOf(raw.posY), column: visibleNodes.filter((node) => node.posY === raw.posY && node.posX < raw.posX).length,
      maxRanks: Math.max(1, asNumber(raw.maxRanks, Math.max(...choices.map((choice) => choice.maxRanks), 1))),
      talentType: raw.type === "choice" ? "choice" : choices[0]?.talentType ?? "passive",
      nodeType: raw.type,
      prevNodeIds: asNumberArray(raw.prev).filter((id) => sourceIds.has(id)), nextNodeIds: asNumberArray(raw.next).filter((id) => sourceIds.has(id)), requiresNodeIds: requires,
      requiredPoints: asNumber(raw.reqPoints) > 0 ? asNumber(raw.reqPoints) : undefined,
      entryNode: Boolean(raw.entryNode), freeNode: Boolean(raw.freeNode), freeLevel: asNumber(raw.freeLevel) || undefined, rankLevels, choices,
    } satisfies TalentNode;
  });
  return { kind, nodes, totalRanks: nodes.reduce((sum, node) => sum + node.maxRanks, 0), sourceNodeCount: visibleNodes.length, sourceEdgeCount: nodes.reduce((sum, node) => sum + node.nextNodeIds.length, 0) } satisfies TalentTree;
}

async function loadMidnightWarriorTalentData(): Promise<TalentCalculatorData> {
  const [summaries, treeEntity, pvpSummaries] = await Promise.all([getAllTalentSummaries(), getTalentTreeEntity(), getAllPvpTalentSummaries()]);
  const topology = readTopology(treeEntity);
  // The catalog decides which build is current: the tree, its talents and PvP
  // talents only have to agree with each other (see the buildId checks above).
  if (!topology || topology.specId !== specId) throw new Error("The active catalog does not contain the verified Midnight Fury topology");
  const [enrichedRaw, pvpRaw] = await Promise.all([
    mapWithConcurrency(summaries, 3, (summary) => enrich(summary, topology)),
    mapWithConcurrency(pvpSummaries, 3, (summary) => enrichPvp(summary, topology)),
  ]);
  const enriched = enrichedRaw.filter((item): item is NonNullable<typeof item> => item !== null);
  const pvpTalents = pvpRaw.filter((item): item is PvPTalent => item !== null).sort((a, b) => a.externalId - b.externalId);
  const grouped = new Map<TalentKind, Map<number, TalentChoice[]>>([['class', new Map()], ['hero', new Map()], ['spec', new Map()]]);
  const seen = new Set<string>();
  for (const item of enriched) {
    const seenKey = `${item.treeKind}:${item.nodeId}:${item.choice.externalId}`;
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    const tree = grouped.get(item.treeKind)!;
    tree.set(item.nodeId, [...(tree.get(item.nodeId) ?? []), item.choice]);
  }
  const trees = {
    class: placeNodes("class", topology.nodes.class, grouped.get("class")!),
    hero: placeNodes("hero", topology.nodes.hero.filter((node) => node.subTreeId === topology.heroSubtreeId), grouped.get("hero")!),
    spec: placeNodes("spec", topology.nodes.spec, grouped.get("spec")!),
  } satisfies Record<TalentKind, TalentTree>;
  const allNodes = Object.values(trees).flatMap((tree) => tree.nodes);
  const allEntries = allNodes.flatMap((node) => node.choices);
  const uniqueEntryIds = new Set(allEntries.map((choice) => choice.externalId));
  const choiceNodes = allNodes.filter((node) => node.nodeType === "choice");
  const tieredNodes = allNodes.filter((node) => node.nodeType === "tiered");
  if (trees.class.nodes.length !== 40 || trees.hero.nodes.length !== 14 || trees.spec.nodes.length !== 38
    || allNodes.length !== 92 || allEntries.length !== 105 || uniqueEntryIds.size !== allEntries.length
    || choiceNodes.length !== 11 || tieredNodes.length !== 1 || tieredNodes[0]?.maxRanks !== 4) {
    throw new Error("The active catalog does not match the verified Midnight Fury talent contract");
  }
  if (pvpTalents.length !== midnightManifest.furyPvpTalentIds.length || new Set(pvpTalents.map((item) => item.externalId)).size !== pvpTalents.length) {
    throw new Error("The active catalog does not match the verified Midnight Fury PvP talent contract");
  }
  for (const tree of Object.values(trees)) {
    const nodeIds = new Set(tree.nodes.map((node) => node.nodeId));
    if (nodeIds.size !== tree.nodes.length || tree.nodes.some((node) => node.nextNodeIds.some((id) => !nodeIds.has(id)))) {
      throw new Error(`Invalid ${tree.kind} talent topology: duplicate or dangling node link`);
    }
  }
  return {
    buildId: topology.buildId, buildVersion: topology.buildVersion, buildNumber: topology.buildNumber,
    className: "Воин", specName: "Неистовство", heroName: topology.heroName, heroSubtreeId: topology.heroSubtreeId,
    heroIconUrl: "https://render.worldofwarcraft.com/us/icons/56/inv_ability_mountainthanewarrior_thorimsmight.jpg", trees,
    pvpTalents,
  };
}

let midnightWarriorTalentDataPromise: Promise<TalentCalculatorData> | null = null;

export function getMidnightWarriorTalentData(): Promise<TalentCalculatorData> {
  if (!midnightWarriorTalentDataPromise) {
    midnightWarriorTalentDataPromise = loadMidnightWarriorTalentData().catch((error) => {
      midnightWarriorTalentDataPromise = null;
      throw error;
    });
  }
  return midnightWarriorTalentDataPromise;
}
