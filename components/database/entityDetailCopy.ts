import type { Lang } from "@/lib/i18n";

/** Interface copy of a catalog record page (/database/<type>/<id>/<slug> and the library mirror). */
export const entityDetailCopy = {
  ru: {
    breadcrumbsLabel: "Навигация",
    database: "База данных",
    library: "Библиотека",
    factsLabel: "Сведения о записи",
    gameId: "ID в игре",
    build: "Сборка",
    updated: "Обновлено",
    unresolved: "Числа в этом описании зависят от характеристик персонажа и пока не подставлены.",
    tooltipTitle: "Игровая подсказка",
    tooltipText: "Показаны только поля, подтверждённые данными игры.",
    tooltipMissingTitle: "Подсказка пока не готова",
    tooltipMissingText: "Запись есть в базе, но игровая подсказка для неё ещё не собрана.",
    relationsTitle: "Связанные записи",
    relationsCount: (n: number) => `Связей: ${n}`,
    recordTitle: "Данные записи",
    recordText: "Названия на обоих языках, изображения, история версий клиента и полнота данных.",
    names: "Названия и описания",
    namesNote: "Только тексты из игрового клиента, без машинного перевода.",
    name: "Название",
    clientText: "Текст в клиенте",
    resolvedText: "С подставленными значениями",
    noValue: "Нет значения в источнике",
    unresolvedValue: "Значения в описании пока не подставлены",
    images: "Изображения",
    imageUnavailable: "Изображение недоступно",
    versions: "История версий",
    versionsCount: (n: number) => `${n} ${pluralVersions(n)}`,
    fromBuild: "Старая сборка",
    toBuild: "Новая сборка",
    compare: "Сравнить",
    field: "Поле",
    noChanges: "В отображаемых полях изменений нет.",
    oneBuild: "История хранится по версиям клиента; пока сохранена только одна сборка, сравнивать не с чем.",
    buildLine: (build: number, revision: number) => `Сборка ${build} · ред. ${revision}`,
    source: "Источник",
    noData: "Нет данных",
    completeness: "Полнота данных",
    status: { verified: "Проверено", partial: "Частично", minimal: "Минимум данных" } as Record<string, string>,
    meterLabel: "Полнота записи",
    notYet: "Пока нет",
    sources: "Источники",
    documents: (n: number) => `${n} документов`,
    open: "Открыть",
    noSource: "Отдельный источник для этой записи пока не указан.",
    payload: "Исходная запись (JSON)",
    yes: "да",
    no: "нет",
  },
  en: {
    breadcrumbsLabel: "Breadcrumbs",
    database: "Database",
    library: "Library",
    factsLabel: "Record facts",
    gameId: "Game ID",
    build: "Build",
    updated: "Updated",
    unresolved: "The numbers in this description depend on character stats and are not filled in yet.",
    tooltipTitle: "In-game tooltip",
    tooltipText: "Only fields confirmed by game data are shown.",
    tooltipMissingTitle: "The tooltip is not ready yet",
    tooltipMissingText: "The record exists, but its in-game tooltip has not been prepared yet.",
    relationsTitle: "Related records",
    relationsCount: (n: number) => `${n} ${n === 1 ? "relation" : "relations"}`,
    recordTitle: "Record data",
    recordText: "Names in both languages, images, client build history and data completeness.",
    names: "Names and descriptions",
    namesNote: "Only texts from the game client, no machine translation.",
    name: "Name",
    clientText: "Client text",
    resolvedText: "With values filled in",
    noValue: "No source value",
    unresolvedValue: "Values in this description are not filled in yet",
    images: "Images",
    imageUnavailable: "Image unavailable",
    versions: "Version history",
    versionsCount: (n: number) => `${n} stored ${n === 1 ? "version" : "versions"}`,
    fromBuild: "From build",
    toBuild: "To build",
    compare: "Compare",
    field: "Field",
    noChanges: "No changes in the displayed fields.",
    oneBuild: "History is kept per client build; only one build is stored so far, so there is nothing to compare yet.",
    buildLine: (build: number, revision: number) => `Build ${build} · rev. ${revision}`,
    source: "Source",
    noData: "No data",
    completeness: "Data completeness",
    status: { verified: "Verified", partial: "Partial", minimal: "Minimal data" } as Record<string, string>,
    meterLabel: "Record completeness",
    notYet: "Not available yet",
    sources: "Sources",
    documents: (n: number) => `${n} documents`,
    open: "Open",
    noSource: "No separate source is linked to this record yet.",
    payload: "Source record (JSON)",
    yes: "yes",
    no: "no",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type EntityDetailCopy = (typeof entityDetailCopy)[Lang];

function pluralVersions(n: number) {
  const rule = new Intl.PluralRules("ru-RU").select(n);
  return rule === "one" ? "сохранённая версия" : rule === "few" ? "сохранённые версии" : "сохранённых версий";
}

export const relationLabels: Record<string, { en: string; ru: string }> = {
  obtained_from: { en: "Obtained from", ru: "Добывается" }, drops: { en: "Drops", ru: "Добыча" }, rewards: { en: "Rewards", ru: "Награда" },
  sold_by: { en: "Sold by", ru: "Продаёт" }, teaches: { en: "Teaches", ru: "Обучает" }, crafted_by: { en: "Crafted by", ru: "Создаётся" },
  requires: { en: "Requires", ru: "Требует" }, reagent_for: { en: "Used in", ru: "Используется" }, owned_by: { en: "Belongs to", ru: "Принадлежит" },
  grants: { en: "Grants", ru: "Даёт" }, modifies: { en: "Modifies", ru: "Изменяет" },
  mentions: { en: "Mentions", ru: "Упоминает" },
};

export const mediaKindLabels: Record<string, [en: string, ru: string]> = {
  icon: ["Icon", "Иконка"], render: ["Render", "Изображение"], image: ["Image", "Изображение"], model: ["Model", "Модель"],
  screenshot: ["Screenshot", "Скриншот"], portrait: ["Portrait", "Портрет"], map: ["Map", "Карта"], background: ["Background", "Фон"],
};

/** Player-facing wording of the API completeness checks (the API texts describe the import pipeline). */
export const qualityCheckCopy: Record<string, { en: [string, string]; ru: [string, string] }> = {
  name: { en: ["Name", "The name in this language"], ru: ["Название", "Название на языке страницы"] },
  description: { en: ["Description", "Description text from the game"], ru: ["Описание", "Текст описания из игры"] },
  tooltip: { en: ["Tooltip", "The in-game tooltip is assembled"], ru: ["Подсказка", "Игровая подсказка собрана"] },
  icon: { en: ["Icon", "The game icon is known"], ru: ["Иконка", "Известна иконка из игры"] },
  facts: { en: ["Properties", "Level, slot, type and other properties"], ru: ["Свойства", "Уровень, слот, тип и другие свойства"] },
  source: { en: ["Source", "Linked to a specific game build"], ru: ["Источник", "Привязано к конкретной сборке игры"] },
  relationships: { en: ["Relations", "Links to related records"], ru: ["Связи", "Ссылки на связанные записи"] },
};

export const relationAttributeLabels: Record<string, [string, string]> = {
  chance_percent: ["Drop chance", "Шанс добычи"], quantity: ["Quantity", "Количество"],
  difficulty: ["Difficulty", "Сложность"], rank: ["Rank", "Ранг"], source: ["Source", "Источник"],
  reward_type: ["Reward type", "Тип награды"], amount: ["Amount", "Количество"], is_choice: ["Choice reward", "Награда на выбор"],
};

export const rewardTypeLabels: Record<string, [string, string]> = {
  item: ["Item", "Предмет"], currency: ["Currency", "Валюта"], reputation: ["Reputation", "Репутация"],
  spell: ["Spell", "Заклинание"], title: ["Title", "Звание"], experience: ["Experience", "Опыт"], money: ["Money", "Деньги"],
};
