import type { CharacterRunKind } from "@/lib/wow/characterRunHistory";
import type { Lang } from "@/lib/i18n-paths";

export type WorkspaceLocale = Lang;

// Only application-authored UI copy belongs here; names from game data and users remain unchanged.
const englishCopy = {
  "Сохранённые расчёты": "Saved simulations",
  "Тип расчёта": "Simulation type",
  "Все": "All",
  "Сегодня": "Today",
  "Вчера": "Yesterday",
  "Загружаем историю…": "Loading history…",
  "История не загрузилась": "History didn't load",
  "Повторить": "Try again",
  "Здесь появятся ваши расчёты талантов, ротации и экипировки": "Your talent, rotation and gear results will appear here",
  "Открыть таланты": "Open talents",
  "DPS по пачке": "AoE DPS",
  "Устарел": "Outdated",
  "Профиль изменился — пересчитайте": "Profile changed — simulate again",
  "Поделиться": "Share",
  "Отозвать ссылку": "Revoke link",
  "Ссылка скопирована": "Link copied",
  "Ссылка отозвана": "Link revoked",
  "Не удалось скопировать": "Could not copy",
  "Не удалось отозвать": "Could not revoke",
  "цел.": "targets",
  "сек.": "sec",
  "Вставьте код из 16 символов или полную ссылку Warcraft Logs.": "Enter the 16-character code or the full Warcraft Logs link.",
  "Этот персонаж не участвовал в отчёте.": "This character did not participate in the report.",
  "Персонаж найден, но в отчёте нет завершённых боёв с его участием.": "The character was found, but the report has no completed fights featuring them.",
  "В отчёте несколько персонажей с таким именем, а сервер определить не удалось. Выберите другой отчёт.": "Several characters in this report share that name and the realm could not be identified. Choose another report.",
  "Доступ Warcraft Logs отозван или истёк. Подключите его заново.": "Warcraft Logs access was revoked or expired. Reconnect to continue.",
  "Отчёт не загрузился. Проверьте ссылку и доступ.": "The report could not be loaded. Check the link and access permissions.",
  "В выбранном бою персонаж был в другой специализации.": "The character used a different specialization in this fight.",
  "Персонаж страницы не совпал с участником лога. Загрузите отчёт заново.": "This character does not match the log participant. Load the report again.",
  "В бою слишком много событий для безопасного разбора. Выберите отдельный encounter, а не весь длинный лог.": "This fight has too many events to analyze. Choose an individual encounter instead of the full log.",
  "События боя временно недоступны.": "Fight events are temporarily unavailable.",
  "Не удалось отключить Warcraft Logs. Обновите страницу и попробуйте ещё раз.": "Could not disconnect Warcraft Logs. Refresh the page and try again.",
  "Проверяем Warcraft Logs…": "Checking Warcraft Logs…",
  "Разбор боёв пока недоступен": "Fight analysis is currently unavailable",
  "Подключить Warcraft Logs": "Connect Warcraft Logs",
  "Отключить": "Disconnect",
  "Загружаем ваши последние отчёты…": "Loading your recent reports…",
  "Список отчётов не загрузился.": "Could not load the report list.",
  "Мои последние отчёты": "My recent reports",
  "Выберите отчёт…": "Choose a report…",
  "Ссылка или код отчёта": "Report link or code",
  "Найти отчёт": "Find report",
  "победа": "victory",
  "поражение": "defeat",
  "Разобрать бой": "Analyze fight",
  "Фактический DPS": "Actual DPS",
  "Умений в минуту": "Casts per minute",
  "Время усиления": "Buff uptime",
  "Задержка сильных умений": "Cooldown delay",
  "Потерянный ресурс": "Wasted resource",
  "Смерти": "Deaths",
  "Открыть момент": "Open moment",
  "Warcraft Logs подключён": "Warcraft Logs connected",
  "Warcraft Logs не разрешил подключение. Попробуйте ещё раз.": "Warcraft Logs did not authorize the connection. Try again.",
  "Проверка безопасности не прошла. Начните подключение заново.": "The security check failed. Start the connection again.",
  "Сессия Battle.net изменилась. Обновите страницу и подключитесь заново.": "Your Battle.net session changed. Refresh the page and reconnect.",
  "Ссылка недоступна": "Link unavailable",
  "Она была отозвана владельцем, устарела или адрес неверен.": "The owner revoked it, it expired, or the address is invalid.",
  "На главную World of Warcraft": "World of Warcraft home",
  "Сценарий": "Scenario",
  "Дата": "Date",
  "Подключите Warcraft Logs, чтобы разобрать свой бой.": "Connect Warcraft Logs to review your fight.",
  "Бой": "Fight",
  "Что исправить": "What to improve"
} as const;

