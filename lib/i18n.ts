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
  records: "записей",
  "Search by name or game ID...": "Поиск по названию или игровому ID...",
  Found: "Найдено",
  Profession: "Профессия",
  "Creature / NPC": "Существо / NPC",
  Quest: "Задание",
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
  "Explore game data": "Изучить данные игры",
  Database: "База данных",
  Library: "Библиотека",
  "Verified datasets, images and tooltips": "Проверенные датасеты, изображения и tooltip",
  "Items, spells, quests and more": "Предметы, заклинания, задания и другое",
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
  "nav:Meta": "Мета",
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
  "PvP talents": "PvP-таланты",
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
  "World of Warcraft Database": "База данных World of Warcraft",
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
  // Database
  "Azeroth reference index": "Справочник Азерота",
  "A structured catalog of items, spells, quests, creatures and every system that shapes World of Warcraft.":
    "Структурированный каталог предметов, заклинаний, заданий, существ и всех систем World of Warcraft.",
  "Catalog scope": "Охват каталога",
  "Retail & Classic": "Retail и Classic",
  "Build-aware": "С учётом версий",
  "English & Russian": "Русский и английский",
  "Source manifest": "Источники данных",
  "Built from traceable data": "Данные с проверяемым происхождением",
  "Official API": "Официальный API",
  "Client data": "Данные клиента",
  "File index": "Индекс файлов",
  "Build research": "Исследование версий",
  "Curated game data": "Подготовленные игровые данные",
  "Catalog search": "Поиск по каталогу",
  "Explore imported game data": "Поиск по импортированным данным",
  "No records": "Нет записей",
  "Search the game database": "Поиск по игровой базе данных",
  "Search items, talents, instances...": "Поиск предметов, талантов, подземелий...",
  Search: "Найти",
  "Catalog type": "Тип данных",
  "All records": "Все записи",
  "Talent tree": "Дерево талантов",
  Talent: "Талант",
  "PvP talent": "PvP-талант",
  Instance: "Подземелье или рейд",
  Enchantment: "Чары",
  Gem: "Камень",
  "Item set": "Комплект предметов",
  Season: "Сезон",
  Food: "Еда",
  Flask: "Настой",
  Potion: "Зелье",
  Class: "Класс",
  Specialization: "Специализация",
  Encounter: "Сражение",
  Currency: "Валюта",
  Mount: "Транспорт",
  "Battle pet": "Боевой питомец",
  Toy: "Игрушка",
  "Transmog set": "Комплект трансмогрификации",
  Achievement: "Достижение",
  Map: "Карта",
  Zone: "Зона",
  Faction: "Фракция",
  Enchantments: "Чары",
  Gems: "Камни",
  "Talent trees": "Деревья талантов",
  "Transmog sets": "Комплекты трансмогрификации",
  "No matching records": "Подходящих записей нет",
  "Try another search term or choose a different data type.":
    "Попробуйте другой запрос или выберите иной тип данных.",
  Back: "Назад",
  "Showing up to 24 records": "Показано до 24 записей",
  "Next page": "Следующая страница",
  "Open category": "Открыть категорию",
  "Imported records": "Импортированные записи",
  "Items & spells from the API": "Предметы и заклинания из API",
  "Live data": "Живые данные",
  "Waiting for first import": "Ожидается первый импорт",
  "The catalog schema is ready": "Схема каталога готова",
  "Run the Battle.net importer to replace this state with real item and spell records.":
    "Запустите импорт Battle.net, и здесь появятся настоящие предметы и заклинания.",
  Item: "Предмет",
  Spell: "Заклинание",
  Build: "Билд",
  "Browse the catalog": "Навигация по каталогу",
  "Choose a category": "Выберите категорию",
  "Available categories open the imported records immediately.":
    "Доступные категории сразу открывают импортированные записи.",
  "Weapons, armor and equipment": "Оружие, броня и экипировка",
  "Classes, specializations and talents": "Классы, специализации и таланты",
  "Spells, auras and abilities": "Заклинания, ауры и способности",
  "Instances, encounters and bosses": "Инстансы, сражения и боссы",
  "Mounts, pets, toys and appearances": "Транспорт, питомцы, игрушки и облики",
  "Achievements, criteria and rewards": "Достижения, критерии и награды",
  "Quests, campaigns and rewards": "Задания, кампании и награды",
  "Creatures, vendors and trainers": "Существа, торговцы и учителя",
  "Maps, zones and reputations": "Карты, зоны и репутации",
  "Recipes, reagents and crafted items": "Рецепты, реагенты и создаваемые предметы",
  Open: "Открыть",
  "Game record ID": "ID в игре",
  Categories: "Категории",
  "Category index": "Категории",
  "The index is ready for structured imports. Entity pages will appear as each category is validated.":
    "Индекс подготовлен для структурированного импорта. Страницы сущностей появятся после проверки каждой категории.",
  "Search database categories": "Поиск по категориям базы данных",
  "Search items, spells, quests...": "Поиск предметов, заклинаний, заданий...",
  Clear: "Очистить",
  "Categories shown": "Показано категорий",
  "Index planned": "Индекс готовится",
  "No matching categories": "Подходящих категорий нет",
  "Try a broader game term or clear the search.":
    "Введите более общий игровой термин или очистите поиск.",
  "Clear search": "Очистить поиск",
  "Items & Equipment": "Предметы и экипировка",
  "Everything characters can equip, carry, consume or collect.":
    "Всё, что персонажи могут экипировать, носить, использовать или собирать.",
  Weapons: "Оружие",
  Armor: "Броня",
  Consumables: "Расходуемые предметы",
  "Item sets": "Комплекты",
  "Gems & enchants": "Камни и чары",
  "Classes & Combat": "Классы и бой",
  "The playable combat system, from class identity to loadouts.":
    "Боевая система: от классовой идентичности до вариантов сборок.",
  Specializations: "Специализации",
  Abilities: "Способности",
  "Spells & Effects": "Заклинания и эффекты",
  "Spell rules and the effects that make them work in game.":
    "Правила заклинаний и эффекты, определяющие их работу в игре.",
  Spells: "Заклинания",
  Auras: "Ауры",
  Effects: "Эффекты",
  Cooldowns: "Время восстановления",
  Visuals: "Визуальные эффекты",
  "Quests & Story": "Задания и сюжет",
  "Objectives, rewards and the chains that connect Azeroth's stories.":
    "Цели, награды и цепочки, объединяющие истории Азерота.",
  Quests: "Задания",
  "Quest chains": "Цепочки заданий",
  Objectives: "Цели",
  Rewards: "Награды",
  Campaigns: "Кампании",
  "Creatures & NPCs": "Существа и NPC",
  "The characters and creatures found across every supported build.":
    "Персонажи и существа из всех поддерживаемых версий игры.",
  Creatures: "Существа",
  NPCs: "NPC",
  Vendors: "Торговцы",
  Trainers: "Учителя",
  "Creature models": "Модели существ",
  "World & Maps": "Мир и карты",
  "A build-aware index of places, regions and world relationships.":
    "Индекс локаций, регионов и связей мира с учётом версии игры.",
  Maps: "Карты",
  Zones: "Зоны",
  Areas: "Области",
  Factions: "Фракции",
  Reputations: "Репутации",
  "Dungeons & Raids": "Подземелья и рейды",
  "Instanced content, encounter structure and associated rewards.":
    "Инстансы, структура сражений и связанные с ними награды.",
  Instances: "Инстансы",
  Encounters: "Сражения",
  Bosses: "Боссы",
  Difficulties: "Сложности",
  "Loot tables": "Таблицы добычи",
  "Professions & Crafting": "Профессии и ремесло",
  "Recipes, materials and the systems behind crafted equipment.":
    "Рецепты, материалы и системы создания экипировки.",
  Professions: "Профессии",
  Recipes: "Рецепты",
  Reagents: "Реагенты",
  "Crafted items": "Создаваемые предметы",
  Collections: "Коллекции",
  "Account-wide rewards and the appearances players hunt for.":
    "Общие для аккаунта награды и внешний вид, за которыми охотятся игроки.",
  Mounts: "Транспорт",
  "Battle pets": "Боевые питомцы",
  Toys: "Игрушки",
  Transmog: "Трансмогрификация",
  Titles: "Звания",
  "Game Systems": "Игровые системы",
  "Progression, seasonal rules and supporting game definitions.":
    "Прогресс, сезонные правила и вспомогательные определения игры.",
  Achievements: "Достижения",
  Currencies: "Валюты",
  Seasons: "Сезоны",
  Affixes: "Аффиксы",
  "Media files": "Медиафайлы",
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
  // Game registry (lib/games/registry.ts)
  beta: "бета",
  "Browse champions": "Чемпионы и способности",
  Champions: "Чемпионы",
  "Every champion, ability and skin": "Все чемпионы, способности и скины",
  Items: "Предметы",
  "Complete localized item database": "Полная локализованная база предметов",
  "Plan a build": "Собрать билд",
  Runes: "Руны",
  "Rune trees and keystones": "Ветки рун и краеугольные камни",
  "Prepare for lane": "Подготовка к линии",
  "Summoner Spells": "Заклинания призывателя",
  "Summoner spells with cooldowns": "Заклинания призывателя с перезарядкой",
  "League of Legends champion, item and rune database with official Data Dragon assets.":
    "База чемпионов, предметов и рун League of Legends с официальными ассетами Data Dragon.",
  "League of Legends and Riot Games are trademarks of Riot Games, Inc. Gildra is not affiliated with Riot Games.":
    "League of Legends и Riot Games — товарные знаки Riot Games, Inc. Gildra не связана с Riot Games.",
  "Official Data Dragon source ↗": "Официальный источник Data Dragon ↗",
  "Champion Database": "База чемпионов",
};

/** t(lang)("View All →") — RU-перевод или исходная строка. */
export const t =
  (lang: Lang) =>
  (s: string): string =>
    lang === "ru" ? (RU[s] ?? s) : s;

/** Navigation labels can differ from the same word in prose (hero "Meta" →
 *  "метой", nav "Meta" → "Мета"): `nav:<key>` wins, then the plain key. */
export const tNav =
  (lang: Lang) =>
  (s: string): string =>
    lang === "ru" ? (RU[`nav:${s}`] ?? RU[s] ?? s) : s;
