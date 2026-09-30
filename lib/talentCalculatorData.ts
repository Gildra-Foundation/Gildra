import { getCatalogEntity, getCatalogEntityTypes, getCatalogPage, type CatalogRecord, type GameEntity } from "@/lib/api/client";
import { midnightManifest } from "@/lib/midnightManifest";
import { defaultTalentSpecTheme, getTalentSpecTheme, type TalentSpecTheme } from "@/lib/talentSpecThemes";
import { getLocalizedTalentSpells } from "@/lib/wow/localizedTalentSpells";

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
  iconSource: "blizzard-render" | "wowhead" | "fallback";
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
  iconSource: "blizzard-render" | "wowhead" | "fallback";
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
  specId: number;
  buildId: number;
  buildVersion: string;
  buildNumber: number;
  className: string;
  specName: string;
  heroName: string;
  heroSubtreeId: number;
  heroSelectionNodeId: number;
  heroSelectionEntryIndex: number;
  fullNodeOrder: number[];
  loadoutNodes: Array<{ nodeId: number; maxRanks: number; nodeType: TalentNodeType; freeNode: boolean; choiceEntryIds: number[] }>;
  heroIconUrl: string;
  trees: Record<TalentKind, TalentTree>;
  pvpTalents: PvPTalent[];
  source: {
    kind: "official_catalog" | "community_snapshot";
    label: string;
    url: string;
    observedAt: string;
    contentHash?: string;
  };
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
  heroSelectionNodeId: number;
  heroSelectionEntryIndex: number;
  fullNodeOrder: number[];
  heroName: string;
  buildId: number;
  buildVersion: string;
  buildNumber: number;
};

type TalentLocale = "ru_RU" | "en_US";
type TalentLang = "ru" | "en";
const catalogLocale = (lang: TalentLang): TalentLocale => lang === "ru" ? "ru_RU" : "en_US";
const specId = 72;
const facet = "classes/warrior/fury";
const heroSubtreeId = 60;
// Generated from the active Midnight catalog's `owned_by -> specialization`
// relationships. The compact ownership index keeps SSR fast while the talent
// names, descriptions and icons continue to come from the live catalog.
const pvpTalentIdsBySpec: Readonly<Record<number, readonly number[]>> = {
  62: [637, 3529, 5397, 5488, 5491, 5589, 5601, 5661, 5707],
  63: [644, 648, 5389, 5489, 5495, 5588, 5602, 5621, 5706],
  64: [66, 632, 5390, 5490, 5496, 5497, 5581, 5600, 5622, 5708],
  65: [85, 86, 87, 640, 642, 5583, 5618, 5663, 5665, 5674, 5676, 5692],
  66: [90, 91, 92, 94, 97, 844, 860, 861, 3474, 5582, 5664, 5667, 5677],
  70: [81, 752, 753, 5535, 5572, 5573, 5584, 5666, 5675],
  71: [28, 31, 33, 34, 3534, 5372, 5547, 5625, 5679, 5701],
  72: midnightManifest.furyPvpTalentIds,
  73: [24, 168, 171, 173, 175, 831, 833, 845, 5374, 5626, 5627, 5703, 5715],
  102: [180, 184, 185, 834, 836, 3058, 3728, 3731, 5383, 5407, 5515, 5604, 5646],
  103: [201, 203, 601, 611, 612, 620, 820, 3053, 3751, 5384, 5647],
  104: [49, 51, 52, 194, 195, 196, 197, 842, 1237, 3750, 5410, 5648],
  105: [59, 692, 697, 700, 838, 1215, 5514, 5649, 5668, 5687, 5739],
  250: [204, 206, 608, 609, 841, 3441, 3511, 5587, 5592, 5712],
  251: [701, 702, 3439, 3512, 5429, 5435, 5510, 5586, 5591, 5693],
  252: [40, 41, 149, 152, 3746, 5430, 5436, 5511, 5585, 5590],
  253: [693, 824, 1214, 3599, 3604, 3730, 5441, 5444, 5534, 5746],
  254: [651, 653, 659, 660, 3729, 5440, 5533, 5700, 5745],
  255: [661, 662, 664, 665, 686, 3607, 3609, 5443, 5532, 5744],
  256: [100, 109, 111, 114, 123, 126, 5480, 5570, 5635, 5640, 5721],
  257: [101, 108, 112, 124, 1927, 5479, 5569, 5634],
  258: [106, 113, 763, 5447, 5481, 5568, 5636, 5638, 5720],
  259: [141, 147, 830, 3448, 3479, 3480, 5405, 5408, 5530, 5550, 5697],
  260: [129, 138, 139, 145, 853, 1208, 3421, 3483, 3619, 5549, 5699],
  261: [146, 846, 856, 1209, 3447, 3462, 5406, 5409, 5411, 5529, 5698],
  262: [727, 3488, 3490, 3620, 5574, 5659, 5660, 5681, 5724],
  263: [722, 3487, 3489, 3622, 5438, 5575, 5658, 5722],
  264: [708, 714, 715, 3755, 5437, 5567, 5576, 5704, 5705, 5719, 5723],
  265: [15, 16, 18, 19, 5386, 5392, 5546, 5579, 5608, 5662, 5695],
  266: [162, 3506, 3624, 5394, 5545, 5577, 5606, 5694],
  267: [157, 164, 3508, 5382, 5393, 5401, 5580, 5607, 5696],
  268: [666, 667, 669, 670, 672, 673, 765, 843, 1958, 5541],
  269: [77, 3052, 3737, 3744, 3745, 5448, 5641, 5643],
  270: [70, 679, 683, 1928, 5395, 5398, 5539, 5603, 5642],
  577: [805, 806, 811, 812, 813, 1206, 1218, 5433, 5523, 5691],
  581: [814, 815, 816, 819, 1220, 1948, 3423, 3429, 3430, 3727, 5434, 5520, 5521, 5522, 5716],
  1467: [5456, 5460, 5462, 5464, 5467, 5469, 5556, 5617],
  1468: [5455, 5459, 5461, 5463, 5468, 5470, 5595, 5616, 5711, 5718],
  1473: [5454, 5557, 5558, 5560, 5561, 5563, 5564, 5612, 5615, 5619],
  1480: [5728, 5729, 5730, 5731, 5732, 5733, 5734, 5735, 5738],
};
const unavailableOfficialIcons = new Set(["inv121_ability_warrior_javelineer"]);
const unverifiedIconUrl = "/assets/wow/icon-unverified.svg";
const verifiedAlternateIcons = new Map([
  ["inv121_ability_warrior_javelineer", "https://wow.zamimg.com/images/wow/icons/large/8026700.jpg"],
]);

