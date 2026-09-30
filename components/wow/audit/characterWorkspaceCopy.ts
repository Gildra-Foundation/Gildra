import type { CharacterRunKind } from "@/lib/wow/characterRunHistory";

export type WorkspaceLocale = "en" | "ru";

// Only application-authored UI copy belongs here; names from game data and users remain unchanged.
const englishCopy = {
  "Результат сохранён": "Result saved",
  "Ссылка скопирована. Данные аккаунта и полный профиль персонажа в неё не входят.": "Link copied. Account data and the full character profile are not included.",
  "Не удалось создать или скопировать ссылку.": "Could not create or copy the link.",
  "Ссылка отозвана. По старому адресу результат больше не откроется.": "Link revoked. The result is no longer available at the old address.",
  "Не удалось отозвать ссылку.": "Could not revoke the link.",
  "БОЕВОЙ АРХИВ": "COMBAT ARCHIVE",
  "Сохранённые расчёты": "Saved simulations",
  "Здесь остаются результаты для вашего персонажа. Если экипировка или таланты изменятся, мы пометим старые результаты.": "Your character’s results are saved here. We mark older results when your gear or talents change.",
  "Сохранено": "Saved",
  "в этой истории": "in this history",
  "Обновить историю": "Refresh history",
  "Загружаем историю…": "Loading history…",
  "История временно недоступна.": "History is temporarily unavailable.",
  "Повторить": "Try again",
  "Здесь пока пусто": "No saved results yet",
  "Измените талант, рассчитайте ротацию или сравните предмет — результат появится здесь автоматически.": "Change a talent, simulate a rotation, or compare an item to save a result here automatically.",
  "Таланты": "Talents",
  "Ротация": "Rotation",
  "Экипировка": "Gear",
  "цел.": "targets",
  "сек.": "sec",
  "Данные расчёта": "Simulation details",
  "Версия игры:": "Game build:",
  "Устарел": "Outdated",
  "Профиль изменился — пересчитайте": "Profile changed — simulate again",
  "Актуален": "Current",
  "Совпадает с текущим профилем": "Matches the current profile",
  "Отозвать": "Revoke",
  "Поделиться": "Share",
  "Только результат": "Result only",
  "Все источники": "All sources",
  "Рейды": "Raids",
  "Крафт": "Crafted",
  "Мир и торговцы": "World and vendors",
  "Одна цель": "Single target",
  "120 сек.": "120 sec",
  "Пачка": "Multiple targets",
  "5 целей": "5 targets",
  "Добивание": "Execute",
  "конец боя": "end of fight",
  "Профессия": "Profession",
  "Босс текущего сезона": "Current-season boss",
  "Торговец": "Vendor",
  "Задание": "Quest",
  "Источник не подтверждён": "Source unverified",
  "ПОДБОР СНАРЯЖЕНИЯ": "GEAR OPTIMIZER",
  "Что надеть вместо текущей вещи?": "Which item should you equip?",
  "Выберите слот и тип боя, затем сравните урон. До расчёта вещь не считается улучшением.": "Choose a slot and fight type, then compare damage. An item is only considered an upgrade after simulation.",
  "Ваши данные": "Your data",
  "Слот экипировки": "Equipment slot",
  "Сценарий расчёта": "Simulation scenario",
  "Сейчас надето": "Currently equipped",
  "ур.": "ilvl",
  "Доступный контент": "Available content",
  "Фильтр источника предметов": "Filter item sources",
  "Сравнить до 6 вещей": "Compare up to 6 items",
  "Ищем подходящие предметы": "Finding eligible items",
  "Проверяем слот, класс, сезон и источник добычи.": "Checking slot, class, season, and loot source.",
  "Не удалось загрузить предметы": "Could not load items",
  "Пока каталог недоступен, мы не будем советовать замену наугад.": "Item recommendations are unavailable while the catalog cannot be reached.",
  "Подробности ошибки": "Error details",
  "Подходящих замен пока нет": "No eligible replacements yet",
  "Попробуйте другой слот или источник предметов. Без проверенных данных мы не показываем рекомендацию.": "Try another slot or item source. Recommendations require verified data.",
  "Сейчас": "Current",
  "Кандидат": "Candidate",
  "Где получить": "Where to obtain",
  "Данные предмета": "Item details",
  "Обновление": "Patch",
  "· сборка": "· build",
  "подтверждена каталогом": "verified by catalog",
  "Ограничения": "Constraints",
  "Уникальный": "Unique-equipped",
  "Комплект:": "Set:",
  "Особых нет": "None",
  "Урон ещё не сравнивали": "Damage not yet compared",
  "Не проверено": "Not tested",
  "Нажмите «Сравнить DPS»": "Select “Compare DPS”",
  "Считаем…": "Simulating…",
  "Тот же персонаж и билд": "Same character and build",
  "Расчёт отклонён": "Simulation rejected",
  "Улучшение выше погрешности": "Upgrade exceeds uncertainty",
  "Возможный прирост не доказан": "Possible gain is not established",
  "Этот вариант слабее — не рекомендуем": "This option is weaker — not recommended",
  "Точность расчёта": "Simulation accuracy",
  "Погрешность ±": "Uncertainty ±",
  "% · уверенность": "% · confidence",
  "% ·": "% ·",
  "прогонов": "iterations",
  "Пересчитать": "Simulate again",
  "Сравнить DPS": "Compare DPS",
  "Уже получен": "Already owned",
  "Отметить полученным": "Mark as owned",
  "Показываем только проверенные предметы.": "Only verified items are shown.",
  "Отсутствующий источник или неподходящий сезон исключают вещь из списка.": "Items without a source or from an ineligible season are excluded.",
  "Как отбираются варианты": "How items are selected",
  "Нужны источник получения, текущий сезон и игровые варианты предмета.": "Items require an acquisition source, the current season, and in-game variants.",
  "Измеренный прирост показывается только после сравнения урона.": "Measured gains appear only after comparing damage.",
  "Сохраняем…": "Saving…",
  "Аккаунт синхронизирован": "Account synced",
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
  "БОЕВОЙ ЖУРНАЛ": "COMBAT LOG",
  "Разбор настоящего боя": "Analyze a real fight",
  "Здесь можно будет сравнить расчёт с тем, что произошло в игре.": "Compare your simulation with what happened in the game.",
  "Разбор боёв пока недоступен": "Fight analysis is currently unavailable",
  "Это настройка сервиса; с вашим персонажем и аккаунтом всё в порядке.": "The service is not configured; your character and account are unaffected.",
  "Подключите Warcraft Logs, чтобы увидеть свои действия и потери урона в конкретном бою.": "Connect Warcraft Logs to review your actions and damage losses in a specific fight.",
  "Нужен доступ к вашим отчётам": "Access to your reports is required",
  "Вы сами выбираете отчёт. Gildra не публикует и не меняет ваши логи.": "You choose the report. Gildra does not publish or modify your logs.",
  "Подключить Warcraft Logs": "Connect Warcraft Logs",
  "Что произошло в бою": "What happened in the fight",
  "Выберите отчёт и бой. Советы будут привязаны к вашим действиям и времени их применения.": "Choose a report and fight. Advice refers to your actions and their timing.",
  "Отключить": "Disconnect",
  "Как начать анализ": "How to start an analysis",
  "Выберите отчёт": "Choose a report",
  "Выберите бой": "Choose a fight",
  "Нажмите «Разобрать бой»": "Select “Analyze fight”",
  "Загружаем ваши последние отчёты…": "Loading your recent reports…",
  "Доступных отчётов пока нет.": "No reports are available yet.",
  "Вставьте ссылку на публичный отчёт или сначала загрузите бой в Warcraft Logs.": "Paste a public report link or upload a fight to Warcraft Logs first.",
  "Список отчётов не загрузился.": "Could not load the report list.",
  "Можно всё равно вставить прямую ссылку на доступный лог.": "You can still paste a direct link to an accessible log.",
  "Мои последние отчёты": "My recent reports",
  "Выберите отчёт…": "Choose a report…",
  "Ссылка или код отчёта": "Report link or code",
  "Найти отчёт": "Find report",
  "Конкретный бой": "Specific fight",
  "победа": "victory",
  "поражение": "defeat",
  "Разобрать бой": "Analyze fight",
  "Точный расчёт ротации сейчас недоступен. Мы покажем данные боя, но не будем сравнивать DPS и время применения умений с неточным прогнозом.": "An accurate rotation simulation is unavailable. Fight data is shown, but DPS and ability timing cannot be compared to an inaccurate prediction.",
  "Сначала рассчитайте ротацию выше — тогда сравним реальный бой с прогнозом для этого персонажа.": "Simulate the rotation above first to compare this fight with a prediction for your character.",
  "Фактический DPS": "Actual DPS",
  "сравнение пока недоступно": "comparison unavailable",
  "Умений в минуту": "Casts per minute",
  "Время усиления": "Buff uptime",
  "нет данных об усилении": "no buff data",
  "Задержка сильных умений": "Cooldown delay",
  "нужен сопоставимый расчёт": "comparable simulation required",
  "относительно расчёта": "relative to simulation",
  "Потерянный ресурс": "Wasted resource",
  "нет данных о ресурсе": "no resource data",
  "ресурс накопился сверх предела": "resource gained above the cap",
  "Смерти": "Deaths",
  "бой завершён": "fight completed",
  "бой не завершён победой": "fight did not end in victory",
  "Что исправить — с доказательствами": "What to improve — with evidence",
  "Открыть момент": "Open moment",
  "Советы основаны на выбранном бою Warcraft Logs.": "Advice is based on the selected Warcraft Logs fight.",
  "Источник и ограничения анализа": "Analysis source and limitations",
  "Отчёт": "Report",
  ", бой #": ", fight #",
  ", персонаж #": ", character #",
  ". DPS взят из WCL DamageDone с питомцами; советы построены по событиям умений, усилений, ресурса и смертей. Сравнение с SimulationCraft доступно только для сопоставимого боя по длительности и числу целей. Другие отчёты и персонажи не смешиваются.": ". DPS comes from WCL DamageDone including pets; advice uses ability, buff, resource, and death events. SimulationCraft comparisons require matching duration and target count. Other reports and characters are not mixed in.",
  "Сравнение урона и задержки умений скрыто: персонаж погиб до конца боя, поэтому полный расчёт здесь неприменим.": "Damage and cooldown timing comparisons are hidden because the character died before the fight ended, so the full simulation does not apply.",
  "Сравнение урона скрыто: сначала рассчитайте ротацию выше для этого персонажа и типа боя.": "Damage comparison is hidden. Simulate the rotation above for this character and fight type first.",
  "Warcraft Logs подключён": "Warcraft Logs connected",
  "Теперь выберите отчёт ниже или вставьте прямую ссылку на лог.": "Choose a report below or paste a direct log link.",
  "Warcraft Logs не разрешил подключение. Попробуйте ещё раз.": "Warcraft Logs did not authorize the connection. Try again.",
  "Проверка безопасности не прошла. Начните подключение заново.": "The security check failed. Start the connection again.",
  "Сессия Battle.net изменилась. Обновите страницу и подключитесь заново.": "Your Battle.net session changed. Refresh the page and reconnect.",
  "Подключение не завершено": "Connection incomplete",
  "Ссылка недоступна": "Link unavailable",
  "Она была отозвана владельцем, устарела или адрес неверен.": "The owner revoked it, it expired, or the address is invalid.",
  "На главную World of Warcraft": "World of Warcraft home",
  "Результат расчёта": "Simulation result",
  "Сценарий": "Scenario",
  "Движок": "Engine",
  "проверенный прогон": "verified run",
  "Дата": "Date",
  "Безопасная общая сводка": "Secure shared summary",
  "Здесь нет OAuth-токена, Battle.net ID, имени персонажа, списка предметов или исходного armory payload.": "This summary contains no OAuth token, Battle.net ID, character name, item list, or original Armory payload."
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

export function workspaceGearError(locale: WorkspaceLocale, code: string) {
  const errors: Record<string, { en: string; ru: string }> = {
    session_expired: { en: "Your Battle.net session expired. Reconnect your account.", ru: "Сессия Battle.net истекла. Подключите аккаунт заново." },
    rate_limited: { en: "Battle.net temporarily limited requests. Try again in a minute.", ru: "Battle.net временно ограничил запросы. Повторите через минуту." },
    character_not_found: { en: "The character was not found in this account.", ru: "Персонаж не найден в этом аккаунте." },
    equipped_slot_missing: { en: "Battle.net did not return an equipped item in this slot.", ru: "Battle.net не вернул предмет в этом слоте." },
    specialization_unresolved: { en: "The active specialization could not be verified.", ru: "Не удалось подтвердить активную специализацию." },
    candidate_not_in_verified_pool: { en: "This item is no longer in the verified candidate list. Reload the items.", ru: "Предмет больше не входит в проверенный список. Загрузите предметы заново." },
    equipped_item_not_in_catalog: { en: "The equipped item has no matching catalog entry.", ru: "Надетый предмет не найден в каталоге." },
    equipped_item_details_missing: { en: "The catalog has incomplete data for the equipped item.", ru: "В каталоге недостаточно данных о надетом предмете." },
    unsupported_equipment_slot: { en: "This equipment slot cannot be compared yet.", ru: "Сравнение для этого слота пока недоступно." },
    rotation_unavailable: { en: "No verified rotation is available for this specialization.", ru: "Для этой специализации нет проверенной ротации." },
  };
  return errors[code]?.[locale] ?? (locale === "ru" ? "Не удалось завершить запрос. Повторите позже." : "The request could not be completed. Try again later.");
}
