/**
 * Player-facing changelog (roadmap item 99). Only what shipped to gildra.net, in
 * plain words; the technical journal of the same releases is docs/releases.md.
 * Newest first. Each change: kind + text in both languages.
 */
export type ChangeKind = "new" | "better" | "fixed";
export type Release = { date: string; changes: Array<{ kind: ChangeKind; en: string; ru: string }> };

export const changelog: Release[] = [
  {
    date: "2026-10-27",
    changes: [
      { kind: "new", en: "Transmog Studio: try any appearance on a 3D character and save a picture for social media.", ru: "Трансмогрификация: примеряйте любые облики на 3D-персонаже и сохраняйте картинку для соцсетей." },
      { kind: "new", en: "Mythic+ meta: the most played specializations of the week for every role.", ru: "Мета Mythic+: самые популярные специализации недели для каждой роли." },
      { kind: "better", en: "One look across the site: painted buttons and plaques, links in the colour of your theme.", ru: "Единый облик сайта: нарисованные кнопки и таблички, ссылки в цвете вашей темы." },
      { kind: "better", en: "A clearer menu: the Library in one place, classes open their card, phones get a single menu.", ru: "Понятнее меню: Библиотека в одном месте, классы ведут на свою карточку, на телефоне одно меню." },
    ],
  },
  {
    date: "2026-10-26",
    changes: [
      { kind: "new", en: "Library: items, spells, mounts and other game data with in-game tooltips and 3D models.", ru: "Библиотека: предметы, заклинания, транспорт и другие данные игры с подсказками и 3D-моделями." },
      { kind: "new", en: "Characters: sign in with Battle.net and pick your heroes by class.", ru: "Персонажи: вход через Battle.net и выбор героев по классу." },
      { kind: "new", en: "The Voidspire: a pull map and role briefings for every boss.", ru: "The Voidspire: карта пуллов и задачи ролей для каждого босса." },
      { kind: "better", en: "Pictures for thousands of library records that had none.", ru: "Картинки у тысяч записей библиотеки, где их не было." },
    ],
  },
  {
    date: "2026-10-25",
    changes: [
      { kind: "new", en: "Every Mythic+ dungeon has its own painted look: frames, plaques and timer hourglasses.", ru: "У каждого подземелья Mythic+ свой нарисованный облик: рамки, таблички и песочные часы таймера." },
      { kind: "new", en: "Dungeon routes show what your role does on each pull.", ru: "Маршруты подземелий показывают, что делает ваша роль на каждом пулле." },
    ],
  },
  {
    date: "2026-10-24",
    changes: [
      { kind: "new", en: "Auction House under Tools: realm auctions with item icons and tooltips.", ru: "Аукцион в «Инструментах»: лоты серверов с иконками и подсказками предметов." },
      { kind: "new", en: "Tier lists compare mythicstats.com and u.gg side by side.", ru: "Тир-листы сравнивают mythicstats.com и u.gg рядом." },
      { kind: "new", en: "Story Library: the life of Anduin Wrynn as a book.", ru: "Библиотека историй: жизнь Андуина Ринна в виде книги." },
    ],
  },
  {
    date: "2026-10-13",
    changes: [
      { kind: "new", en: "Raid, boss and lair pictures now grow into the page they open.", ru: "Картинки рейдов, боссов и логов теперь «перетекают» в открываемую страницу." },
      { kind: "new", en: "Page changes follow your direction: deeper from the right, back from the left.", ru: "Переходы между страницами знают направление: вглубь — справа, назад — слева." },
      { kind: "new", en: "\"Less motion\" switch in the footer of every page.", ru: "Переключатель «Меньше движения» в подвале каждой страницы." },
      { kind: "new", en: "\"Share\" on raids, bosses, lairs and database entries.", ru: "«Поделиться» на страницах рейдов, боссов, логов и записей библиотеки." },
      { kind: "better", en: "Bigger touch targets on phones and clearer text over artwork.", ru: "Крупнее кнопки и ссылки на телефоне, чётче текст поверх картин." },
      { kind: "fixed", en: "Unknown addresses now show a real \"not found\" page with similar pages and search.", ru: "Несуществующие адреса показывают честную страницу «не найдено» с похожими страницами и поиском." },
    ],
  },
  {
    date: "2026-10-12",
    changes: [
      { kind: "new", en: "Site search: press ⌘K / Ctrl+K or \"/\" anywhere; recently opened pages are one key away.", ru: "Поиск по сайту: ⌘K / Ctrl+K или «/» на любой странице; недавно открытые — под рукой." },
      { kind: "new", en: "Mythic+ route steps are now written in English on English pages.", ru: "Шаги маршрутов Mythic+ на английских страницах теперь написаны по-английски." },
      { kind: "new", en: "Link previews with section art when you share any page.", ru: "Превью ссылок с картиной раздела, когда вы делитесь любой страницей." },
      { kind: "new", en: "A living void over The Voidspire and torchlight under the cursor on cards.", ru: "Живая Бездна над The Voidspire и свет факела под курсором на карточках." },
      { kind: "new", en: "Class catalogue with every specialization of Midnight.", ru: "Каталог классов со всеми специализациями Midnight." },
      { kind: "better", en: "Pages arrive with a soft transition instead of a jump.", ru: "Страницы появляются мягким переходом вместо скачка." },
    ],
  },
  {
    date: "2026-10-11",
    changes: [
      { kind: "new", en: "New look of every inner page: dark atlas panels and a painting for each section.", ru: "Новый облик всех внутренних страниц: тёмные панели атласа и своя картина у каждого раздела." },
          ],
  },
];
