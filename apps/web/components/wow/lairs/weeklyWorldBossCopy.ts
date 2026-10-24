/** Interface copy for the region-specific weekly confirmation. */
export const weeklyWorldBossCopy = {
  ru: {
    title: "Босс недели",
    region: "Регион",
    confirmedUntil: "Подтверждено до сброса",
    dateLocale: "ru-RU",
    confirmationSource: "Источник подтверждения",
    checking: "Проверяем актуальность недели…",
    unconfirmed: (region: string) => `Активный мировой босс для региона ${region} на эту неделю ещё не подтверждён. Ниже доступны руководства по всем боссам.`,
  },
  en: {
    title: "World boss this week",
    region: "Region",
    confirmedUntil: "Confirmed until reset",
    dateLocale: "en-GB",
    confirmationSource: "Confirmation source",
    checking: "Checking this week's confirmation…",
    unconfirmed: (region: string) => `This week's active world boss for ${region} has not been confirmed. Guides for every boss are available below.`,
  },
};
