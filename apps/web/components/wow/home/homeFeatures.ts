import { navigationRealms, type NavigationLink } from "@/components/platform/navigation/navigationMap";
import { wowPortals } from "@/lib/games/wowPortals";

type Words = { en: string; ru: string };
export type HomeFeature = NavigationLink & { note: Words };
const feature = (href: string, note?: Words): HomeFeature => {
  const entry = navigationRealms.flatMap(realm => realm.groups.flatMap(group => group.links)).find(link => link.href === href);
  if (!entry || !(note ?? entry.note)) throw new Error(`Missing hub feature: ${href}`);
  return { ...entry, note: (note ?? entry.note)! };
};
export const homeGroups = [
  { id: "mythic", call: { en: "Push your next key", ru: "Пройдите следующий ключ" }, title: { en: "Mythic+ season dungeons", ru: "Подземелья сезона Mythic+" }, short: { en: "Mythic+", ru: "Mythic+" }, lead: feature("/wow/mythic-plus"), tools: [
    feature("/wow/midnight/season-2"), feature("/wow/mythic-plus/meta"), feature("/wow/mythic-plus/comps"), feature("/wow/mythic-plus/stats"), feature("/wow/mythic-plus/leaderboard"), feature("/wow/mythic-plus/routes"),
  ] },
  { id: "hero", call: { en: "Build your hero", ru: "Соберите своего героя" }, title: { en: "Classes and talents", ru: "Классы и таланты" }, short: { en: "Your hero", ru: "Ваш герой" }, lead: feature("/wow/classes"), tools: [
    feature("/wow/characters"), feature("/tier-lists", { en: "Compare specialization strength", ru: "Сравните силу специализаций" }), feature("/wow/transmog"),
  ] },
  { id: "raids", call: { en: "Prepare for the boss", ru: "Подготовьтесь к боссу" }, title: { en: "Raids and bosses", ru: "Рейды и боссы" }, short: { en: "Raids", ru: "Рейды" }, lead: feature("/wow/raids"), tools: [feature("/wow/lairs"), feature("/wow/raids/composition")] },
  { id: "economy", call: { en: "Trade and craft", ru: "Торгуйте и создавайте" }, title: { en: "Auction House and professions", ru: "Аукцион и профессии" }, short: { en: "Economy", ru: "Экономика" }, lead: feature("/wow/auction"), tools: [feature("/wow/professions")] },
  { id: "world", call: { en: "Explore Azeroth", ru: "Исследуйте Азерот" }, title: { en: "World map and library", ru: "Карта мира и библиотека" }, short: { en: "World & library", ru: "Мир и знания" }, lead: feature("/wow/map"), tools: [
    feature("/library"), feature("/wow/stories"), feature("/wow/whats-new", { en: "New guides and tools for your next session", ru: "Новые гайды и инструменты для игры" }),
  ] },
] as const;
export const homeVersions = wowPortals.map(portal => ({ ...portal, href: portal.id === "retail" ? "#mythic" : portal.path }));
export const homeFeatures = (locale: "en" | "ru") => homeGroups.flatMap(group => [group.lead, ...group.tools]).filter(link => !link.langs || link.langs.includes(locale));
