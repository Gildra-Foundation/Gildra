/**
 * Player-facing changelog (roadmap item 99). Only what shipped to gildra.net, in
 * plain words; the technical journal of the same releases is docs/releases.md.
 * Newest first. Each change: kind + text in both languages.
 */
export type ChangeKind = "new" | "better" | "fixed";
export type Release = { date: string; changes: Array<{ kind: ChangeKind; en: string; ru: string }> };

export const changelog: Release[] = [
  {
    date: "2026-10-13",
    changes: [
      { kind: "new", en: "Raid, boss and lair pictures now grow into the page they open.", ru: "Картинки рейдов, боссов и логов теперь «перетекают» в открываемую страницу." },
      { kind: "new", en: "Page changes follow your direction: deeper from the right, back from the left.", ru: "Переходы между страницами знают направление: вглубь — справа, назад — слева." },
      { kind: "new", en: "\"Less motion\" switch in the footer of every page.", ru: "Переключатель «Меньше движения» в подвале каждой страницы." },
      { kind: "new", en: "\"Share\" on raids, bosses, lairs and database entries.", ru: "«Поделиться» на страницах рейдов, боссов, логов и записей базы." },
      { kind: "better", en: "Bigger touch targets on phones and clearer text over artwork.", ru: "Крупнее кнопки и ссылки на телефоне, чётче текст поверх картин." },
      { kind: "better", en: "The current chapter is highlighted in the chapter bar as you read.", ru: "Текущая глава подсвечивается в полосе глав во время чтения." },
      { kind: "fixed", en: "Unknown addresses now show a real \"not found\" page with similar pages and search.", ru: "Несуществующие адреса показывают честную страницу «не найдено» с похожими страницами и поиском." },
    ],
  },
  {
    date: "2026-10-12",
    changes: [
      { kind: "new", en: "Site search: press ⌘K / Ctrl+K or \"/\" anywhere; recently opened pages are one key away.", ru: "Поиск по сайту: ⌘K / Ctrl+K или «/» на любой странице; недавно открытые — под рукой." },
      { kind: "new", en: "Mythic+ route steps are now written in English on English pages.", ru: "Шаги маршрутов Эпохальный+ на английских страницах теперь написаны по-английски." },
      { kind: "new", en: "Link previews with section art when you share any page.", ru: "Превью ссылок с картиной раздела, когда вы делитесь любой страницей." },
      { kind: "new", en: "A living void over The Voidspire and torchlight under the cursor on cards.", ru: "Живая Бездна над Шпиль Бездны и свет факела под курсором на карточках." },
      { kind: "new", en: "Class catalogue with every specialization of Midnight.", ru: "Каталог классов со всеми специализациями Midnight." },
      { kind: "better", en: "Pages arrive with a soft transition instead of a jump.", ru: "Страницы появляются мягким переходом вместо скачка." },
    ],
  },
  {
    date: "2026-10-11",
    changes: [
      { kind: "new", en: "New look of every inner page: dark atlas panels and a painting for each section.", ru: "Новый облик всех внутренних страниц: тёмные панели атласа и своя картина у каждого раздела." },
      { kind: "new", en: "Articles from the Gildra editors.", ru: "Статьи от редакции Gildra." },
    ],
  },
];
