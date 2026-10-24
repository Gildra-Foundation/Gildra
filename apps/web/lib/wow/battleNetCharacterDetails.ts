import type { BattleNetCharacter } from "./battleNetCharacters";

type Localized = { name?: string; type?: string };
type RawValue = { value?: number; display_string?: string };
type RawItem = {
  item?: { id?: number };
  slot?: Localized;
  name?: string;
  quality?: Localized;
  level?: RawValue;
  media?: { key?: { href?: string } };
  stats?: Array<{ type?: Localized; value?: number; display?: { display_string?: string } }>;
  enchantments?: Array<{ display_string?: string; enchantment_id?: number }>;
  sockets?: Array<{ socket_type?: Localized; item?: { id?: number; name?: string }; display_string?: string }>;
  set?: { display_string?: string };
  modified_appearance_id?: number;
};
type RawAppearanceItem = {
  id?: number;
  slot?: Localized;
  secondary_id?: number;
};
type RawAppearance = {
  items?: RawAppearanceItem[];
  customizations?: Array<{ option?: { id?: number }; choice?: { id?: number } }>;
};
type RawSpecializations = {
  active_specialization?: { id?: number };
  active_hero_talent_tree?: { id?: number };
  specializations?: Array<{
    specialization?: { id?: number };
    loadouts?: Array<{ is_active?: boolean; talent_loadout_code?: string }>;
  }>;
};

export type BattleNetSimulationSnapshot = {
  profile: Record<string, unknown>;
  specializations: Record<string, unknown>;
  equipment: Record<string, unknown>;
  activeSpecializationId: number;
  activeTalentLoadout: string;
  activeHeroTalentTreeId?: number;
};

export type CharacterGearItem = {
  id: number; slot: string; slotType: string; name: string; quality: string; itemLevel: number;
  iconUrl?: string; stats: string[]; enchantments: string[]; sockets: Array<{ filled: boolean; label: string }>;
  setName?: string;
  appearanceId?: number;
  modificationIds?: { enchantments: number[]; gems: number[] };
};

export type CharacterRecommendation = { tone: "critical" | "recommended" | "good"; title: string; detail: string; slots: string[] };

export type BattleNetCharacterDetails = {
  character: BattleNetCharacter;
  activeSpec?: string;
  unavailableSections?: Array<"equipment" | "statistics" | "talents" | "raids">;
  availableProfileFields?: string[];
  averageItemLevel: number;
  equippedItemLevel: number;
  achievementPoints: number;
  lastLogin?: number;
  avatarUrl?: string;
  renderUrl?: string;
  mythicRating?: number;
  raidProgress?: Array<{ id: number; name: string; difficulty: string; completed: number; total: number }>;
  stats: Array<{ key: string; label: string; value: string; rawValue: number }>;
  equipment: CharacterGearItem[];
  modelItems: Array<[slot: number, displayId: number]>;
  customizations: Array<{ optionId: number; choiceId: number }>;
  activeTalentLoadout?: string;
  activeHeroTalentTreeId?: number;
  recommendations: CharacterRecommendation[];
  updatedAt: string;
};

export type BattleNetCharacterDataErrorCode = "expired" | "forbidden" | "rate_limited" | "not_found" | "incomplete" | "unavailable";

export class BattleNetCharacterDataError extends Error {
  readonly code: BattleNetCharacterDataErrorCode;
  readonly status: number;
  readonly endpoint: string;

  constructor(code: BattleNetCharacterDataErrorCode, status: number, endpoint: string) {
    super(`Battle.net ${endpoint} request failed: ${code} (${status})`);
    this.code = code;
    this.status = status;
    this.endpoint = endpoint;
  }
}

export { characterSlug } from "./characterSlug.ts";

async function api<T>(url: string, token: string, signal?: AbortSignal): Promise<T | null> {
  signal?.throwIfAborted();
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
    return response.ok ? await response.json() as T : null;
  } catch { signal?.throwIfAborted(); return null; }
}

async function requiredApi<T>(url: string, token: string, endpoint: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new BattleNetCharacterDataError("unavailable", 503, endpoint);
  }
  if (!response.ok) {
    const code: BattleNetCharacterDataErrorCode = response.status === 401 ? "expired"
      : response.status === 403 ? "forbidden"
      : response.status === 404 ? "not_found"
      : response.status === 429 ? "rate_limited"
      : "unavailable";
    throw new BattleNetCharacterDataError(code, response.status >= 500 ? response.status : response.status, endpoint);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new BattleNetCharacterDataError("incomplete", 422, endpoint);
  }
}