function resolveTalentIcon(iconName: string | undefined, ...candidates: Array<string | undefined>) {
  const alternate = iconName ? verifiedAlternateIcons.get(iconName.toLowerCase()) : undefined;
  if (alternate) return { iconUrl: alternate, iconSource: "wowhead" as const, iconFallback: false };
  if (iconName && unavailableOfficialIcons.has(iconName.toLowerCase())) {
    return { iconUrl: unverifiedIconUrl, iconSource: "fallback" as const, iconFallback: true };
  }
  const preferred = candidates.find((candidate): candidate is string => Boolean(candidate));
  return preferred
    ? { iconUrl: preferred, iconSource: "blizzard-render" as const, iconFallback: false }
    : { iconUrl: unverifiedIconUrl, iconSource: "fallback" as const, iconFallback: true };
}

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

export const cleanTalentDescription = (value: unknown, lang: TalentLang = "ru") => {
  if (lang === "en") return String(value ?? "")
    .replace(/\|c[0-9A-Fa-f]{8}|\|r/g, "")
    .replace(/\$\?[^\[]+\[([^\]]*)\](?:\?[^\[]+\[([^\]]*)\])?(?:\[([^\]]*)\])?/g, (_, first: string, second?: string, third?: string) => first || second || third || "")
    .replace(/\$@(?:spell)?(?:icon|name|desc)\d+/g, "")
    .replace(/\$<[^>]+>|\$\{[^}]+\}|\$[a-zA-Z0-9_<>/-]+/g, "[value depends on character stats]")
    .replace(/\s+/g, " ")
    .trim();
  return String(value ?? "")
  .replace(/(?:\[|\{\{)\s*(\d+(?:[.,]\d+)?)\s*%\s+of\s+(Attack Power|Spell Power|Weapon Damage)\s*(?:\]|\}\})/gi, (_token, amount: string, unit: string) => `${amount}% ${({ "attack power": "силы атаки", "spell power": "силы заклинаний", "weapon damage": "урона оружия" } as Record<string, string>)[unit.toLowerCase()]}`)
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
};

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

