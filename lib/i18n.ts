/** Двуязычие Gildra: en — корень сайта, ru — статическое дерево /ru.
 *  Переводится интерфейс; игровые термины (названия спеков, билдов,
 *  контент демо-данных) остаются английскими, как принято в русских
 *  WoW-ресурсах. Словарь ключуется английской строкой. */

export type Lang = "en" | "ru";

/** Префикс внутренних ссылок для русского дерева. */
export const p = (lang: Lang, href: string) => {
  if (lang !== "ru") return href;
  if (href.startsWith("/#")) return `/ru${href.slice(1) ? "#" + href.split("#")[1] : ""}`;
  if (href === "/") return "/ru";
  if (href.startsWith("/")) return `/ru${href}`;
  return href; // якоря "#..." и внешние
};

/** Язык из пути (для клиентских компонентов с usePathname). */
export const langOf = (pathname: string | null): Lang =>
  pathname === "/ru" || pathname?.startsWith("/ru/") ? "ru" : "en";

/** Путь той же страницы на другом языке (для переключателя). */
export const altPath = (pathname: string, to: Lang) => {
  const bare =
    pathname === "/ru" ? "/" : pathname.startsWith("/ru/") ? pathname.slice(3) : pathname;
  return to === "ru" ? (bare === "/" ? "/ru" : `/ru${bare}`) : bare;
};

