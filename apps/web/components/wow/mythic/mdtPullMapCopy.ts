export const mdtPullMapCopy = {
  ru: {
    mapLabel: "Статичная карта пулов", title: "Пулы на карте",
    incompatible: "Авторский маршрут пока несовместим с текущими данными. Показаны отдельные группы мобов, а не порядок прохождения.",
    instructions: "Один круг — один пул. Внутри — количество мобов, рядом — номер пула.",
    legend: "мобов в пуле", numberLegend: "Номер рядом с кругом — порядок пула", groupLegend: "Номер рядом с кругом — номер группы в списке",
    mapHint: "Наведите на круг: мобы, способности и действия по ролям. Нажмите, чтобы открыть памятку. Состав пулов не меняется. На телефоне карту можно прокрутить вбок.",
    floor: "Этаж", authoredRoute: "Маршрут автора ↗", mapAlt: "Карта подземелья MDT с обозначениями пулов",
    pull: "Пул", group: "Группа", boss: "Босс", composition: "Состав пулов", groupComposition: "Состав групп",
    enemyCount: (count: number) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? "моб" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "моба" : "мобов"}`, totalForces: "Всего сил",
    empty: "Данные о группах мобов пока недоступны.",
  },
  en: {
    mapLabel: "Static pull map", title: "Pulls on the map",
    incompatible: "The authored route is incompatible with the current data. Individual enemy groups are shown, not a route order.",
    instructions: "One circle per pull. The count inside is the number of enemies; the label beside it is the pull number.",
    legend: "enemies in a pull", numberLegend: "The label beside each circle shows pull order", groupLegend: "The label beside each circle identifies its group in the list",
    mapHint: "Hover a circle for enemies, abilities and role guidance. Press to open the briefing. Pull composition stays fixed. On narrow screens, scroll the map sideways.",
    floor: "Floor", authoredRoute: "Author’s route ↗", mapAlt: "MDT dungeon map with pull markers",
    pull: "Pull", group: "Group", boss: "Boss", composition: "Pull composition", groupComposition: "Group composition",
    enemyCount: (count: number) => `${count} ${count === 1 ? "enemy" : "enemies"}`, totalForces: "Total forces",
    empty: "Enemy group data is not available yet.",
  },
} as const;