function readTopology(entity: GameEntity | null, lang: TalentLang): Topology | null {
  const block = (entity?.tooltip?.blocks ?? []).find((item) => String(item.type ?? "") === "talent_tree_topology") as TooltipBlock | undefined;
  if (!block) return null;
  const subtreeRoot = rawNodes(block.subTreeNodes)[0];
  const subtreeEntries = subtreeRoot?.entries ?? [];
  const hero = subtreeEntries.find((entry) => asNumber(entry.traitSubTreeId) === heroSubtreeId);
  const provenance = (entity?.tooltip?.blocks ?? []).find((item) => String(item.type ?? "") === "provenance") as TooltipBlock | undefined;
  return {
    traitTreeId: asNumber(block.traitTreeId), classId: asNumber(block.classId), specId: asNumber(block.specId),
    className: String(block.className ?? "Warrior"), specName: String(block.specName ?? "Fury"),
    nodes: { class: rawNodes(block.classNodes), hero: rawNodes(block.heroNodes), spec: rawNodes(block.specNodes) },
    heroSubtreeId,
    heroSelectionNodeId: subtreeRoot?.id ?? 0,
    heroSelectionEntryIndex: Math.max(0, subtreeEntries.findIndex((entry) => entry.id === hero?.id)),
    fullNodeOrder: asNumberArray(block.fullNodeOrder),
    heroName: lang === "ru" ? "Истребитель" : "Slayer",
    buildId: asNumber(entity?.buildId, 1),
    buildVersion: String(provenance?.build ?? ""),
    buildNumber: asNumber(provenance?.build_number),
  };
}

async function getAllTalentSummaries(locale: TalentLocale, requestedFacet = facet) {
  const rows: CatalogRecord[] = [];
  let cursor = "";
  for (let page = 0; page < 100; page += 1) {
    const result = await getCatalogPage({ locale, product: "wow", type: "talent", facets: [requestedFacet], cursor, limit: 100, includeTotal: false, fresh: false });
    rows.push(...result.data);
    if (!result.pagination.hasMore || !result.pagination.nextCursor) break;
    cursor = result.pagination.nextCursor;
    if (page === 99) throw new Error("Talent catalog pagination exceeded the safety limit");
  }
  return [...new Map(rows.map((row) => [row.externalId, row])).values()];
}

async function getCatalogTypesWithRecords(locale: TalentLocale) {
  try {
    const types = await getCatalogEntityTypes(locale, "wow");
    return new Set(types.filter((entry) => entry.count > 0).map((entry) => entry.type));
  } catch {
    return new Set<string>();
  }
}

async function getTalentSummariesIfAvailable(locale: TalentLocale, requestedFacet: string) {
  const types = await getCatalogTypesWithRecords(locale);
  if (!types.has("talent")) return [] as CatalogRecord[];
  return getAllTalentSummaries(locale, requestedFacet).catch(() => [] as CatalogRecord[]);
}

async function getTalentTreeEntity(locale: TalentLocale) {
  const page = await getCatalogPage({ locale, product: "wow", type: "talent_tree", limit: 100, includeTotal: false, fresh: false });
  const summary = page.data.find((row) => row.externalId === specId);
  if (!summary) throw new Error(`Talent tree ${specId} is missing from the active Midnight catalog`);
  return getCatalogEntity(summary.id, locale, "", true);
}

const allPvpTalentSummariesPromises = new Map<TalentLocale, Promise<CatalogRecord[]>>();
const pvpTalentSummaryPromises = new Map<string, Promise<CatalogRecord | null>>();

function getPvpTalentSummaryById(externalId: number, locale: TalentLocale) {
  const key = `${locale}:${externalId}`;
  const cached = pvpTalentSummaryPromises.get(key);
  if (cached) return cached;

  const request = getCatalogPage({
    locale,
    product: "wow",
    type: "pvp_talent",
    query: String(externalId),
    limit: 1,
    includeTotal: false,
  }).then((page) => page.data.find((row) => row.externalId === externalId) ?? null).catch((error) => {
    pvpTalentSummaryPromises.delete(key);
    throw error;
  });
  pvpTalentSummaryPromises.set(key, request);
  return request;
}

function getAllPvpTalentSummaries(locale: TalentLocale) {
  const cached = allPvpTalentSummariesPromises.get(locale);
  if (cached) return cached;
  const request = loadAllPvpTalentSummaries(locale).catch((error) => {
    allPvpTalentSummariesPromises.delete(locale);
    throw error;
  });
  allPvpTalentSummariesPromises.set(locale, request);
  return request;
}

async function loadAllPvpTalentSummaries(locale: TalentLocale) {
  const rows: CatalogRecord[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const result = await getCatalogPage({ locale, product: "wow", type: "pvp_talent", cursor, limit: 100, includeTotal: false, fresh: false });
    rows.push(...result.data);
    if (!result.pagination.hasMore || !result.pagination.nextCursor) break;
    cursor = result.pagination.nextCursor;
  }
  return [...new Map(rows.map((row) => [row.externalId, row])).values()];
}

