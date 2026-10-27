import { pluralRu } from "@gildra/atlas-ui/format";

/** Strings of the WoW hub (/wow); `en` and `ru` keep the same keys. */
const ru = {
  eyebrow: "Midnight",
  title: "Ваш командный центр в Азероте",
  lede: "Персонаж, таланты, маршрут ключа и тактика рейда — всё для следующего похода в одном месте.",
  character: "Мои персонажи",
  statsLabel: "Сезон в цифрах",
  dungeons: (n: number) => `${pluralRu(n, "подземелье", "подземелья", "подземелий")} Mythic+`,
  raids: (n: number) => pluralRu(n, "рейд", "рейда", "рейдов"),
  delves: (n: number) => pluralRu(n, "вылазка", "вылазки", "вылазок"),
  sections: "Разделы",
  open: "Открыть",
  cards: {
    mythic: { title: "Mythic+", text: "Таймеры ключей, маршруты подземелий сезона и мета недели." },
    raids: { title: "Рейды", text: "Боссы, их способности и задачи каждой роли в бою." },
    lairs: { title: "Логова и мировые боссы", text: "Где найти боссов открытого мира, что делать в бою и что с них падает." },
    tierLists: { title: "Тир-листы", text: "Сила специализаций в ключах и рейдах по свежим данным." },
    library: { title: "Библиотека", text: "Предметы, заклинания, транспорт и другие данные игры с подсказками и 3D-моделями." },
    transmog: { title: "Трансмогрификация", text: "Соберите образ из любых обликов на 3D-персонаже и сохраните картинку." },
  },
  talents: "Калькулятор талантов",
  talentsText: "Деревья талантов всех специализаций Midnight: соберите сборку и поделитесь ссылкой.",
  talentsAction: "Выбрать класс",
} as const;

const en = {
  eyebrow: "Midnight",
  title: "Your command center in Azeroth",
  lede: "Your character, talents, key route and raid tactics — everything for the next run in one place.",
  character: "My characters",
  statsLabel: "The season in numbers",
  dungeons: (n: number) => `Mythic+ ${n === 1 ? "dungeon" : "dungeons"}`,
  raids: (n: number) => (n === 1 ? "raid" : "raids"),
  delves: (n: number) => (n === 1 ? "delve" : "delves"),
  sections: "Sections",
  open: "Open",
  cards: {
    mythic: { title: "Mythic+", text: "Key timers, dungeon routes of the season and the weekly meta." },
    raids: { title: "Raids", text: "Bosses, their abilities and what every role does in the fight." },
    lairs: { title: "Lairs and world bosses", text: "Where to find the outdoor bosses, what to do in the fight and what they drop." },
    tierLists: { title: "Tier lists", text: "Specialization strength in keys and raids from fresh data." },
    library: { title: "Library", text: "Items, spells, mounts and other game data with in-game tooltips and 3D models." },
    transmog: { title: "Transmog Studio", text: "Build an outfit from any appearance on a 3D character and save a picture." },
  },
  talents: "Talent calculator",
  talentsText: "Talent trees of every Midnight specialization: build yours and share the link.",
  talentsAction: "Choose a class",
} as const;

export const wowHomeCopy = { ru, en } as const;
