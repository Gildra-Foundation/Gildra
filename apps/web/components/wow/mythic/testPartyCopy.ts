import type { PartyRole, PartyTalent } from "./testPartyData";

/**
 * Interface copy of the demo party panel (lazy chunk of the route planner).
 * Character names are preserved; class, spec and ability names use original localized sources. The fixture itself
 * lives in testPartyData.ts.
 */
type TalentTree = PartyTalent["tree"];

const ru = {
  eyebrow: "5 игроков · один общий план",
  title: "Команда и план действий",
  lede: "Состав группы, способности каждого игрока и все действия для выбранного шага маршрута.",
  playingAs: "Я играю за",
  savedLocally: "Изменения сохранены на этом устройстве",
  demoTitle: "Демонстрационные тестовые данные.",
  demoText: "Персонажи, уровни предметов, рейтинг, билды и назначения ниже вымышлены только для проверки интерфейса и не являются игровыми рекомендациями.",
  localeNote: "Тестовые персонажи · изменения хранятся только в этом браузере",
  nowPlaying: (character: string) => `Вы играете за ${character}`,
  buildCopied: "Код билда скопирован",
  copyBuildPrompt: "Скопируйте код билда",
  needInstruction: "Добавьте короткую команду игроку",
  assignmentAdded: "Назначение добавлено",
  partyReset: "Тестовая группа сброшена",

  rosterLabel: "Состав группы",
  roster: "Команда",
  allReady: "Все 5 готовы",
  rolesLabel: "Роли группы",
  roleCounts: { tank: "1 защищает", healer: "1 лечит", dps: "3 атакуют" } as Record<PartyRole, string>,
  itemLevel: (value: number) => `уровень ${value}`,
  rating: "рейтинг",
  assignedActions: "Назначено действий",
  you: "Вы",
  logInAs: (character: string) => `Войти как ${character}`,
  resetParty: "Вернуть исходный состав",

  talentsLabel: (character: string) => `Таланты ${character}`,
  abilitiesTitle: "Способности игрока",
  buildTitle: "Билд для подземелья",
  itemLevelShort: "Уровень",
  ratingShort: "Рейтинг",
  keyAbilities: "Важных умений",
  copyBuild: "Скопировать билд",
  copyBuildHint: "Для импорта в игру",
  talentFilter: "Фильтр талантов",
  chosenTalents: "Выбранные таланты",
  allTrees: "Все",
  trees: { class: "Общие", spec: "Специализация", hero: "Героические" } as Record<TalentTree, string>,
  buildCode: "Код для игры",
  fitsKey: (level: number) => `подходит для +${level}`,

  briefingLabel: "Тактические назначения",
  briefingEyebrow: "Кто, где и когда",
  briefingLede: "Действия команды для выбранного шага маршрута",
  selectedStep: "Выбранный шаг",
  statsLabel: "Сводка назначений",
  totalActions: "Всего действий",
  inThisStep: "в этом шаге",
  involved: "Участвуют",
  partyPlayers: "игроков команды",
  firstToLast: "От первого до последнего",
  secondsAfterPull: "секунды после начала боя",
  formationLabel: "Схема позиций группы",
  formationTitle: "Расстановка группы",
  topView: "Вид сверху",
  enemies: "Враги",
  dangerFront: "опасная зона спереди",
  groupStart: "Старт группы",
  timelineTitle: "Что происходит по порядку",
  planReady: "План готов",
  presses: (ability: string) => `Нажимает: ${ability}`,
  removeAssignment: (character: string) => `Удалить назначение ${character}`,
  noAssignments: "Для этой точки пока нет назначений.",

  builderLabel: "Добавить действие игроку",
  builderTitle: "Добавить действие",
  builderStep: (title: string) => `Шаг «${title}»`,
  who: "Кто",
  whatToPress: "Что нажать",
  whereToStand: "Где стоять",
  whenSeconds: "Когда, сек.",
  task: "Задача",
  taskPlaceholder: "Например: прервать второе заклинание",
  addAction: "Добавить действие",
};

export type TestPartyCopy = typeof ru;