async function getPvpTalentSummariesForSpec(requestedSpecId: number, locale: TalentLocale) {
  const allowed = new Set<number>(pvpTalentIdsBySpec[requestedSpecId] ?? []);
  if (allowed.size === 0) return [];

  // Numeric catalog search resolves an external ID directly. Fetch just this
  // specialization's small index concurrently instead of paging through all
  // PvP talents before SSR can render the calculator.
  const targeted = await mapWithConcurrency([...allowed], 12, async (externalId) => {
    try {
      return await getPvpTalentSummaryById(externalId, locale);
    } catch {
      return null;
    }
  });
  const matches = targeted.filter((row): row is CatalogRecord => row !== null);
  if (matches.length === allowed.size) return matches;

  // Preserve the full-catalog path for older or partially indexed API data.
  return (await getAllPvpTalentSummaries(locale)).filter((row) => allowed.has(row.externalId));
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

async function getEntityWithRetry(id: string, locale: TalentLocale, attempts = 3) {
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

async function enrich(summary: TalentEntityRecord, topology: Topology, locale: TalentLocale) {
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
    const resolvedIcon = resolveTalentIcon(iconName, summary.iconUrl, sourceEntry.icon ? `https://render.worldofwarcraft.com/us/icons/56/${sourceEntry.icon}.jpg` : undefined);
    return {
      treeKind: appearance.treeKind,
      nodeId: appearance.node.id,
      choice: {
        externalId: summary.externalId,
        spellId: sourceEntry.spellId,
        definitionId: sourceEntry.definitionId,
        entryIndex: sourceEntry.index,
        name: summary.name,
        description: cleanTalentDescription(summary.description, locale === "ru_RU" ? "ru" : "en"),
        iconUrl: resolvedIcon.iconUrl,
        iconName,
        iconSource: resolvedIcon.iconSource,
        iconFallback: resolvedIcon.iconFallback,
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
  const resolvedIcon = resolveTalentIcon(iconName, entity.iconUrl, summary.iconUrl, sourceEntry?.icon ? `https://render.worldofwarcraft.com/us/icons/56/${sourceEntry.icon}.jpg` : undefined);
  return {
    treeKind,
    nodeId,
    choice: {
      externalId: summary.externalId,
      spellId: asNumber(info?.spell_id) || sourceEntry?.spellId,
      definitionId: sourceEntry?.definitionId,
      entryIndex: sourceEntry?.index,
      name: entity.name || summary.name,
       description: cleanTalentDescription(description?.text || entity.description || summary.description, locale === "ru_RU" ? "ru" : "en"),
       iconUrl: resolvedIcon.iconUrl,
       iconName,
       iconSource: resolvedIcon.iconSource,
       iconFallback: resolvedIcon.iconFallback,
      maxRanks: Math.max(1, asNumber(info?.max_ranks, sourceEntry?.maxRanks ?? 1)),
      talentType: asTalentType(info?.talent_type),
    } satisfies TalentChoice,
    buildId: asNumber(entity.buildId, topology.buildId),
  };
}

async function enrichPvp(summary: TalentEntityRecord, topology: Topology, locale: TalentLocale): Promise<PvPTalent | null> {
  if (summary.product && summary.product !== "wow") return null;
  if (summary.locale && summary.locale !== locale) return null;
  if (summary.buildId && summary.buildId !== topology.buildId) return null;
  let entity = entityFromSnapshot(summary);
  if (!entity) {
    try { entity = await getEntityWithRetry(summary.id, locale, 1); } catch { entity = null; }
  }
  if (!entity) {
    const resolvedIcon = resolveTalentIcon(summary.iconName, summary.iconUrl);
    return {
      externalId: summary.externalId, name: summary.name, description: cleanTalentDescription(summary.description, locale === "ru_RU" ? "ru" : "en"),
      iconUrl: resolvedIcon.iconUrl, iconName: summary.iconName, iconSource: resolvedIcon.iconSource,
      iconFallback: resolvedIcon.iconFallback, specId, buildId: asNumber(summary.buildId, topology.buildId), buildVersion: topology.buildVersion, sourceUrl: "",
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
  const resolvedIcon = resolveTalentIcon(iconName, entity.iconUrl, summary.iconUrl);
  return {
    externalId: summary.externalId,
    spellId: asNumber(info?.spell_id),
    name: entity.name || summary.name,
    description: cleanTalentDescription(description?.text || entity.description || summary.description, locale === "ru_RU" ? "ru" : "en"),
    iconUrl: resolvedIcon.iconUrl,
    iconName,
    iconSource: resolvedIcon.iconSource,
    iconFallback: resolvedIcon.iconFallback,
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
  const rowByY = new Map(yValues.map((value, index) => [value, index]));
  const columnByNode = new Map<RawNode, number>();
  const nextColumnByY = new Map<number, number>();
  for (let index = 0; index < visibleNodes.length;) {
    const first = visibleNodes[index];
    let end = index + 1;
    while (end < visibleNodes.length
      && visibleNodes[end].posY === first.posY
      && visibleNodes[end].posX === first.posX) end += 1;
    const column = nextColumnByY.get(first.posY) ?? 0;
    for (let groupedIndex = index; groupedIndex < end; groupedIndex += 1) {
      columnByNode.set(visibleNodes[groupedIndex], column);
    }
    nextColumnByY.set(first.posY, column + end - index);
    index = end;
  }
  const sourceIds = new Set(visibleNodes.map((node) => node.id));
  const nodes = visibleNodes.map((raw) => {
    const choices = [...(grouped.get(raw.id) ?? [])].sort((a, b) => (a.entryIndex ?? 0) - (b.entryIndex ?? 0) || a.externalId - b.externalId);
    const x = maxX === minX ? 50 : 9 + ((raw.posX - minX) / (maxX - minX)) * 82;
    const y = maxY === minY ? 50 : 4 + ((raw.posY - minY) / (maxY - minY)) * 92;
    const rankLevels = Array.isArray(raw.rankLevels) ? raw.rankLevels.map((level) => { const item = asRecord(level); return item ? { level: asNumber(item.level), maxRanks: Math.max(1, asNumber(item.maxRanks, 1)) } : null; }).filter((item): item is { level: number; maxRanks: number } => item !== null) : undefined;
    const requires = asNumberArray(raw.requiresNode);
    return {
      id: `${kind}-${raw.id}`, nodeId: raw.id, x, y, row: rowByY.get(raw.posY) ?? 0, column: columnByNode.get(raw) ?? 0,
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

function loadoutNodes(topology: Topology): TalentCalculatorData["loadoutNodes"] {
  return Object.values(topology.nodes).flat().map((node) => ({
    nodeId: node.id,
    maxRanks: Math.max(1, asNumber(node.maxRanks, 1)),
    nodeType: node.type,
    freeNode: Boolean(node.freeNode),
    choiceEntryIds: node.entries.map((entry) => entry.id),
  }));
}

function directChoice(entry: RawEntry, lang: TalentLang, localized?: Pick<CatalogRecord, "name" | "description" | "iconUrl">, fallbackIconUrl = unverifiedIconUrl): TalentChoice {
  const resolvedIcon = resolveTalentIcon(entry.icon, localized?.iconUrl, entry.icon ? `https://render.worldofwarcraft.com/us/icons/56/${entry.icon}.jpg` : undefined);
  return {
    externalId: entry.id,
    spellId: entry.spellId,
    definitionId: entry.definitionId,
    entryIndex: entry.index,
    name: localized?.name || entry.name || `${lang === "ru" ? "Талант" : "Talent"} ${entry.id}`,
    description: cleanTalentDescription(localized?.description, lang) || "",
    iconUrl: resolvedIcon.iconFallback ? fallbackIconUrl : resolvedIcon.iconUrl,
    iconName: entry.icon,
    iconSource: resolvedIcon.iconSource,
    iconFallback: resolvedIcon.iconFallback,
    maxRanks: Math.max(1, entry.maxRanks),
    talentType: asTalentType(entry.type),
  };
}

function directPvpTalent(summary: CatalogRecord, buildVersion: string, buildId: number, requestedSpecId: number, locale: TalentLocale): PvPTalent {
  const officialIcon = summary.iconName ? `https://render.worldofwarcraft.com/us/icons/56/${summary.iconName}.jpg` : undefined;
  const resolvedIcon = resolveTalentIcon(summary.iconName, summary.iconUrl, officialIcon);
  return {
    externalId: summary.externalId,
    name: summary.name,
    description: cleanTalentDescription(summary.description, locale === "ru_RU" ? "ru" : "en"),
    iconUrl: resolvedIcon.iconUrl,
    iconName: summary.iconName,
    iconSource: resolvedIcon.iconSource,
    iconFallback: resolvedIcon.iconFallback,
    specId: requestedSpecId,
    buildId,
    buildVersion,
    sourceUrl: "",
  };
}

type RaidbotsTalentSnapshot = { buildVersion: string; generatedAt: string; contentHash: string; records: unknown[] };
type RaidbotsTalentSnapshotCache = { expiresAt: number; request: Promise<RaidbotsTalentSnapshot> | null };
type RaidbotsTalentGlobal = typeof globalThis & { __gildraRaidbotsTalentSnapshot?: RaidbotsTalentSnapshotCache };
const raidbotsTalentSnapshotCache = (globalThis as RaidbotsTalentGlobal).__gildraRaidbotsTalentSnapshot ??= { expiresAt: 0, request: null };

function getRaidbotsTalentSnapshot(): Promise<RaidbotsTalentSnapshot> {
  if (raidbotsTalentSnapshotCache.request && raidbotsTalentSnapshotCache.expiresAt > Date.now()) {
    return raidbotsTalentSnapshotCache.request;
  }
  if (raidbotsTalentSnapshotCache.expiresAt <= Date.now()) raidbotsTalentSnapshotCache.request = null;
  if (!raidbotsTalentSnapshotCache.request) {
    const request = Promise.all([
      fetch("https://www.raidbots.com/static/data/live/metadata.json", {
        cache: "force-cache",
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch("https://www.raidbots.com/static/data/live/talents.json", {
        // The JSON is larger than Next.js's 2 MB Data Cache item limit. Cache
        // it once per server process instead of attempting a failing disk write.
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }),
    ]).then(async ([metadataResponse, talentsResponse]) => {
      if (!metadataResponse.ok || !talentsResponse.ok) throw new Error("Raidbots talent snapshot is unavailable");
      const metadata = await metadataResponse.json() as { wowBuild?: string; generatedAt?: string; contentHash?: string };
      const records = await talentsResponse.json() as unknown[];
      if (!metadata.wowBuild || !metadata.generatedAt || !metadata.contentHash) {
        throw new Error("Raidbots talent snapshot metadata is incomplete");
      }
      return {
        buildVersion: metadata.wowBuild,
        generatedAt: metadata.generatedAt,
        contentHash: metadata.contentHash,
        records,
      };
    }).then((snapshot) => {
      raidbotsTalentSnapshotCache.expiresAt = Date.now() + 300_000;
      return snapshot;
    }).catch((error) => {
      raidbotsTalentSnapshotCache.expiresAt = 0;
      raidbotsTalentSnapshotCache.request = null;
      throw error;
    });
    raidbotsTalentSnapshotCache.expiresAt = Number.POSITIVE_INFINITY;
    raidbotsTalentSnapshotCache.request = request;
  }
  return raidbotsTalentSnapshotCache.request!;
}

async function loadRaidbotsTalentData(theme: TalentSpecTheme = defaultTalentSpecTheme, heroPathId?: number, lang: TalentLang = "ru", localize = true): Promise<TalentCalculatorData> {
  const locale = catalogLocale(lang);
  const requestedSpecId = theme.specId;
  const requestedHero = theme.heroPaths.find((hero) => hero.id === heroPathId) ?? theme.heroPaths[0];
  const [snapshot, pvpSummaries, talentSummaries] = await Promise.all([
    getRaidbotsTalentSnapshot(),
    getPvpTalentSummariesForSpec(requestedSpecId, locale).catch(() => [] as CatalogRecord[]),
    getTalentSummariesIfAvailable(locale, `classes/${theme.className.toLowerCase().replaceAll(" ", "-")}/${theme.specName.toLowerCase().replaceAll(" ", "-")}`),
  ]);
  const record = snapshot.records.map(asRecord).find((item) => asNumber(item?.specId) === requestedSpecId);
  if (!record) throw new Error(`Raidbots talent tree ${requestedSpecId} is unavailable`);
  const nodes = { class: rawNodes(record.classNodes), hero: rawNodes(record.heroNodes), spec: rawNodes(record.specNodes) };
  const selector = rawNodes(record.subTreeNodes)[0];
  const selectorEntries = selector?.entries ?? [];
  const heroEntry = selectorEntries.find((entry) => asNumber(entry.traitSubTreeId) === requestedHero.id) ?? selectorEntries[0];
  const selectedHeroSubtreeId = asNumber(heroEntry?.traitSubTreeId, requestedHero.id);
  const selectedHeroTheme = theme.heroPaths.find((hero) => hero.id === selectedHeroSubtreeId) ?? requestedHero;
  const buildVersion = snapshot.buildVersion;
  const topology: Topology = {
    traitTreeId: asNumber(record.traitTreeId), classId: asNumber(record.classId), specId: requestedSpecId,
    className: String(record.className ?? theme.className), specName: String(record.specName ?? theme.specName), nodes,
    heroSubtreeId: selectedHeroSubtreeId,
    heroSelectionNodeId: selector?.id ?? 0,
    heroSelectionEntryIndex: Math.max(0, selectorEntries.findIndex((entry) => entry.id === heroEntry?.id)),
    fullNodeOrder: asNumberArray(record.fullNodeOrder),
    heroName: lang === "ru" ? selectedHeroTheme.nameRu : selectedHeroTheme.name,
    buildId: Number(buildVersion.split(".").at(-1)) || 1,
    buildVersion,
    buildNumber: Number(buildVersion.split(".").at(-1)) || 1,
  };
  const localizedTalents = new Map(talentSummaries.map((entry) => [entry.externalId, entry]));
  const missingSpellIds = lang === "ru" ? Object.entries(nodes).flatMap(([kind, raw]) => raw
    .filter((node) => kind !== "hero" || asNumber(node.subTreeId) === selectedHeroSubtreeId)
    .flatMap((node) => node.entries.filter((entry) => !/[А-Яа-яЁё]/.test(localizedTalents.get(entry.id)?.name ?? "")).map((entry) => entry.spellId ?? 0))) : [];
  // Talent pages can render the complete tree from the Raidbots snapshot
  // immediately and fetch optional Wowhead translations after hydration.
  // API consumers still wait for full localization by default.
  const localizedSpells = localize
    ? await getLocalizedTalentSpells(missingSpellIds, lang)
    : new Map<number, { name: string; description: string }>();
  const grouped = new Map<TalentKind, Map<number, TalentChoice[]>>([['class', new Map()], ['hero', new Map()], ['spec', new Map()]]);
  for (const [kind, raw] of Object.entries(nodes) as [TalentKind, RawNode[]][]) {
    for (const node of raw) {
      if (kind === "hero" && asNumber(node.subTreeId) !== selectedHeroSubtreeId) continue;
      grouped.get(kind)!.set(node.id, node.entries.map((entry) => directChoice(entry, lang, localizedSpells.get(entry.spellId ?? 0) ?? localizedTalents.get(entry.id))));
    }
  }
  const trees = {
    class: placeNodes("class", nodes.class, grouped.get("class")!),
    hero: placeNodes("hero", nodes.hero.filter((node) => asNumber(node.subTreeId) === selectedHeroSubtreeId), grouped.get("hero")!),
    spec: placeNodes("spec", nodes.spec, grouped.get("spec")!),
  } satisfies Record<TalentKind, TalentTree>;
  if (!topology.fullNodeOrder.length || !trees.class.nodes.length || !trees.hero.nodes.length || !trees.spec.nodes.length) {
    throw new Error(`Raidbots ${theme.specName} talent snapshot has an unexpected shape`);
  }
  const pvpTalents = pvpSummaries
    .map((summary) => directPvpTalent(summary, topology.buildVersion, topology.buildId, requestedSpecId, locale))
    .sort((a, b) => a.externalId - b.externalId);
  return {
    specId: requestedSpecId, buildId: topology.buildId, buildVersion, buildNumber: topology.buildNumber,
    className: lang === "ru" ? theme.classNameRu : theme.className, specName: lang === "ru" ? theme.specNameRu : theme.specName, heroName: topology.heroName, heroSubtreeId: selectedHeroSubtreeId,
    heroSelectionNodeId: topology.heroSelectionNodeId, heroSelectionEntryIndex: topology.heroSelectionEntryIndex,
    fullNodeOrder: topology.fullNodeOrder, loadoutNodes: loadoutNodes(topology),
    heroIconUrl: "https://render.worldofwarcraft.com/us/icons/56/inv_ability_slayerwarrior_slayersdominance.jpg",
    trees, pvpTalents,
    source: {
      kind: "community_snapshot",
      label: lang === "ru" ? `Актуальный снимок талантов Raidbots${localizedSpells.size ? " · названия и описания Wowhead" : ""}` : "Raidbots live talent snapshot",
      url: "https://www.raidbots.com/static/data/live/talents.json",
      observedAt: snapshot.generatedAt,
      contentHash: snapshot.contentHash,
    },
  };
}

async function loadMidnightWarriorTalentData(lang: TalentLang): Promise<TalentCalculatorData> {
  const locale = catalogLocale(lang);
  const availableTypes = await getCatalogTypesWithRecords(locale);
  if (!availableTypes.has("talent") || !availableTypes.has("talent_tree")) {
    throw new Error("The active catalog does not publish talent summaries and topology");
  }
  const [summaries, treeEntity, pvpSummaries] = await Promise.all([getAllTalentSummaries(locale), getTalentTreeEntity(locale), getPvpTalentSummariesForSpec(specId, locale)]);
  const topology = readTopology(treeEntity, lang);
  // The catalog decides which build is current: the tree, its talents and PvP
  // talents only have to agree with each other (see the buildId checks above).
  if (!topology || topology.specId !== specId) throw new Error("The active catalog does not contain the verified Midnight Fury topology");
  const [enrichedRaw, pvpRaw] = await Promise.all([
    mapWithConcurrency(summaries, 3, (summary) => enrich(summary, topology, locale)),
    mapWithConcurrency(pvpSummaries, 3, (summary) => enrichPvp(summary, topology, locale)),
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
    specId: topology.specId,
    buildId: topology.buildId, buildVersion: topology.buildVersion, buildNumber: topology.buildNumber,
    className: lang === "ru" ? "Воин" : "Warrior", specName: lang === "ru" ? "Неистовство" : "Fury", heroName: topology.heroName, heroSubtreeId: topology.heroSubtreeId,
    heroSelectionNodeId: topology.heroSelectionNodeId,
    heroSelectionEntryIndex: topology.heroSelectionEntryIndex,
    fullNodeOrder: topology.fullNodeOrder,
    loadoutNodes: loadoutNodes(topology),
    heroIconUrl: "https://render.worldofwarcraft.com/us/icons/56/inv_ability_slayerwarrior_slayersdominance.jpg", trees,
    pvpTalents,
    source: {
      kind: "official_catalog",
      label: lang === "ru" ? "Каталог Gildra на основе данных Blizzard" : "Gildra Blizzard-backed catalog",
      url: "https://api.gildra.net/v1/game/entity-summaries",
      observedAt: new Date().toISOString(),
    },
  };
}

const midnightWarriorTalentDataPromises = new Map<TalentLang, Promise<TalentCalculatorData>>();

function loadCatalogWithDeadline(lang: TalentLang, milliseconds = 15_000) {
  return new Promise<TalentCalculatorData>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local talent catalog did not answer in time")), milliseconds);
    loadMidnightWarriorTalentData(lang).then(
      (data) => { clearTimeout(timer); resolve(data); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function getMidnightWarriorTalentData(lang: TalentLang = "ru"): Promise<TalentCalculatorData> {
  const cached = midnightWarriorTalentDataPromises.get(lang);
  if (cached) return cached;
  const request = loadCatalogWithDeadline(lang)
    .catch(() => loadRaidbotsTalentData(defaultTalentSpecTheme, heroSubtreeId, lang))
    .catch((error) => {
      midnightWarriorTalentDataPromises.delete(lang);
      throw error;
    });
  midnightWarriorTalentDataPromises.set(lang, request);
  return request;
}

const midnightTalentDataPromises = new Map<string, Promise<TalentCalculatorData>>();

const talentPageDataPromises = new Map<string, Promise<TalentCalculatorData>>();

/** Load page data without making the first render wait on dozens of tooltip requests. */
export function getMidnightTalentPageData(specSlug: string, heroPathId?: number, lang: TalentLang = "ru"): Promise<TalentCalculatorData> {
  const theme = getTalentSpecTheme(specSlug);
  if (!theme) return Promise.reject(new Error(`Unknown talent specialization: ${specSlug}`));
  const requestedHeroId = theme.heroPaths.some((hero) => hero.id === heroPathId)
    ? heroPathId
    : theme.specId === specId ? heroSubtreeId : theme.heroPaths[0].id;
  const cacheKey = `${lang}:${theme.slug}:${requestedHeroId}`;
  const cached = talentPageDataPromises.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    // Preserve the verified catalog source for Fury Warrior when it is
    // available. Other trees use the public Raidbots snapshot as before.
    if (theme.specId === specId && requestedHeroId === heroSubtreeId) {
      try {
        return await loadMidnightWarriorTalentData(lang);
      } catch {
        // Fall back to the provenance-marked community snapshot below.
      }
    }
    return loadRaidbotsTalentData(theme, requestedHeroId, lang, false);
  })().catch((error) => {
    talentPageDataPromises.delete(cacheKey);
    throw error;
  });
  talentPageDataPromises.set(cacheKey, request);
  return request;
}

export function getMidnightTalentData(specSlug: string, heroPathId?: number, lang: TalentLang = "ru"): Promise<TalentCalculatorData> {
  const theme = getTalentSpecTheme(specSlug);
  if (!theme) return Promise.reject(new Error(`Unknown talent specialization: ${specSlug}`));
  const requestedHeroId = theme.heroPaths.some((hero) => hero.id === heroPathId)
    ? heroPathId
    : theme.specId === specId ? heroSubtreeId : theme.heroPaths[0].id;
  if (theme.specId === specId && requestedHeroId === heroSubtreeId) return getMidnightWarriorTalentData(lang);
  const cacheKey = `${lang}:${theme.slug}:${requestedHeroId}`;
  const cached = midnightTalentDataPromises.get(cacheKey);
  if (cached) return cached;
  const request = loadRaidbotsTalentData(theme, requestedHeroId, lang).catch((error) => {
    midnightTalentDataPromises.delete(cacheKey);
    throw error;
  });
  midnightTalentDataPromises.set(cacheKey, request);
  return request;
}
