export const savedTalentBuildsCopy = {
  ru: {
    title: "Мои билды", label: "Сохранённые билды", choose: "Выберите билд", empty: "Сохранённых билдов пока нет. Импортируйте строку ниже и дайте билду название.",
    hint: "Выберите билд — класс, специализация, роль и подсказки переключатся сразу. Билды сохраняются в этом браузере для всех подземелий.",
    name: "Название билда", placeholder: "Например: М+ — защита", save: "Сохранить билд", rename: "Сохранить название", remove: "Удалить из списка",
    saved: "Билд сохранён.", renamed: "Название сохранено.", deleted: "Билд удалён из списка.",
    outdated: "нужен новый экспорт", unavailable: "Этот билд нельзя применить к текущему дереву талантов. Импортируйте свежую строку. Текущий выбор не изменён.",
    memoryOnly: "Браузер не разрешил сохранить список. Билды доступны только в этой вкладке до её перезагрузки.", corrupt: "Часть сохранённых данных не удалось прочитать. Доступные билды показаны в списке.",
    errors: { name: "Введите название до 64 символов.", limit: "Можно сохранить до 20 билдов. Удалите ненужный билд и попробуйте снова.", invalid: "Сначала импортируйте актуальную строку талантов." },
  },
  en: {
    title: "My builds", label: "Saved builds", choose: "Choose a build", empty: "No saved builds yet. Import a string below and give your build a name.",
    hint: "Choose a build to switch class, specialization, role and advice instantly. Builds are saved in this browser for every dungeon.",
    name: "Build name", placeholder: "For example: Mythic+ — defensive", save: "Save build", rename: "Save name", remove: "Remove from list",
    saved: "Build saved.", renamed: "Name saved.", deleted: "Build removed from the list.",
    outdated: "fresh export needed", unavailable: "This build cannot be applied to the current talent tree. Import a fresh string. Your current selection has not changed.",
    memoryOnly: "Your browser did not allow saving the list. Builds are available only in this tab until it reloads.", corrupt: "Some saved data could not be read. Available builds are shown in the list.",
    errors: { name: "Enter a name up to 64 characters.", limit: "You can save up to 20 builds. Remove an unused build and try again.", invalid: "Import a current talent string first." },
  },
} as const;
