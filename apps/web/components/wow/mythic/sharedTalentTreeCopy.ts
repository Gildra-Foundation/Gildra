export const sharedTalentTreeCopy = {
  ru: {
    open: "Посмотреть дерево талантов", title: "Таланты билда", close: "Закрыть дерево талантов", class: "Класс", spec: "Специализация", hero: "Героические", tree: "Ветка талантов",
    loading: "Загружаем дерево талантов…", failed: "Не удалось загрузить дерево талантов. Билд и сохранённые данные не изменены.", retry: "Повторить загрузку",
    mismatch: "Дерево талантов обновилось и не совпадает с этим экспортом. Попросите автора прислать свежую ссылку.",
    hint: "Выбранные таланты выделены цветом и отметкой ✓. Нажмите на узел, чтобы прочитать описание. Просмотр не меняет билд.",
    selected: "Выбран", unselected: "Не выбран", rank: "Ранг", granted: "Доступен автоматически", points: "Вложено очков", chosen: "Выбранные таланты", noHero: "Героические таланты в этом билде не выбраны.", source: "Источник дерева", pan: "Дерево можно прокручивать в обе стороны.", noTalents: "В этой ветке нет выбранных талантов.",
  },
  en: {
    open: "View talent tree", title: "Build talents", close: "Close talent tree", class: "Class", spec: "Specialization", hero: "Hero talents", tree: "Talent branch",
    loading: "Loading talent tree…", failed: "Could not load the talent tree. Your build and saved data are unchanged.", retry: "Retry loading",
    mismatch: "The talent tree has changed and no longer matches this export. Ask the author for a fresh link.",
    hint: "Selected talents are highlighted and marked ✓. Press a node to read its description. Viewing does not change the build.",
    selected: "Selected", unselected: "Not selected", rank: "Rank", granted: "Granted automatically", points: "Points spent", chosen: "Selected talents", noHero: "No hero talents are selected in this build.", source: "Tree source", pan: "You can scroll the tree in both directions.", noTalents: "No talents selected in this branch.",
  },
} as const;
