import type { Block, CollectionConfig, Field } from "payload";

/**
 * Russian labels for the admin forms. Fields without an explicit `label` get
 * `{ en, ru }` from this table by field name, and known English descriptions
 * get their Russian twin. Explicit labels in a collection always win, so a
 * field can still be labelled locally when the shared name does not fit.
 */
const LABELS: Record<string, { en: string; ru: string }> = {
  action: { en: "Action", ru: "Действие" },
  actorCollection: { en: "Actor type", ru: "Тип автора действия" },
  actorEmail: { en: "Actor email", ru: "Email автора действия" },
  actorId: { en: "Actor ID", ru: "ID автора действия" },
  alt: { en: "Alt text", ru: "Альтернативный текст" },
  author: { en: "Author", ru: "Автор" },
  bio: { en: "Bio", ru: "О себе" },
  blocked: { en: "Blocked", ru: "Заблокирован" },
  blockedReason: { en: "Block reason", ru: "Причина блокировки" },
  blocks: { en: "Blocks", ru: "Блоки" },
  body: { en: "Text", ru: "Текст" },
  caption: { en: "Caption", ru: "Подпись" },
  categories: { en: "Categories", ru: "Рубрики" },
  category: { en: "Category (legacy)", ru: "Категория (старая)" },
  cells: { en: "Cells", ru: "Ячейки" },
  changes: { en: "Changes", ru: "Изменения" },
  columns: { en: "Columns", ru: "Столбцы" },
  cons: { en: "Cons", ru: "Минусы" },
  content: { en: "Content", ru: "Текст статьи" },
  defaultLocale: { en: "Default language", ru: "Язык по умолчанию" },
  defaultSeo: { en: "Default SEO", ru: "SEO по умолчанию" },
  description: { en: "Description", ru: "Описание" },
  displayName: { en: "Display name", ru: "Отображаемое имя" },
  domain: { en: "Domain", ru: "Домен" },
  game: { en: "Game", ru: "Игра" },
  handle: { en: "Handle", ru: "Никнейм" },
  hero: { en: "Cover", ru: "Обложка" },
  href: { en: "Link", ru: "Ссылка" },
  image: { en: "Image", ru: "Изображение" },
  joinedAt: { en: "Joined", ru: "Дата вступления" },
  label: { en: "Label", ru: "Подпись" },
  languages: { en: "Languages", ru: "Языки" },
  lastReviewedAt: { en: "Last reviewed", ru: "Последняя проверка" },
  layout: { en: "Layout", ru: "Макет" },
  lolChampion: { en: "Champion", ru: "Чемпион" },
  lolMentionedChampions: { en: "Mentioned champions", ru: "Упомянутые чемпионы" },
  lolRole: { en: "Role", ru: "Роль" },
  member: { en: "Reader", ru: "Читатель" },
  memberships: { en: "Site memberships", ru: "Участие на сайтах" },
  name: { en: "Name", ru: "Имя" },
  noIndex: { en: "Hide from search engines", ru: "Скрыть от поисковиков" },
  patch: { en: "Patch", ru: "Патч" },
  path: { en: "Path", ru: "Путь" },
  platform: { en: "Platform", ru: "Платформа" },
  platformRole: { en: "Platform role", ru: "Роль на платформе" },
  plausibleSiteId: { en: "Plausible site ID", ru: "ID сайта в Plausible" },
  publicUrl: { en: "Public URL", ru: "Публичный адрес" },
  publishedAt: { en: "Published at", ru: "Дата публикации" },
  registrationEnabled: { en: "Reader registration", ru: "Регистрация читателей" },
  revalidateUrl: { en: "Cache refresh URL", ru: "Адрес обновления кэша" },
  role: { en: "Role", ru: "Роль" },
  pros: { en: "Pros", ru: "Плюсы" },
  rows: { en: "Rows", ru: "Строки" },
  season: { en: "Season", ru: "Сезон" },
  seo: { en: "SEO", ru: "SEO" },
  site: { en: "Site", ru: "Сайт" },
  sites: { en: "Site roles", ru: "Роли на сайтах" },
  siteTitle: { en: "Site title", ru: "Название сайта" },
  slug: { en: "Slug (URL)", ru: "Адрес (slug)" },
  social: { en: "Social links", ru: "Соцсети" },
  status: { en: "Status", ru: "Статус" },
  steps: { en: "Steps", ru: "Шаги" },
  style: { en: "Style", ru: "Вид" },
  summary: { en: "Summary", ru: "Краткое описание" },
  tagline: { en: "Tagline", ru: "Слоган" },
  tags: { en: "Tags", ru: "Теги" },
  text: { en: "Text", ru: "Текст" },
  targetCollection: { en: "Target type", ru: "Тип объекта" },
  targetId: { en: "Target ID", ru: "ID объекта" },
  title: { en: "Title", ru: "Заголовок" },
  tone: { en: "Tone", ru: "Тип" },
  url: { en: "URL", ru: "Адрес" },
  value: { en: "Value", ru: "Значение" },
  visibility: { en: "Visibility", ru: "Видимость" },
  wowClass: { en: "Class", ru: "Класс" },
  wowInstance: { en: "Raid or dungeon", ru: "Рейд или подземелье" },
  wowSpec: { en: "Specialization", ru: "Специализация" },
};

