export const talentCopy = {
  en: {
    title: "Talent calculator", lede: "Plan talents to level 60.", classTitle: (name: string) => `${name} talents`, aboutClass: "About the class",
    trees: "Talent trees", classes: "Choose a class", level: "Level", requiredLevel: "Required level", talented: "Talented · Legacy", rank: "Rank",
    remaining: "Points left", spent: "Points spent", reset: "Reset", resetTree: "Reset tree", undo: "Undo", share: "Copy link",
    copied: "Link copied", copyFailed: "Copy the link from your address bar.", add: "Add rank", remove: "Remove rank",
    nextRank: "Next rank", currentRank: "Current rank", requires: "Requires", or: "or", treePoints: "points in this tree",
    gatePoints: "eligible points", details: "Spell details", unavailable: "Cannot change this rank without breaking the build.",
    levelConflict: "Remove talent points before lowering the level or Talented rank.", invalid: "This build link cannot be opened.",
    stale: "This build uses a different talent tree. Start a new build.", start: "Start a new build",
    noScript: "Enable JavaScript to spend talent points.", inspector: "Talent details",
  },
  ru: {
    title: "Калькулятор талантов", lede: "Распределите таланты до 60-го уровня.", classTitle: (name: string) => `Таланты: ${name}`, aboutClass: "О классе",
    trees: "Ветки талантов", classes: "Выберите класс", level: "Уровень", requiredLevel: "Нужен уровень", talented: "Талантливый · Наследие", rank: "Ранг",
    remaining: "Осталось очков", spent: "Потрачено очков", reset: "Сбросить", resetTree: "Сбросить ветку", undo: "Отменить", share: "Копировать ссылку",
    copied: "Ссылка скопирована", copyFailed: "Скопируйте ссылку из адресной строки.", add: "Добавить ранг", remove: "Убрать ранг",
    nextRank: "Следующий ранг", currentRank: "Текущий ранг", requires: "Требуется", or: "или", treePoints: "очков в этой ветке",
    gatePoints: "учитываемых очков", details: "Подробнее о заклинании", unavailable: "Изменение этого ранга нарушит требования сборки.",
    levelConflict: "Уберите очки талантов, прежде чем снижать уровень или ранг наследия.", invalid: "Не удалось открыть сборку по этой ссылке.",
    stale: "В этой сборке другое дерево талантов. Создайте новую сборку.", start: "Новая сборка",
    noScript: "Включите JavaScript, чтобы распределять очки талантов.", inspector: "Описание таланта",
  },
} as const;
