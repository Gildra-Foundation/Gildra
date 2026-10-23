/** Words of the analytics page (/analytics, /ru/analytics). */
export const analyticsCopy = {
  en: {
    title: "Live analytics",
    subtitle: "Product activity over the selected period",
    events: "Events",
    users: "Unique users",
    subscriptions: "Active subscriptions",
    activity: "Hourly activity",
    hours: (hours: number) => `Last ${hours} hours`,
    empty: "Analytics will appear after the first events arrive.",
  },
  ru: {
    title: "Живая аналитика",
    subtitle: "Активность продукта за выбранный период",
    events: "События",
    users: "Уникальные пользователи",
    subscriptions: "Активные подписки",
    activity: "Активность по часам",
    hours: (hours: number) => `Последние ${hours} ч.`,
    empty: "Аналитика появится после поступления первых событий.",
  },
};