const RU: Record<string, string> = {
  // TopNav / Explore
  "Compare specs": "Сравнить спеки",
  "Tier List": "Тир-лист",
  "Ranked Mythic+ specs with scores": "Рейтинг спеков Mythic+ с очками",
  "Find a build": "Найти билд",
  "Featured Builds": "Избранные билды",
  "Curated builds for top specs": "Отобранные билды топ-спеков",
  "Prepare for raid": "Подготовка к рейду",
  "Raid Overview": "Обзор рейда",
  "Manaforge Omega meta and specs": "Мета и спеки Manaforge Omega",
  "Learn & improve": "Учись и расти",
  "Latest Guides": "Свежие гайды",
  "Fresh guides for the season": "Свежие гайды сезона",
  "Switch game": "Сменить игру",
  soon: "скоро",
  Explore: "Разделы",
  "Looking for a spec or guide? Search Gildra":
    "Ищете спек или гайд? Поиск по Gildra",
  "Search Gildra...": "Поиск по Gildra...",
  "Coming soon": "Скоро",
  // Hero
  "Master the": "Владей",
  Meta: "метой",
  "Builds, rankings and live data from high-level Mythic+ and Raid content.":
    "Билды, рейтинги и живые данные из хай-энд контента Mythic+ и рейдов.",
  "Explore Mythic+": "Открыть Mythic+",
  "Raid rankings →": "Рейтинг рейдов →",
  Live: "Live",
  runs: "забегов",
  specs: "спеков",
  regions: "региона",
  updated: "обновлено",
  "2h ago": "2 ч назад",
  // PatchHighlights
  highlights: "— главное",
  updates: "пунктов",
  "PATCH HIGHLIGHTS": "ГЛАВНОЕ В ПАТЧЕ",
  "View full patch notes →": "Полные патчноуты →",
  "Class tuning updates": "Обновление баланса классов",
  "Manaforge Omega raid open": "Открыт рейд Manaforge Omega",
  "New Mythic+ affix rotation": "Новая ротация аффиксов Mythic+",
  "PvP balance adjustments": "Правки баланса PvP",
  // SectionNav
  "Season 1": "Сезон 1",
  MetaNav: "Мета",
  Raid: "Рейд",
  Guides: "Гайды",
  // MetaPulse
  "Season 1 · demo data": "Сезон 1 · демо-данные",
  "rank changes": "изменений в рейтинге",
  // MythicMeta / MetaTrends
  "Mythic+ Meta": "Мета Mythic+",
  "View All →": "Все →",
  "All Keys · Overall · Last 7 Days": "Все ключи · Общий · 7 дней",
  played: "пикрейт",
  "avg key": "ср. ключ",
  score: "очки",
  "Based on": "По данным",
  Updated: "Обновлено",
  "Meta Trends": "Тренды меты",
  "Specs popularity · Last 7 Days": "Популярность спеков · 7 дней",
  "View Full Meta Trends": "Все тренды меты",
  // RaidFeature
  "Current Raid": "Текущий рейд",
  "Boss rankings, spec performance and encounter guides — updated 2h ago from 23,671+ logged parses.":
    "Рейтинг боссов, результаты спеков и гайды по боям — обновлено 2 ч назад по 23,671+ логам.",
  "Boss Rankings": "Рейтинг боссов",
  "Best Specs": "Лучшие спеки",
  "Top raid specs": "Топ спеки рейда",
  // Guides
  "LATEST GUIDES": "СВЕЖИЕ ГАЙДЫ",
  "View All Guides →": "Все гайды →",
  // TierPreview
  "Mythic+ Tier List": "Тир-лист Mythic+",
  "Top specs by weighted score · All Keys · Last 7 Days · based on":
    "Топ спеков по взвешенным очкам · Все ключи · 7 дней · по данным",
  "View full tier list": "Полный тир-лист",
  "FEATURED BUILDS": "ИЗБРАННЫЕ БИЛДЫ",
  "All Builds →": "Все билды →",
  // TierSection
  Home: "Главная",
  "Tier Lists · Mythic+ · Overall": "Тир-листы · Mythic+ · Общий",
  "MYTHIC+ TIER LIST": "ТИР-ЛИСТ MYTHIC+",
  "Ranked by weighted score across timed runs, popularity and consistency.":
    "Рейтинг по взвешенным очкам: тайм-раны, популярность, стабильность.",
  Overall: "Общий",
  Healers: "Хилы",
  Tanks: "Танки",
  "Available with live data": "Доступно с живыми данными",
  "Last 7 Days": "7 дней",
  Share: "Поделиться",
  "Copied ✓": "Скопировано ✓",
  Filters: "Фильтры",
  Season: "Сезон",
  Patch: "Патч",
  "Level Range": "Уровень ключей",
  Region: "Регион",
  "Group Size": "Размер группы",
  "All Keys": "Все ключи",
  "All Regions": "Все регионы",
  All: "Все",
  Solo: "Соло",
  "Demo dataset — filters are not wired to data yet.":
    "Демо-данные — фильтры пока не подключены к данным.",
  "Search spec...": "Поиск спека...",
  "All Classes": "Все классы",
  Tier: "Тир",
  Spec: "Спек",
  Score: "Очки",
  "Pop.": "Поп.",
  "Avg Key": "Ср. ключ",
  Trend: "Тренд",
  "Mythic+ runs · Updated 2 hours ago": "забегов Mythic+ · Обновлено 2 часа назад",
  "How are scores calculated?": "Как считаются очки?",
  "Timed-run performance (50%), consistency (30%) and popularity (20%), weighted over the selected period.":
    "Результаты тайм-ранов (50%), стабильность (30%) и популярность (20%), взвешенные за выбранный период.",
  Hide: "Скрыть",
  View: "Показать",
  "Frost Death Knight details": "детали Frost Death Knight",
  "TIER LISTS": "ТИР-ЛИСТЫ",
  "About Tier Lists": "О тир-листах",
  "Learn how we calculate our tier lists.": "Как мы считаем наши тир-листы.",
  "Data refreshed": "Данные обновлены",
  "S TIER · 94.2 SCORE": "S-ТИР · 94.2 ОЧКОВ",
  Overview: "Обзор",
  Stats: "Статы",
  Talents: "Таланты",
  Trends: "Тренды",
  "Score Breakdown": "Разбор очков",
  Performance: "Результативность",
  Survivability: "Живучесть",
  Utility: "Утилити",
  Representation: "Представленность",
  Consistency: "Стабильность",
  "Quick Stats": "Кратко",
  Popularity: "Популярность",
  "Top 1%": "Топ 1%",
  "Weekly Change": "За неделю",
  "Data Sample": "Выборка",
  "View Guides": "Гайды",
  "View Builds": "Билды",
  // SearchCommand
  "Search specs, builds, guides...": "Поиск: спеки, билды, гайды...",
  Specs: "Спеки",
  Classes: "Классы",
  Builds: "Билды",
  Pages: "Страницы",
  "Meta overview": "Обзор меты",
  "Manaforge Omega — Current Raid": "Manaforge Omega — текущий рейд",
  "Current Raid search": "текущий рейд",
  "No results for": "Ничего не найдено по",
  // Footer
  "Gaming intelligence for Azeroth — live tier lists, meta statistics and guides.":
    "Игровая аналитика для Азерота — живые тир-листы, статистика меты и гайды.",
  Content: "Контент",
  "Tier Lists": "Тир-листы",
  Community: "Сообщество",
  "Support Us": "Поддержать",
  Contact: "Контакты",
  Premium: "Премиум",
  "Remove ads and support Gildra development.":
    "Уберите рекламу и поддержите развитие Gildra.",
  "Go Premium": "Оформить Премиум",
  "World of Warcraft® and all related artwork are trademarks or registered trademarks of Blizzard Entertainment, Inc. Gildra is an unofficial fan-made concept and is not affiliated with or endorsed by Blizzard Entertainment.":
    "World of Warcraft® и все связанные материалы — товарные знаки или зарегистрированные товарные знаки Blizzard Entertainment, Inc. Gildra — неофициальный фанатский концепт, не аффилированный с Blizzard Entertainment и не одобренный ею.",
  "Privacy Policy": "Политика конфиденциальности",
  // Cookie
  "Gildra stores your preferences in your browser and collects anonymous usage statistics to improve the product. See the":
    "Gildra хранит настройки в вашем браузере и собирает анонимную статистику использования, чтобы улучшать продукт. Подробнее — в",
  "privacy policy": "политике конфиденциальности",
  Accept: "Принять",
  Decline: "Отклонить",
  // AdSlot
  "Ad-free experience · support development":
    "Без рекламы · поддержка разработки",
  // Spec pages
  "Overall rank": "Место в рейтинге",
  "Avg key timed": "Средний ключ",
  "Top 1% key": "Ключ топ-1%",
  "7-day trend": "Тренд за 7 дней",
  BUILDS: "БИЛДЫ",
  GUIDES: "ГАЙДЫ",
  "← Full Mythic+ tier list": "← Полный тир-лист Mythic+",
  "demo data — based on": "демо-данные — по",
  "runs, updated": "забегам, обновлено",
};

/** t(lang)("View All →") — RU-перевод или исходная строка. */
export const t =
  (lang: Lang) =>
  (s: string): string =>
    lang === "ru" ? (RU[s] ?? s) : s;