export async function getBattleNetSimulationSnapshot(token: string, character: BattleNetCharacter, signal?: AbortSignal): Promise<BattleNetSimulationSnapshot> {
  const region = character.region;
  const root = `https://${region}.api.blizzard.com/profile/wow/character/${character.realm.slug}/${encodeURIComponent(character.name.toLowerCase())}`;
  const [profile, specializations, equipment] = await Promise.all([
    api<Record<string, unknown>>(withLocale(root, region, "en"), token, signal),
    api<RawSpecializations & Record<string, unknown>>(withLocale(`${root}/specializations`, region, "en"), token, signal),
    api<Record<string, unknown>>(withLocale(`${root}/equipment`, region, "en"), token, signal),
  ]);
  if (!profile || !specializations || !equipment) throw new Error("Battle.net character simulation data is incomplete");
  const activeSpecializationId = specializations.active_specialization?.id ?? 0;
  const activeSpecialization = specializations.specializations?.find((entry) => entry.specialization?.id === activeSpecializationId);
  const activeTalentLoadout = activeSpecialization?.loadouts?.find((loadout) => loadout.is_active)?.talent_loadout_code ?? "";
  if (!activeSpecializationId || !activeSpecialization || !activeTalentLoadout) throw new Error("Battle.net did not return an active talent loadout");

  // SimulationCraft supports Blizzard Profile API JSON through local_json. Saved loadouts
  // are removed because the candidate export string is supplied explicitly for every run.
  // https://github.com/simulationcraft/simc/wiki/Characters#loading-characters-from-local-json-files
  const simulationSpecializations = {
    _links: specializations._links,
    character: specializations.character,
    active_specialization: specializations.active_specialization,
    active_hero_talent_tree: specializations.active_hero_talent_tree,
    specializations: [{ ...activeSpecialization, loadouts: [] }],
  };
  return {
    profile,
    specializations: simulationSpecializations,
    equipment,
    activeSpecializationId,
    activeTalentLoadout,
    activeHeroTalentTreeId: specializations.active_hero_talent_tree?.id,
  };
}

function withLocale(url: string, region: string, locale: "en" | "ru") {
  const result = new URL(url);
  if (!result.searchParams.has("namespace")) result.searchParams.set("namespace", `profile-${region}`);
  result.searchParams.set("locale", locale === "ru" && region === "eu" ? "ru_RU" : region === "us" ? "en_US" : "en_GB");
  return result.toString();
}

const modelSlotIds: Record<string, number> = {
  HEAD: 1,
  SHOULDER: 3,
  SHIRT: 4,
  CHEST: 5,
  WAIST: 6,
  LEGS: 7,
  FEET: 8,
  WRIST: 9,
  HANDS: 10,
  BACK: 16,
  TABARD: 19,
  MAIN_HAND: 21,
  OFF_HAND: 22,
};

