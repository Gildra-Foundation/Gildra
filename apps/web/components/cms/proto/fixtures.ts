import type { CmsLocale, PublicArticle } from "@/lib/cms/contract";

/**
 * DESIGN PROTOTYPE ONLY (`/dev/articles`): placeholder articles to judge the
 * layouts while production has no published article. Titles are topics, not
 * published texts; the page that renders them says so in a banner. Covers are
 * project artwork from public/assets.
 */
type Row = { slug: string; type: "guides" | "news" | "patch-notes"; cls?: string; spec?: string; patch?: string; cover: string; date: string; min: number; en: [string, string]; ru: [string, string] };

const TYPES = {
  guides: { en: "Guide", ru: "Гайд" },
  news: { en: "News", ru: "Новости" },
  "patch-notes": { en: "Patch notes", ru: "Патчноуты" },
} as const;

const rows: Row[] = [
  { slug: "frost-mage-mythic-plus", type: "guides", cls: "mage", spec: "frost", patch: "12.0.5", cover: "/assets/wow/loading/talents-wow.webp", date: "2026-10-22T09:00:00Z", min: 14,
    en: ["Frost Mage in Mythic+: opener, talents and routing tips", "Demo topic: how a spec guide card reads — rotation, talents and what changes in higher keys."],
    ru: ["Frost Mage в M+: начало боя, таланты и маршруты", "Демо-тема: как читается карточка гайда по специализации — ротация, таланты и что меняется на высоких ключах."] },
  { slug: "season-changes-overview", type: "news", patch: "12.0.5", cover: "/assets/wow/loading/dungeon.webp", date: "2026-10-21T15:00:00Z", min: 6,
    en: ["What the new season changes for Mythic+ dungeons", "Demo topic: a news card with a short summary and no class binding."],
    ru: ["Что новый сезон меняет в эпохальных подземельях", "Демо-тема: новостная карточка с коротким анонсом без привязки к классу."] },
  { slug: "patch-notes-digest", type: "patch-notes", patch: "12.0.5", cover: "/assets/wow/loading/tier.webp", date: "2026-10-20T18:00:00Z", min: 9,
    en: ["Patch notes digest: class changes in plain words", "Demo topic: a patch digest groups changes by class and role."],
    ru: ["Дайджест патча: изменения классов простыми словами", "Демо-тема: дайджест патча группирует изменения по классам и ролям."] },
  { slug: "raid-first-week-checklist", type: "guides", patch: "12.0.5", cover: "/assets/wow/loading/raid-wow.webp", date: "2026-10-19T10:00:00Z", min: 11,
    en: ["Raid first week: a preparation checklist", "Demo topic: consumables, roles and boss order for a new raid tier."],
    ru: ["Первая неделя рейда: чек-лист подготовки", "Демо-тема: расходники, роли и порядок боссов для нового рейда."] },
  { slug: "fury-warrior-builds", type: "guides", cls: "warrior", spec: "fury", patch: "12.0.5", cover: "/assets/wow/mythic/backgrounds/kings.webp", date: "2026-10-17T12:00:00Z", min: 12,
    en: ["Fury Warrior builds for raid and dungeons", "Demo topic: one guide, two builds, and when to switch between them."],
    ru: ["Fury Warrior: сборки для рейда и подземелий", "Демо-тема: один гайд, две сборки и когда между ними переключаться."] },
  { slug: "hotfix-roundup", type: "patch-notes", patch: "12.0.5", cover: "/assets/wow/mythic/backgrounds/voidscar.webp", date: "2026-10-16T08:00:00Z", min: 4,
    en: ["Hotfix roundup for the week", "Demo topic: a short list of hotfixes with links to the classes they touch."],
    ru: ["Хотфиксы недели", "Демо-тема: короткий список хотфиксов со ссылками на затронутые классы."] },
  { slug: "discipline-priest-atonement", type: "guides", cls: "priest", spec: "discipline", patch: "12.0.5", cover: "/assets/wow/mythic/backgrounds/temple.webp", date: "2026-10-14T09:00:00Z", min: 16,
    en: ["Discipline Priest: atonement from the ground up", "Demo topic: a long healer guide with a table of contents."],
    ru: ["Discipline Priest: Atonement с нуля", "Демо-тема: длинный гайд для лекаря с оглавлением."] },
  { slug: "restoration-druid-keys", type: "guides", cls: "druid", spec: "restoration", patch: "12.0.5", cover: "/assets/wow/mythic/backgrounds/altar.webp", date: "2026-10-12T09:00:00Z", min: 13,
    en: ["Restoration Druid healing in Mythic+", "Demo topic: healing priorities by dungeon affix."],
    ru: ["Restoration Druid в эпохальных ключах", "Демо-тема: приоритеты лечения по модификаторам подземелий."] },
  { slug: "devastation-evoker-empower", type: "guides", cls: "evoker", spec: "devastation", patch: "12.0.5", cover: "/assets/wow/mythic/backgrounds/blinding.webp", date: "2026-10-10T09:00:00Z", min: 10,
    en: ["Devastation Evoker: getting empower spells right", "Demo topic: empower ranks and when each one pays off."],
    ru: ["Devastation Evoker: заряжаемые заклинания", "Демо-тема: уровни заряда и когда каждый из них окупается."] },
  { slug: "archive-of-lore", type: "news", cover: "/assets/wow/loading/archive.webp", date: "2026-10-08T09:00:00Z", min: 5,
    en: ["New on Gildra: the lore archive", "Demo topic: a site news item without a patch."],
    ru: ["Новое на Gildra: архив лора", "Демо-тема: новость сайта без патча."] },
];

export function protoArticles(locale: CmsLocale): PublicArticle[] {
  return rows.map((r, i) => ({
    id: `proto-${i}`,
    slug: r.slug,
    title: r[locale][0],
    summary: r[locale][1],
    publishedAt: r.date,
    updatedAt: r.date,
    readingTime: r.min,
    legacyCategory: null,
    cover: { id: `c${i}`, url: r.cover, alt: "", caption: null, width: 1920, height: 1080, mimeType: "image/webp" },
    author: { name: "Gildra" },
    categories: [{ id: r.type, slug: r.type, title: TYPES[r.type][locale] }],
    tags: [],
    game: { patch: r.patch ?? null, season: null, lastReviewedAt: null, wowClass: r.cls ?? null, wowSpec: r.spec ?? null, wowInstance: null, lolChampion: null, lolRole: null, lolMentionedChampions: [] },
    seo: { title: null, description: null, image: null, noIndex: true },
    requestedLocale: locale,
    resolvedLocale: locale,
    availableLocales: ["en", "ru"],
  }));
}

export const protoTypes = (locale: CmsLocale) => (Object.keys(TYPES) as Array<keyof typeof TYPES>).map((slug) => ({ slug, title: TYPES[slug][locale] }));