export function characterWorkspaceCopy(locale: WorkspaceLocale) {
  return (key: keyof typeof englishCopy): string => locale === "ru" ? key : englishCopy[key];
}


export function workspaceLocale(prefix: "" | "/ru"): WorkspaceLocale { return prefix === "/ru" ? "ru" : "en"; }
export function workspaceNumber(locale: WorkspaceLocale, value: number, digits = 0) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
export function workspaceKind(locale: WorkspaceLocale, kind: CharacterRunKind) {
  return ({ en: { talent: "Talents", rotation: "Rotation", gear: "Gear" }, ru: { talent: "Таланты", rotation: "Ротация", gear: "Экипировка" } } as const)[locale][kind];
}
export function workspaceScenario(locale: WorkspaceLocale, id: string) {
  const scenarios: Record<string, { en: string; ru: string }> = {
    "single-target": { en: "Single target", ru: "Одна цель" },
    "single": { en: "Single target", ru: "Одна цель" },
    "aoe": { en: "Area damage", ru: "Урон по области" },
    "execute": { en: "Execute", ru: "Добивание" },
    "raid": { en: "Raid", ru: "Рейд" },
    "mythic-plus": { en: "Mythic+", ru: "Мифик+" },
    "solo-pve": { en: "Solo PvE", ru: "Соло PvE" },
    "pve-aoe": { en: "AoE PvE", ru: "AoE PvE" },
    "solo-pvp": { en: "Solo PvP", ru: "Соло PvP" },
    "battleground": { en: "Battleground", ru: "Поле боя" },
    "arena-2v2": { en: "2v2 Arena", ru: "Арена 2 на 2" },
    "arena-3v3": { en: "3v3 Arena", ru: "Арена 3 на 3" },
  };
  return scenarios[id]?.[locale] ?? id;
}

/** "4 цели · 5 мин" / "4 targets · 5 min" — the size of a simulated fight. */
export function workspaceScenarioSize(locale: WorkspaceLocale, targets: number, durationSeconds: number) {
  const plural = new Intl.PluralRules(locale === "ru" ? "ru-RU" : "en-US").select(targets);
  const target = locale === "ru"
    ? ({ one: "цель", few: "цели" } as Record<string, string>)[plural] ?? "целей"
    : plural === "one" ? "target" : "targets";
  const minutes = durationSeconds % 60 === 0 && durationSeconds >= 60;
  const duration = minutes
    ? `${durationSeconds / 60} ${locale === "ru" ? "мин" : "min"}`
    : `${durationSeconds} ${locale === "ru" ? "с" : "s"}`;
  return `${workspaceNumber(locale, targets)} ${target} · ${duration}`;
}

export function workspaceRunLabel(locale: WorkspaceLocale, run: { kind: CharacterRunKind; label: string; scenario: { id: string } }) {
  // Legacy records contain generated prefixes. Resolve their UI from structured
  // kind/scenario fields, retaining item names and any custom record title.
  const [prefix, ...parts] = run.label.split(" · ");
  const generated = {
    talent: ["Таланты", "Talents"],
    rotation: ["Ротация", "Rotation", "Оптимизированная ротация", "Optimized rotation"],
    gear: ["Экипировка", "Gear"],
  };
  if (!parts.length || !generated[run.kind].includes(prefix)) return run.label;
  if (run.kind !== "gear" && ![run.scenario.id, workspaceScenario("en", run.scenario.id), workspaceScenario("ru", run.scenario.id)].includes(parts.join(" · "))) return run.label;
  const kind = prefix === "Оптимизированная ротация" || prefix === "Optimized rotation"
    ? locale === "ru" ? "Оптимизированная ротация" : "Optimized rotation"
    : workspaceKind(locale, run.kind);
  return `${kind} · ${run.kind === "gear" ? parts.join(" · ") : workspaceScenario(locale, run.scenario.id)}`;
}

export function workspaceVisibility(locale: WorkspaceLocale, visibility: string) {
  const labels: Record<string, { en: string; ru: string }> = {
    public: { en: "Public", ru: "Публичный" },
    private: { en: "Private", ru: "Приватный" },
    unlisted: { en: "Unlisted", ru: "Доступ по ссылке" },
  };
  return labels[visibility.toLowerCase()]?.[locale] ?? visibility;
}
