import generated from "./contract.generated.json";

/**
 * Block contracts shared with the web app. `contract.generated.json` is written
 * by `npm run blocks:contracts` (apps/web/scripts/generate-block-contracts.mjs)
 * from the web block types and page definitions; CI fails when it is stale.
 * Never edit it by hand: the site validates overrides with the same file.
 */
export type Schema = {
  type?: "object" | "string" | "number" | "boolean" | "array";
  const?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
};

export type BlockContract = { container: boolean; props: Schema };
export type BlockInstance = { type: string; props?: Record<string, unknown>; children?: BlockInstance[] };
export type SiteSlug = "gildra" | "riftden";
export type Lang = "en" | "ru";

/** A page whose block list the CMS may override on one site. */
export type CmsPage = {
  site: SiteSlug;
  id: string;
  game: string;
  /** Game-relative path, as in the web page definition. */
  path: string;
  /** Block types editors may place on it (code config + extras). */
  blocks: string[];
};

export const BLOCKS = generated.blocks as Record<string, BlockContract>;

/**
 * Riftden's frontend lives in riftden-platform, outside this repository, so
 * its overridable pages are declared here. Keep in sync with that app's page
 * ids (the legacy page `league-of-legends/home` already exists).
 */
const RIFTDEN_PAGES: CmsPage[] = [
  { site: "riftden", id: "league-of-legends/home", game: "league-of-legends", path: "/", blocks: Object.keys(BLOCKS).filter((type) => type.startsWith("lol.")) },
];

export const CMS_PAGES: CmsPage[] = [...(generated.pages as Omit<CmsPage, "site">[]).map((page) => ({ ...page, site: "gildra" as const })), ...RIFTDEN_PAGES];

export function pagesForSite(site: string | null | undefined): CmsPage[] {
  return CMS_PAGES.filter((page) => page.site === site);
}

export function findPage(site: string | null | undefined, id: unknown): CmsPage | null {
  return CMS_PAGES.find((page) => page.site === site && page.id === id) ?? null;
}

/** Public URLs of a page: Gildra is `[/ru]` + game prefix (WoW owns the root); Riftden is RU at the root and `/en`. */
export function pageUrls(page: Pick<CmsPage, "site" | "game" | "path">): Record<Lang, string> {
  if (page.site === "riftden") return { ru: page.path, en: page.path === "/" ? "/en" : `/en${page.path}` };
  const prefix = page.game === "wow" ? "" : `/${page.game}`;
  const en = page.path === "/" ? prefix || "/" : `${prefix}${page.path}`;
  return { en, ru: en === "/" ? "/ru" : `/ru${en}` };
}

type Text = Record<Lang, string>;

const PAGE_LABELS: Record<string, Text> = {
  "wow/privacy": { en: "Privacy policy", ru: "Политика конфиденциальности" },
  "wow/tier-lists": { en: "Tier lists", ru: "Тир-листы" },
  "lol/home": { en: "League of Legends home", ru: "Главная League of Legends" },
  "league-of-legends/home": { en: "Home", ru: "Главная" },
};

const BLOCK_LABELS: Record<string, Text> = {
  adSlot: { en: "Ad slot", ru: "Рекламное место" },
  columns: { en: "Columns", ru: "Колонки" },
  container: { en: "Container", ru: "Контейнер" },
  legal: { en: "Legal text", ru: "Юридический текст" },
  sectionNav: { en: "Section navigation", ru: "Навигация по разделам" },
  "wow.tierWorkspace": { en: "Tier list workspace", ru: "Рабочая область тир-листа" },
  "wow.specBody": { en: "Spec page body", ru: "Страница специализации" },
  "lol.main": { en: "Main column", ru: "Основная колонка" },
  "lol.hero": { en: "Hero", ru: "Шапка" },
  "lol.championCatalog": { en: "Champion catalog", ru: "Каталог чемпионов" },
  "lol.championDetail": { en: "Champion page", ru: "Страница чемпиона" },
  "lol.contentCategory": { en: "Content category", ru: "Категория контента" },
};

const BLOCK_HINTS: Record<string, Text> = {
  "wow.tierWorkspace": { en: "Filters, tier table and spec card. Content comes from the game data, nothing to fill in.", ru: "Фильтры, таблица тиров и карточка спека. Данные берутся из игры, заполнять нечего." },
  "lol.championCatalog": { en: "Every champion from Data Dragon. Nothing to fill in.", ru: "Все чемпионы из Data Dragon. Заполнять нечего." },
  container: { en: "Groups the blocks inside it in the page column.", ru: "Объединяет вложенные блоки в колонке страницы." },
  columns: { en: "Places the blocks inside it side by side.", ru: "Ставит вложенные блоки рядом." },
};

const FIELD_LABELS: Record<string, Text> = {
  title: { en: "Title", ru: "Заголовок" },
  updated: { en: "Updated line", ru: "Дата обновления" },
  sections: { en: "Sections", ru: "Разделы" },
  heading: { en: "Heading", ru: "Заголовок раздела" },
  text: { en: "Text", ru: "Текст" },
  backLabel: { en: "Back link", ru: "Ссылка «назад»" },
  variant: { en: "Variant", ru: "Вариант" },
  className: { en: "CSS class", ru: "CSS-класс" },
  layout: { en: "Layout", ru: "Раскладка" },
  id: { en: "Section id", ru: "Id секции" },
  anchor: { en: "Anchor", ru: "Якорь" },
  anchorsFrom: { en: "Anchors from page", ru: "Якоря со страницы" },
  active: { en: "Active section", ru: "Активный раздел" },
  linkToHome: { en: "Links lead to the home page", ru: "Ссылки ведут на главную" },
  eyebrow: { en: "Eyebrow", ru: "Надзаголовок" },
  description: { en: "Description", ru: "Описание" },
  slug: { en: "Slug", ru: "Slug" },
  category: { en: "Category", ru: "Категория" },
  cursor: { en: "Cursor", ru: "Курсор" },
};

export const pageLabel = (id: string, lang: Lang) => PAGE_LABELS[id]?.[lang] ?? id;
export const blockLabel = (type: string, lang: Lang) => BLOCK_LABELS[type]?.[lang] ?? type;
export const blockHint = (type: string, lang: Lang) => BLOCK_HINTS[type]?.[lang] ?? null;
export const fieldLabel = (name: string, lang: Lang) => FIELD_LABELS[name]?.[lang] ?? name;
