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
  averageItemLevel: number;
  equippedItemLevel: number;
  achievementPoints: number;
  lastLogin?: number;
  avatarUrl?: string;
  renderUrl?: string;
  mythicRating?: number;
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

export function characterSlug(character: Pick<BattleNetCharacter, "region" | "realm" | "name">) {
  return `${character.region}--${character.realm.slug}--${encodeURIComponent(character.name.toLowerCase())}`;
}

async function api<T>(url: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    return response.ok ? await response.json() as T : null;
  } catch { return null; }
}

async function requiredApi<T>(url: string, token: string, endpoint: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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

export async function getBattleNetSimulationSnapshot(token: string, character: BattleNetCharacter): Promise<BattleNetSimulationSnapshot> {
  const region = character.region;
  const root = `https://${region}.api.blizzard.com/profile/wow/character/${character.realm.slug}/${encodeURIComponent(character.name.toLowerCase())}`;
  const [profile, specializations, equipment] = await Promise.all([
    api<Record<string, unknown>>(withLocale(root, region, "en"), token),
    api<RawSpecializations & Record<string, unknown>>(withLocale(`${root}/specializations`, region, "en"), token),
    api<Record<string, unknown>>(withLocale(`${root}/equipment`, region, "en"), token),
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

export async function getBattleNetCharacterDetails(token: string, character: BattleNetCharacter, locale: "en" | "ru"): Promise<BattleNetCharacterDetails> {
  const region = character.region;
  const root = `https://${region}.api.blizzard.com/profile/wow/character/${character.realm.slug}/${encodeURIComponent(character.name.toLowerCase())}`;
  const [profile, equipmentResponse, appearance, specializations, statistics, media, mythic] = await Promise.all([
    requiredApi<any>(withLocale(root, region, locale), token, "profile"),
    requiredApi<{ equipped_items?: RawItem[] }>(withLocale(`${root}/equipment`, region, locale), token, "equipment"),
    api<RawAppearance>(withLocale(`${root}/appearance`, region, locale), token),
    requiredApi<RawSpecializations>(withLocale(`${root}/specializations`, region, locale), token, "specializations"),
    requiredApi<Record<string, any>>(withLocale(`${root}/statistics`, region, locale), token, "statistics"),
    api<{ assets?: Array<{ key?: string; value?: string }> }>(withLocale(`${root}/character-media`, region, locale), token),
    api<any>(withLocale(`${root}/mythic-keystone-profile`, region, locale), token),
  ]);
  const rawItems = equipmentResponse?.equipped_items ?? [];
  if (!profile?.id || !profile?.active_spec?.name || !rawItems.length || !specializations.active_specialization?.id) {
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
      name: item.name ?? `Item ${item.item?.id ?? ""}`, quality: item.quality?.type || item.quality?.name || "", itemLevel: item.level?.value ?? 0,
      iconUrl: mediaData?.assets?.find((asset) => asset.key === "icon")?.value,
      stats: (item.stats ?? []).map((stat) => stat.display?.display_string ?? `${stat.type?.name ?? stat.type?.type ?? ""} ${stat.value ?? ""}`.trim()),
      enchantments: (item.enchantments ?? []).map((entry) => entry.display_string ?? `#${entry.enchantment_id}`).filter(Boolean),
      sockets: (item.sockets ?? []).map((socket) => ({ filled: Boolean(socket.item), label: socket.item?.name ?? socket.display_string ?? socket.socket_type?.name ?? "Socket" })),
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
  const number = (key: string) => typeof stat(key) === "number" ? stat(key) : stat(key)?.effective ?? stat(key)?.value ?? 0;
  const percent = (key: string) => stat(key)?.value ?? stat(key)?.rating_bonus ?? number(key);
  const ru = locale === "ru";
  const stats = [
    ["strength", ru ? "Сила" : "Strength", number("strength")], ["agility", ru ? "Ловкость" : "Agility", number("agility")], ["intellect", ru ? "Интеллект" : "Intellect", number("intellect")], ["stamina", ru ? "Выносливость" : "Stamina", number("stamina")],
  ].filter(([, , value]) => Number(value) > 0).map(([key, label, value]) => ({ key: String(key), label: String(label), value: Number(value).toLocaleString(locale === "ru" ? "ru-RU" : "en-US"), rawValue: Number(value) }));
  stats.push(
    { key: "crit", label: ru ? "Критический удар" : "Critical strike", value: `${Number(percent("melee_crit") || percent("spell_crit") || 0).toFixed(1)}%`, rawValue: Number(percent("melee_crit") || percent("spell_crit") || 0) },
    { key: "haste", label: ru ? "Скорость" : "Haste", value: `${Number(percent("melee_haste") || percent("spell_haste") || 0).toFixed(1)}%`, rawValue: Number(percent("melee_haste") || percent("spell_haste") || 0) },
    { key: "mastery", label: ru ? "Искусность" : "Mastery", value: `${Number(stat("mastery")?.value ?? stat("mastery")?.rating_bonus ?? 0).toFixed(1)}%`, rawValue: Number(stat("mastery")?.value ?? stat("mastery")?.rating_bonus ?? 0) },
    { key: "versatility", label: ru ? "Универсальность" : "Versatility", value: `${Number(stat("versatility_damage_done_bonus") ?? 0).toFixed(1)}%`, rawValue: Number(stat("versatility_damage_done_bonus") ?? 0) },
  );
  const averageItemLevel = Number(profile?.average_item_level ?? 0);
  return {
    character, activeSpec: profile?.active_spec?.name, averageItemLevel, equippedItemLevel: Number(profile?.equipped_item_level ?? averageItemLevel), achievementPoints: Number(profile?.achievement_points ?? 0), lastLogin: profile?.last_login_timestamp,
    avatarUrl: media?.assets?.find((asset) => asset.key === "avatar")?.value, renderUrl: media?.assets?.find((asset) => asset.key === "main-raw" || asset.key === "main")?.value,
    mythicRating: mythic?.current_mythic_rating?.rating,
    stats, equipment, modelItems: [], customizations, activeTalentLoadout,
    activeHeroTalentTreeId: specializations?.active_hero_talent_tree?.id,
    recommendations: recommendations(equipment, averageItemLevel, locale), updatedAt: new Date().toISOString(),
  };
}