const DESCRIPTIONS: Record<string, string> = {
  "Allow reader self-registration for this site (requires working SMTP).":
    "Разрешить читателям самостоятельно регистрироваться на этом сайте (нужна рабочая почта).",
  "Authors are always recorded as themselves.": "Автором всегда записывается тот, кто создаёт материал.",
  "Blocks the account on every site and ends all sessions.": "Блокирует аккаунт на всех сайтах и завершает все сеансы.",
  "Canonical origin used for preview, verification and reset links, e.g. https://gildra.net":
    "Основной адрес сайта для предпросмотра и ссылок из писем, например https://gildra.net",
  "Champion id, e.g. Ahri": "ID чемпиона, например Ahri",
  "Legacy Gildra category kept for compatibility. Prefer Categories.":
    "Старая категория Gildra, оставлена для совместимости. Используйте «Рубрики».",
  "Owners manage every site and provision staff.": "Владельцы управляют всеми сайтами и выдают доступ сотрудникам.",
  "Public host name without scheme, e.g. gildra.net": "Домен без схемы, например gildra.net",
  "Raid or dungeon slug": "Slug рейда или подземелья",
  "Server-controlled site memberships. Site admins manage rows of their own sites.":
    "Участие задаётся сервером. Администраторы сайта управляют строками своих сайтов.",
  "Spec slug, e.g. frost": "Slug специализации, например frost",
  "Unique within the site. Changing it changes the public URL.":
    "Уникален в пределах сайта. Если изменить, изменится публичный адрес.",
  "When the content was last checked against the game.": "Когда материал последний раз сверяли с актуальной версией игры.",
  "e.g. 11.2.5 or 25.20": "например 11.2.5 или 25.20",
  "site_id in Plausible CE (usually the domain). Empty = analytics not configured.":
    "site_id в Plausible CE (обычно домен). Пусто — статистика не подключена.",
};

function localizeField(field: Field): Field {
  const out = { ...field } as Field & {
    name?: string;
    label?: unknown;
    admin?: { description?: unknown };
    fields?: Field[];
    blocks?: Block[];
    tabs?: { fields: Field[] }[];
  };
  if (out.name && out.label === undefined && LABELS[out.name]) out.label = LABELS[out.name];
  const description = out.admin?.description;
  if (typeof description === "string" && DESCRIPTIONS[description]) {
    out.admin = { ...out.admin, description: { en: description, ru: DESCRIPTIONS[description] } };
  }
  if (Array.isArray(out.fields)) out.fields = localizeFields(out.fields);
  if (Array.isArray(out.blocks)) out.blocks = out.blocks.map(localizeBlock);
  if (Array.isArray(out.tabs)) out.tabs = out.tabs.map((tab) => ({ ...tab, fields: localizeFields(tab.fields) }));
  return out as Field;
}

export function localizeFields(fields: Field[]): Field[] {
  return fields.map(localizeField);
}

export function localizeBlock(block: Block): Block {
  return { ...block, fields: localizeFields(block.fields) };
}

export function localizeCollection(collection: CollectionConfig): CollectionConfig {
  return { ...collection, fields: localizeFields(collection.fields) };
}
