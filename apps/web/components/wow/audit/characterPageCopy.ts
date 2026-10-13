import type { Lang } from "@/lib/i18n";

/** Presentation copy only. Character names, item names and spell text come
 * from localized game sources and must never be translated with this map. */
const en = {
  "Подготавливаем модель…": "Preparing character model…",
  "Таланты": "Talents", "Загружены": "Loaded", "Нет данных": "No data",
  "Источник: Battle.net Specializations API. Это статус импорта, а не оценка силы билда.": "Source: Battle.net Specializations API. This is the import status, not a build strength rating.",
  "Предметов": "Items", "Источник: Battle.net Equipment API. Показано число импортированных предметов, а не рейтинг качества.": "Source: Battle.net Equipment API. Shows imported item count, not a quality rating.",
  "Чары": "Enchants", "Источник: enchantments в Battle.net Equipment API. Это число распознанных чар, а не процент оптимальности.": "Source: enchantments in Battle.net Equipment API. Counts imported enchants, not an optimization percentage.",
  "Нет сокетов": "No sockets", "Сокеты": "Sockets", "Источник: sockets в Battle.net Equipment API. Показана заполненность доступных сокетов, а не рейтинг персонажа.": "Source: sockets in Battle.net Equipment API. Shows filled sockets, not a character rating.",
  "Сессия Battle.net истекла. Переподключите аккаунт и повторите обновление.": "Your Battle.net session has expired. Reconnect your account and refresh again.",
  "Battle.net не разрешил доступ к профилю. Переподключите аккаунт и проверьте разрешения.": "Battle.net denied access to the profile. Reconnect your account and check permissions.",
  "Персонаж больше не найден среди персонажей подключённого аккаунта.": "This character was not found on the connected account.",
  "Battle.net обновил персонажа, но не отдал активный билд. Войдите в игру, переключите специализацию и выйдите из неё.": "Battle.net updated the character but did not return an active build. Log into the game, switch specialization, then log out.",
  "Battle.net вернул неполный профиль. Попробуйте снова после выхода персонажа из игры.": "Battle.net returned an incomplete profile. Try again after logging out of the game.",
  "Battle.net сейчас недоступен. Старые данные сохранены — попробуйте обновить позже.": "Battle.net is unavailable. Your existing data is preserved — try refreshing later.",
  "Не удалось обновить профиль.": "Could not refresh the profile.",
  "Профиль обновлён. Старые результаты расчётов сброшены.": "Profile refreshed. Previous simulation results have been cleared.",
  "Нет связи с сервером Gildra. Текущие данные не изменены.": "Cannot reach Gildra. Your current data has not changed.",
  "Не удалось получить диагностический отчёт": "Could not retrieve the diagnostic report",
  "Разделы World of Warcraft": "World of Warcraft sections", "Спеки": "Specializations", "Эпох+": "Mythic+", "Рейд": "Raid", "Гайды": "Guides", "Сравнение": "Compare", "Поиск по Gildra": "Search Gildra", "Поиск по Gildra…": "Search Gildra…",
  "Летопись героя": "Hero's chronicle", "Battle.net подключён": "Battle.net connected", "Персонаж и экипировка импортированы": "Character and equipment imported",
  "Проверяем функции…": "Checking features…", "Проверить функции": "Check features", "Данные обновлены": "Data refreshed", "Обновление не завершено": "Refresh incomplete", "Переподключить Battle.net": "Reconnect Battle.net", "К списку персонажей": "Back to characters", "Обновляем…": "Refreshing…", "Повторить": "Retry",
  "Все подключённые функции работают": "All connected features passed", "Диагностика нашла проблему": "Diagnostics found a problem", "Неизвестная ошибка": "Unknown error",
  "Книга героя": "Hero's chronicle", "Уровень": "Level", "тестовый персонаж": "test character", "Все персонажи аккаунта": "All account characters",
  "Уровень предметов": "Item level", "Рейтинг Эпох+": "Mythic+ rating", "Обновить": "Refresh", "Поделиться результатом расчёта": "Share a simulation result", "Поделиться": "Share", "Выберите расчёт ниже": "Choose a result below", "Ссылка скопирована": "Link copied",
  "Статус реальных данных Battle.net": "Battle.net character data status", "Персонаж импортирован из Battle.net; общая оценка не назначается без симуляции.": "Character imported from Battle.net; no overall score is assigned without simulation.", "Профиль персонажа": "Character profile",
  "Арсенал": "Armory", "Экипировка и характеристики": "Equipment and stats", "Предметы, характеристики и облик вашего персонажа.": "Your character's equipment, stats and appearance.", "Боевые показатели": "Combat stats", "Экипировка": "Equipment", "ур. предметов": "item level", "Оружие": "Weapons",
  "Таланты и симуляция": "Talents and simulation", "Соберите билд и сравните его урон в выбранном режиме боя.": "Build your loadout and compare damage for your chosen encounter.",
  "Боевая практика": "Combat practice", "Ротация и тренировка": "Rotation and training", "Настройте панель умений и проверьте ротацию на своём билде.": "Customize your action bar and test the rotation with your build.",
  "Разбор боя": "Combat analysis", "Логи и боевые данные": "Logs and combat data", "Сверьте расчёт с реальным боем и найдите потерянный урон по конкретным механикам.": "Compare the simulation with a real fight and find damage lost to specific mechanics.",
  "Хроника": "Chronicle", "История расчётов": "Simulation history", "Сохранённые снимки профиля, результаты симуляций и ссылки для сравнения прогресса.": "Saved profile snapshots, simulation results and links to compare your progress.",
  "Держите персонажа в форме — повторяйте аудит после еженедельного сундука.": "Keep your character ready — review your build after the weekly vault.", "Экипировка Battle.net API": "Equipment from Battle.net API", "Предметы из каталога": "Catalog items", "Тестовый набор предметов": "Test equipment",
  "Критический удар": "Critical strike", "Скорость": "Haste", "Искусность": "Mastery", "Универсальность": "Versatility", "Боевые характеристики персонажа": "Character combat stats",
  "Оптимально": "Optimal", "Хорошо": "Good", "Требует исправления": "Needs attention", "Не хватает улучшения": "Missing upgrade",
  "Описание открыто": "Description open", "Открыть описание предмета": "Open item description", "Чары установлены": "Enchanted", "Чары отсутствуют": "Not enchanted", "Описание предмета": "Item description", "Закрыть описание предмета": "Close item description", "Справка Gildra": "Gildra help",
  "Уровень предмета": "Item level", "ед. урона в секунду": "damage per second", "Прочность": "Durability", "Нет чар": "No enchant", "Комплект": "Set", "Источник": "Source", "Цена продажи": "Sell price", "Закреплено · нажмите по иконке ещё раз, чтобы закрыть": "Pinned · click the icon again to close", "Нажмите по иконке, чтобы закрепить": "Click the icon to pin",
  "Низкое качество": "Poor", "Обычный": "Common", "Необычный": "Uncommon", "Редкий": "Rare", "Эпический": "Epic", "Легендарный": "Legendary", "Артефакт": "Artifact", "Наследуемый": "Heirloom", "Неизвестное качество": "Unknown quality",
} as const;

export type CharacterPageText = keyof typeof en;
export const characterPageText = (lang: Lang) => (text: CharacterPageText): string => lang === "ru" ? text : en[text];

export const characterRoleLabel = (role: string, lang: Lang) => ({
  tank: ["Tank", "Танк"], healer: ["Healer", "Лекарь"], melee: ["Melee", "Ближний бой"], ranged: ["Ranged", "Дальний бой"], support: ["Support", "Поддержка"],
}[role]?.[lang === "ru" ? 1 : 0] ?? role);