const en: TestPartyCopy = {
  eyebrow: "5 players · one shared plan",
  title: "Party and action plan",
  lede: "Party composition, each player's abilities and every action for the selected route step.",
  playingAs: "I play as",
  savedLocally: "Changes are saved on this device",
  demoTitle: "Demonstration test data.",
  demoText: "The characters, item levels, rating, builds, and assignments below are fictional UI fixtures and are not gameplay recommendations. Talent and assignment notes are written in Russian for now.",
  localeNote: "Demo characters · changes are stored only in this browser",
  nowPlaying: (character) => `You play as ${character}`,
  buildCopied: "Build code copied",
  copyBuildPrompt: "Copy the build code",
  needInstruction: "Add a short instruction for the player",
  assignmentAdded: "Assignment added",
  partyReset: "Test party reset",

  rosterLabel: "Party roster",
  roster: "Party",
  allReady: "All 5 ready",
  rolesLabel: "Party roles",
  roleCounts: { tank: "1 tank", healer: "1 healer", dps: "3 damage" },
  itemLevel: (value) => `item level ${value}`,
  rating: "rating",
  assignedActions: "Assigned actions",
  you: "You",
  logInAs: (character) => `Play as ${character}`,
  resetParty: "Restore the original party",

  talentsLabel: (character) => `${character} talents`,
  abilitiesTitle: "Player abilities",
  buildTitle: "Dungeon build",
  itemLevelShort: "Item level",
  ratingShort: "Rating",
  keyAbilities: "Key abilities",
  copyBuild: "Copy build",
  copyBuildHint: "To import in game",
  talentFilter: "Talent filter",
  chosenTalents: "Chosen talents",
  allTrees: "All",
  trees: { class: "Class", spec: "Specialization", hero: "Hero" },
  buildCode: "In-game code",
  fitsKey: (level) => `fits +${level}`,

  briefingLabel: "Tactical assignments",
  briefingEyebrow: "Who, where and when",
  briefingLede: "Party actions for the selected route step",
  selectedStep: "Selected step",
  statsLabel: "Assignment summary",
  totalActions: "Total actions",
  inThisStep: "in this step",
  involved: "Involved",
  partyPlayers: "party players",
  firstToLast: "First to last",
  secondsAfterPull: "seconds after the pull",
  formationLabel: "Party positions",
  formationTitle: "Party formation",
  topView: "Top view",
  enemies: "Enemies",
  dangerFront: "danger zone in front",
  groupStart: "Party start",
  timelineTitle: "What happens in order",
  planReady: "Plan ready",
  presses: (ability) => `Presses: ${ability}`,
  removeAssignment: (character) => `Remove ${character}'s assignment`,
  noAssignments: "No assignments for this step yet.",

  builderLabel: "Add an action for a player",
  builderTitle: "Add an action",
  builderStep: (title) => `Step “${title}”`,
  who: "Who",
  whatToPress: "What to press",
  whereToStand: "Where to stand",
  whenSeconds: "When, sec",
  task: "Task",
  taskPlaceholder: "For example: interrupt the second cast",
  addAction: "Add action",
};

export const testPartyCopy = { ru, en } as const;

export const partyRoleLabels: Record<"ru" | "en", Record<PartyRole, string>> = {
  ru: { tank: "Защита", healer: "Лечение", dps: "Урон" },
  en: { tank: "Tank", healer: "Healer", dps: "Damage" },
};

const positionLabels: Record<"ru" | "en", Record<string, string>> = {
  ru: { "Перед боссом": "Перед боссом", "Мили слева": "Рядом слева", "Мили справа": "Рядом справа", "Дальний слева": "Вдали слева", "Дальний справа": "Вдали справа", "У края": "У края" },
  en: { "Перед боссом": "In front of the boss", "Мили слева": "Close, left", "Мили справа": "Close, right", "Дальний слева": "Far, left", "Дальний справа": "Far, right", "У края": "At the edge" },
};

export function partyPositionLabel(position: string, locale: "ru" | "en") {
  return positionLabels[locale][position] ?? position;
}

/** Fixture notes are Russian; this keeps them free of raid slang. */
export function plainPartyText(text: string) {
  return text
    .replaceAll("АоЕ-сайленс", "Запрещает всем врагам произносить заклинания")
    .replaceAll("ranged interrupt", "Прерывание издалека")
    .replaceAll("magic defensive", "защита от магии")
    .replaceAll("defensive", "защита")
    .replaceAll("Mitigation", "Использовать защиту")
    .replaceAll("stun", "оглушение")
    .replaceAll("Бёрст-лечение", "Очень сильное лечение")
    .replaceAll("Бёрст", "Сильный урон")
    .replaceAll("бёрста", "сильного урона")
    .replaceAll("Кик", "Прервать")
    .replaceAll("кик", "прерывание")
    .replaceAll("Стоп", "Остановить")
    .replaceAll("Пурж", "Снять усиление")
    .replaceAll("Bloodlust", "Усиление всей группы")
    .replaceAll("паков", "групп врагов")
    .replaceAll("паком", "группой врагов")
    .replaceAll("пулл", "группу врагов")
    .replaceAll("пак", "группу врагов")
    .replaceAll("whelps", "маленьких драконов")
    .replaceAll("стаков", "уровней эффекта")
    .replaceAll("аддах", "дополнительных врагах");
}
