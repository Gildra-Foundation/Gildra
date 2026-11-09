/** Player actions and section names, kept in parity for both locales. */
export const wowHomeCopy = {
  ru: {
    eyebrow: "Midnight", title: "Ваш командный центр в Азероте", character: "Мои персонажи", play: "В бой",
    seasonTitle: "Подземелья и рейды", meta: "Мета недели", mythicText: "Маршруты, таймеры и тактики подземелий сезона.", dungeons: "Выбрать подземелье",
    raids: "Рейды", raidText: "Боссы и тактики для вашей роли.", explore: "Откройте Азерот", tools: "Всё для вашего героя",
    featured: {
      map: { title: "Карта мира", text: "Континенты, подземелья и рейды — найдите следующую цель." },
      classes: { title: "Классы и таланты", text: "Выберите специализацию и соберите свой билд." },
    },
    toolsCopy: { tierLists: "Тир-листы", library: "Библиотека", transmog: "Трансмогрификация", lairs: "Логова и мировые боссы", characters: "Персонажи" },
    news: "Что нового", allNews: "Все изменения",
  },
  en: {
    eyebrow: "Midnight", title: "Your command center in Azeroth", character: "My characters", play: "Into the fray",
    seasonTitle: "Dungeons & raids", meta: "Weekly meta", mythicText: "Routes, timers and tactics for the season’s dungeons.", dungeons: "Choose a dungeon",
    raids: "Raids", raidText: "Bosses and tactics for your role.", explore: "Explore Azeroth", tools: "Everything for your hero",
    featured: {
      map: { title: "World map", text: "Continents, dungeons and raids — find your next destination." },
      classes: { title: "Classes & talents", text: "Choose talents for your specialization." },
    },
    toolsCopy: { tierLists: "Tier lists", library: "Library", transmog: "Transmog Studio", lairs: "Lairs & world bosses", characters: "Characters" },
    news: "What’s new", allNews: "All changes",
  },
} as const;