async function wowheadDisplayId(itemId: number): Promise<number | null> {
  try {
    const response = await fetch(`https://www.wowhead.com/item=${itemId}&xml`, {
      headers: { "User-Agent": "Gildra character model importer" },
      next: { revalidate: 604_800 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const xml = await response.text();
    const displayId = Number(xml.match(/<icon\s+displayId="(\d+)"/)?.[1] ?? 0);
    return displayId > 0 ? displayId : null;
  } catch {
    return null;
  }
}

async function modelItemsFromAppearance(appearance: RawAppearance | null): Promise<Array<[slot: number, displayId: number]>> {
  const displayIds = new Map<number, Promise<number | null>>();
  return Promise.all((appearance?.items ?? []).map(async (item) => {
    const itemId = item.id ?? 0;
    const slot = modelSlotIds[item.slot?.type ?? ""];
    if (!itemId || !slot) return null;
    if (!displayIds.has(itemId)) displayIds.set(itemId, wowheadDisplayId(itemId));
    const displayId = await displayIds.get(itemId)!;
    return displayId ? [slot, displayId] as [number, number] : null;
  })).then((items) => items.filter((item): item is [number, number] => item !== null));
}

/** Resolve the optional 3D equipment only when the reader opens the model viewport. */
export async function getBattleNetCharacterModelItems(token: string, character: BattleNetCharacter, locale: "en" | "ru") {
  const region = character.region;
  const root = `https://${region}.api.blizzard.com/profile/wow/character/${character.realm.slug}/${encodeURIComponent(character.name.toLowerCase())}`;
  const appearance = await api<RawAppearance>(withLocale(`${root}/appearance`, region, locale), token);
  return modelItemsFromAppearance(appearance);
}

function recommendations(items: CharacterGearItem[], average: number, locale: "en" | "ru"): CharacterRecommendation[] {
  const ru = locale === "ru";
  const low = items.filter((item) => item.itemLevel > 0 && item.itemLevel <= average - 8).sort((a, b) => a.itemLevel - b.itemLevel);
  const emptySockets = items.filter((item) => item.sockets.some((socket) => !socket.filled));
  const enchantable = new Set(["BACK", "CHEST", "WRIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "MAIN_HAND", "OFF_HAND"]);
  const unenchanted = items.filter((item) => enchantable.has(item.slotType) && item.enchantments.length === 0);
  const result: CharacterRecommendation[] = [];
  if (low.length) result.push({ tone: "critical", title: ru ? "Сначала замените слабые слоты" : "Replace low-level slots first", detail: ru ? `Эти предметы отстают от среднего уровня экипировки минимум на 8: ${low.map((item) => `${item.slot} ${item.itemLevel}`).join(", ")}.` : `These items trail your average item level by at least 8: ${low.map((item) => `${item.slot} ${item.itemLevel}`).join(", ")}.`, slots: low.map((item) => item.slot) });
  if (emptySockets.length) result.push({ tone: "critical", title: ru ? "Заполните пустые сокеты" : "Fill empty sockets", detail: ru ? "Пустой сокет — гарантированно неиспользуемый бонус характеристики." : "An empty socket is a guaranteed unused stat bonus.", slots: emptySockets.map((item) => item.slot) });
  if (unenchanted.length) result.push({ tone: "recommended", title: ru ? "Проверьте чары" : "Check enchantments", detail: ru ? "На этих зачаровываемых слотах Blizzard API не показывает активных чар. Подберите актуальные чары под специализацию." : "Blizzard API reports no active enchantment on these enchantable slots. Choose current enchants for your specialization.", slots: unenchanted.map((item) => item.slot) });
  if (!result.length) result.push({ tone: "good", title: ru ? "Явных проблем не найдено" : "No obvious issues found", detail: ru ? "Все сокеты заполнены, зачаровываемые слоты обработаны, сильного провала по уровню предметов нет." : "Sockets are filled, enchantable slots are covered, and no item-level outlier was found.", slots: [] });
  return result;
}

export async function getBattleNetCharacterDetails(token: string, character: BattleNetCharacter, locale: "en" | "ru", allowPartial = false): Promise<BattleNetCharacterDetails> {
  const region = character.region;
  const root = `https://${region}.api.blizzard.com/profile/wow/character/${character.realm.slug}/${encodeURIComponent(character.name.toLowerCase())}`;
  // Raw Blizzard profile JSON (profile, statistics, Mythic+) is read field by field below.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [profile, equipmentResponse, appearance, specializations, statistics, media, mythic, raids] = await Promise.all([
    requiredApi<any>(withLocale(root, region, locale), token, "profile"),
    allowPartial ? api<{ equipped_items?: RawItem[] }>(withLocale(`${root}/equipment`, region, locale), token) : requiredApi<{ equipped_items?: RawItem[] }>(withLocale(`${root}/equipment`, region, locale), token, "equipment"),
    api<RawAppearance>(withLocale(`${root}/appearance`, region, locale), token),
    allowPartial ? api<RawSpecializations>(withLocale(`${root}/specializations`, region, locale), token) : requiredApi<RawSpecializations>(withLocale(`${root}/specializations`, region, locale), token, "specializations"),
    allowPartial ? api<Record<string, any>>(withLocale(`${root}/statistics`, region, locale), token) : requiredApi<Record<string, any>>(withLocale(`${root}/statistics`, region, locale), token, "statistics"),
    api<{ assets?: Array<{ key?: string; value?: string }> }>(withLocale(`${root}/character-media`, region, locale), token),
    api<any>(withLocale(`${root}/mythic-keystone-profile`, region, locale), token),
    api<{ expansions?: Array<{ instances?: Array<{ instance: { id: number; name: string }; modes?: Array<{ difficulty: { name: string }; progress: { completed_count: number; total_count: number } }> }> }> }>(withLocale(`${root}/encounters/raids`, region, locale), token),
  ]);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const rawItems = equipmentResponse?.equipped_items ?? [];
  if (!profile?.id || (!allowPartial && (!profile?.active_spec?.name || !rawItems.length || !specializations?.active_specialization?.id))) {
    throw new BattleNetCharacterDataError("incomplete", 422, !rawItems.length ? "equipment" : "profile");
  }
  const customizations = (appearance?.customizations ?? []).flatMap((customization) => {
    const optionId = customization.option?.id;
    const choiceId = customization.choice?.id;
    return optionId && choiceId ? [{ optionId, choiceId }] : [];
  });
  const activeSpecId = specializations?.active_specialization?.id;
  const activeTalentLoadout = specializations?.specializations
    ?.find((entry) => entry.specialization?.id === activeSpecId)
    ?.loadouts?.find((loadout) => loadout.is_active)?.talent_loadout_code;
  const equipmentPromise = Promise.all(rawItems.map(async (item): Promise<CharacterGearItem> => {
    const mediaData = item.media?.key?.href ? await api<{ assets?: Array<{ key?: string; value?: string }> }>(withLocale(item.media.key.href, region, locale), token) : null;
    return {
      id: item.item?.id ?? 0, slot: item.slot?.name ?? item.slot?.type ?? "—", slotType: item.slot?.type ?? "UNKNOWN",
      name: item.name ?? `${locale === "ru" ? "Предмет" : "Item"} #${item.item?.id ?? ""}`, quality: item.quality?.type || item.quality?.name || "", itemLevel: item.level?.value ?? 0,
      iconUrl: mediaData?.assets?.find((asset) => asset.key === "icon")?.value,
      stats: (item.stats ?? []).map((stat) => stat.display?.display_string ?? `${stat.type?.name ?? stat.type?.type ?? ""} ${stat.value ?? ""}`.trim()),
      enchantments: (item.enchantments ?? []).map((entry) => entry.display_string ?? `#${entry.enchantment_id}`).filter(Boolean),
      sockets: (item.sockets ?? []).map((socket) => ({ filled: Boolean(socket.item), label: socket.item?.name ?? socket.display_string ?? socket.socket_type?.name ?? (locale === "ru" ? "Гнездо" : "Socket") })),
      setName: item.set?.display_string,
      appearanceId: item.modified_appearance_id,
      modificationIds: {
        enchantments: (item.enchantments ?? []).map((entry) => entry.enchantment_id ?? 0).sort((a, b) => a - b),
        gems: (item.sockets ?? []).map((socket) => socket.item?.id ?? 0),
      },
    };
  }));
  const equipment = await equipmentPromise;
  const stat = (key: string) => statistics?.[key];
  const number = (key: string): number | undefined => {
    const value = typeof stat(key) === "number" ? stat(key) : stat(key)?.effective ?? stat(key)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const percent = (key: string): number | undefined => stat(key)?.value ?? stat(key)?.rating_bonus ?? number(key);
  const ru = locale === "ru";
  const stats: BattleNetCharacterDetails["stats"] = [];
  for (const [key, label] of [["strength", ru ? "Сила" : "Strength"], ["agility", ru ? "Ловкость" : "Agility"], ["intellect", ru ? "Интеллект" : "Intellect"], ["stamina", ru ? "Выносливость" : "Stamina"]]) {
    const value = number(key);
    if (value !== undefined) stats.push({key, label, rawValue: value, value: value.toLocaleString(ru ? "ru-RU" : "en-US")});
  }
  const secondary: Array<[string, string, number | undefined]> = [
    ["crit", ru ? "Критический удар" : "Critical strike", percent("melee_crit") ?? percent("spell_crit")],
    ["haste", ru ? "Скорость" : "Haste", percent("melee_haste") ?? percent("spell_haste")],
    ["mastery", ru ? "Искусность" : "Mastery", percent("mastery")],
    ["versatility", ru ? "Универсальность" : "Versatility", number("versatility_damage_done_bonus")],
  ];
  for (const [key,label,value] of secondary) if (typeof value === "number" && Number.isFinite(value)) stats.push({key,label,rawValue:value,value:`${value.toFixed(1)}%`});
  const averageItemLevel = Number(profile?.average_item_level ?? 0);
  return {
    unavailableSections: [!equipmentResponse && "equipment", !statistics && "statistics", !specializations && "talents", !raids && "raids"].filter(Boolean) as BattleNetCharacterDetails["unavailableSections"],
    availableProfileFields: Object.keys(profile),
    character, activeSpec: profile?.active_spec?.name, averageItemLevel, equippedItemLevel: Number(profile?.equipped_item_level ?? averageItemLevel), achievementPoints: Number(profile?.achievement_points ?? 0), lastLogin: profile?.last_login_timestamp,
    avatarUrl: media?.assets?.find((asset) => asset.key === "avatar")?.value, renderUrl: media?.assets?.find((asset) => asset.key === "main-raw" || asset.key === "main")?.value,
    mythicRating: mythic?.current_mythic_rating?.rating,
    raidProgress: raids?.expansions?.flatMap(expansion => (expansion.instances ?? []).flatMap(instance => (instance.modes ?? []).map(mode => ({ id: instance.instance.id, name: instance.instance.name, difficulty: mode.difficulty.name, completed: mode.progress.completed_count, total: mode.progress.total_count })))),
    stats, equipment, modelItems: [], customizations, activeTalentLoadout,
    activeHeroTalentTreeId: specializations?.active_hero_talent_tree?.id,
    recommendations: recommendations(equipment, averageItemLevel, locale), updatedAt: new Date().toISOString(),
  };
}
