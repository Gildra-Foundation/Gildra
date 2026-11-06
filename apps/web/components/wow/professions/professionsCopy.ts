import type { KnowledgeKind, ProfessionKind, RecipeSource } from "@/lib/wow/professions/types";

const ruForm = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const ruTimes = (n: number) => ruForm(n, "раз", "раза", "раз");
const ruPoints = (n: number) => ruForm(n, "очко", "очка", "очков");

type Copy = {
  hubTitle: string; hubLede: string; hubDescription: string;
  kinds: Record<ProfessionKind, string>;
  eyebrow: string; lede: Record<ProfessionKind, string>; description: (name: string) => string;
  statLeveling: string; statWeekly: string; statOneTime: string; statGathered: string;
  region: string; regions: { eu: string; us: string };
  leveling: string; from: string; recipesFrom: string; sources: Record<RecipeSource, string>;
  skill: string; recipe: string; crafts: string; reagents: string; cost: string;
  stepsLabel: string; shopping: string; shoppingLabel: string; item: string; need: string; have: string; buy: string;
  total: string; training: string; noPrice: string; vendor: string; short: string; reachedOnly: (skill: number) => string;
  noPrices: string; noRoute: string;
  profit: string; profitLabel: string; sale: string; median: string; margin: string; perCraft: string; showAll: (n: number) => string; showLess: string; noProfit: string;
  gathered: string; gatheredLabel: string; min: string; listed: string;
  trainer: string; knowledge: string; weekly: string; oneTime: string; points: string; source: string;
  kindsKnowledge: Record<KnowledgeKind, string>; treasures: string; treasuresLabel: string; zone: string; coords: string;
  copy: string; copied: string; copyFailed: string; copyAll: string; macro: string; done: string; missing: string;
  specializations: string; ranksLabel: (n: number) => string; at: (n: number) => string; unlocksRecipe: string;
  stepTitle: (n: number) => string; craftsCount: (n: number) => string; perStep: string; legend: string; sourceHelp: Record<RecipeSource, string>;
  difficulty: { orange: string; yellow: string; green: string; grey: string }; band: (from: number, to: number) => string;
  reagentsCost: string; toShopping: string; fromAuction: string; fromVendor: string; buyAt: string; way: string;
  learnStart: string; learnTrainer: (name: string, zone: string) => string; learnStation: (name: string, zone: string) => string; learnDiscovery: string;
  learnSkill: (n: number) => string; learnSpec: (node: string, tree: string) => string; learnSpecAt: (n: number) => string;
  learnVendor: (name: string, zone: string) => string; learnOr: string; learnRenown: (faction: string, rank: number) => string;
  learnDrop: string; learnDropFrom: (name: string) => string; learnDropIn: (zone: string) => string; learnWorldDrop: string; learnQuest: string;
  hubCost: string; hubBest: string; hubTop: string;
  otherProfessions: string; rank: string; coins: { gold: string; silver: string; copper: string }; goldShort: string; numberLocale: string;
};

export const professionsCopy: Record<"en" | "ru", Copy> = {
  en: {
    hubTitle: "Professions", hubLede: "Leveling at live auction prices, profitable crafts, trainers, knowledge and specializations for all thirteen Midnight professions.",
    hubDescription: "Midnight professions: cheapest leveling 1–100 at current auction prices, profitable crafts, trainers, knowledge treasures and specializations.",
    kinds: { crafting: "Crafting", gathering: "Gathering", secondary: "Secondary" },
    eyebrow: "Midnight",
    lede: {
      crafting: "The cheapest path to 100 at current auction prices, crafts that sell for more than they cost, knowledge and specializations.",
      gathering: "What your gathering is worth right now, where to train, where to find knowledge and the specialization trees.",
      secondary: "Leveling at current auction prices and where to train.",
    },
    description: (name) => `Midnight ${name}: leveling 1–100 at live auction prices, shopping list, profitable crafts, trainer, knowledge points and treasures, specializations.`,
    statLeveling: "1–100 at current prices", statWeekly: "Knowledge a week", statOneTime: "One-time knowledge", statGathered: "Goods on the market",
    region: "Region", regions: { eu: "Europe", us: "Americas" },
    leveling: "Leveling", from: "Current skill", recipesFrom: "Recipes you can use",
    sources: { start: "Known", trainer: "Trainer", research: "Discovery", specialization: "Specialization", vendor: "Vendor", quest: "Quest", drop: "Drop" },
    skill: "Skill", recipe: "Recipe", crafts: "Crafts", reagents: "Reagents", cost: "Cost",
    stepsLabel: "Leveling steps", shopping: "Shopping list", shoppingLabel: "Shopping list", item: "Reagent", need: "Need", have: "Have", buy: "Buy",
    total: "Total", training: "Trainer recipes", noPrice: "No price", vendor: "Vendor", short: "Market has only", reachedOnly: (skill) => `These recipes stop giving skill at ${skill}. Add more recipe sources to go further.`,
    noPrices: "Auction prices are unavailable right now: the route is built by the fewest reagents.", noRoute: "No recipe of the chosen sources gives skill from this level.",
    profit: "Profitable crafts", profitLabel: "Crafts by profit", sale: "Sells for", median: "Median", margin: "Profit", perCraft: "per craft, after the 5% auction cut",
    showAll: (n) => `Show all ${n}`, showLess: "Show fewer", noProfit: "No craft sells for more than its reagents right now.",
    gathered: "What you gather", gatheredLabel: "Gathered goods at current prices", min: "Min price", listed: "Listed",
    trainer: "Trainer", knowledge: "Knowledge", weekly: "Every week", oneTime: "Once per character", points: "Points", source: "How to get",
    kindsKnowledge: { quest: "Weekly profession quest", treatise: "Treatise (Inscription)", cache: "Treasures and caches", gathering: "While gathering", disenchanting: "Disenchanting", book: "Renown book" },
    treasures: "Treasures", treasuresLabel: "Knowledge treasures", zone: "Zone", coords: "Waypoint",
    copy: "Copy", copied: "Copied", copyFailed: "Copy failed", copyAll: "Copy all waypoints", macro: "Which treasures are still missing", done: "done", missing: "missing",
    specializations: "Specializations", ranksLabel: (n) => `${n} points`, at: (n) => `${n}`, unlocksRecipe: "Recipe",
    stepTitle: (n) => `Step ${n}`, craftsCount: (n) => `${n.toLocaleString("en-US")} ${n === 1 ? "craft" : "crafts"}`, perStep: "Step cost", legend: "How recipes are learned",
    sourceHelp: {
      start: "Known from the start.", trainer: "Bought from the profession trainer.",
      research: "A discovery: the recipe opens by itself while you craft — no trainer sells it.",
      specialization: "Opens with knowledge points in a specialization.", vendor: "Sold by a vendor for currency or renown.",
      quest: "A quest reward.", drop: "Drops from creatures and chests.",
    },
    difficulty: { orange: "every craft", yellow: "often", green: "rarely", grey: "never" },
    band: (from, to) => `Skill ${from} to ${to}`,
    reagentsCost: "Reagents", toShopping: "Shopping list", fromAuction: "Auction house", fromVendor: "Vendors", buyAt: "Buy", way: "/way",
    learnStart: "Known from the start", learnTrainer: (name, zone) => `${name}, ${zone}`, learnStation: (name, zone) => `${name}, ${zone}`,
    learnDiscovery: "Opens by itself while you craft", learnSkill: (n) => `from skill ${n}`,
    learnSpec: (node, tree) => `${node} (${tree})`, learnSpecAt: (n) => n <= 1 ? "first point" : `${n} points`,
    learnVendor: (name, zone) => zone ? `${name}, ${zone}` : name, learnOr: "or", learnRenown: (faction, rank) => `${faction} renown ${rank}`,
    learnDrop: "Drop", learnDropFrom: (name) => name, learnDropIn: (zone) => zone, learnWorldDrop: "Random drop", learnQuest: "Quest reward",
    hubCost: "1–100 now", hubBest: "Best profit", hubTop: "Most valuable",
    otherProfessions: "Other professions", rank: "Rank", coins: { gold: "gold", silver: "silver", copper: "copper" }, goldShort: "g", numberLocale: "en-US",
  },
  ru: {
    hubTitle: "Профессии", hubLede: "Прокачка по живым ценам аукциона, выгодные рецепты, наставники, знания и специализации всех тринадцати профессий Midnight.",
    hubDescription: "Профессии Midnight: самая дешёвая прокачка 1–100 по текущим ценам аукциона, выгодные рецепты, наставники, сокровища знаний и специализации.",
    kinds: { crafting: "Ремесло", gathering: "Сбор", secondary: "Вторичные" },
    eyebrow: "Midnight",
    lede: {
      crafting: "Самый дешёвый путь до 100 по текущим ценам аукциона, рецепты, которые продаются дороже реагентов, знания и специализации.",
      gathering: "Сколько стоит собранное прямо сейчас, где учиться, где найти знания и деревья специализаций.",
      secondary: "Прокачка по текущим ценам аукциона и где учиться.",
    },
    description: (name) => `${name} в Midnight: прокачка 1–100 по живым ценам аукциона, список покупок, выгодные рецепты, наставник, очки знаний и сокровища, специализации.`,
    statLeveling: "1–100 по текущим ценам", statWeekly: "Знаний в неделю", statOneTime: "Знаний разово", statGathered: "Товаров на рынке",
    region: "Регион", regions: { eu: "Европа", us: "Америка" },
    leveling: "Прокачка", from: "Текущий навык", recipesFrom: "Какие рецепты использовать",
    sources: { start: "Известные", trainer: "Наставник", research: "Открытие", specialization: "Специализация", vendor: "Торговец", quest: "Задание", drop: "Добыча" },
    skill: "Навык", recipe: "Рецепт", crafts: "Раз", reagents: "Реагенты", cost: "Цена",
    stepsLabel: "Шаги прокачки", shopping: "Список покупок", shoppingLabel: "Список покупок", item: "Реагент", need: "Нужно", have: "Есть", buy: "Купить",
    total: "Итого", training: "Рецепты у наставника", noPrice: "Нет цены", vendor: "Торговец", short: "На рынке только", reachedOnly: (skill) => `Эти рецепты перестают давать навык на ${skill}. Добавьте другие источники рецептов, чтобы идти дальше.`,
    noPrices: "Цены аукциона сейчас недоступны: путь построен по наименьшему числу реагентов.", noRoute: "С этого уровня ни один рецепт из выбранных не даёт навык.",
    profit: "Выгодные рецепты", profitLabel: "Рецепты по прибыли", sale: "Продаётся за", median: "Медиана", margin: "Прибыль", perCraft: "за одно изготовление, после 5% комиссии аукциона",
    showAll: (n) => `Показать все ${n}`, showLess: "Свернуть", noProfit: "Сейчас ни один рецепт не продаётся дороже реагентов.",
    gathered: "Что вы собираете", gatheredLabel: "Собранные товары по текущим ценам", min: "Мин. цена", listed: "На рынке",
    trainer: "Наставник", knowledge: "Знания", weekly: "Каждую неделю", oneTime: "Один раз на персонажа", points: "Очки", source: "Как получить",
    kindsKnowledge: { quest: "Еженедельное задание профессии", treatise: "Трактат (Начертание)", cache: "Сокровища и тайники", gathering: "При сборе", disenchanting: "Распыление", book: "Книга за известность" },
    treasures: "Сокровища", treasuresLabel: "Сокровища знаний", zone: "Зона", coords: "Метка",
    copy: "Копировать", copied: "Скопировано", copyFailed: "Не удалось скопировать", copyAll: "Копировать все метки", macro: "Какие сокровища ещё не собраны", done: "есть", missing: "нет",
    specializations: "Специализации", ranksLabel: (n) => `${n} очков`, at: (n) => `${n}`, unlocksRecipe: "Рецепт",
    stepTitle: (n) => `Шаг ${n}`, craftsCount: (n) => `${n.toLocaleString("ru-RU")} ${ruTimes(n)}`, perStep: "Цена шага", legend: "Как получить рецепты",
    sourceHelp: {
      start: "Известен с самого начала.", trainer: "Покупается у наставника профессии.",
      research: "Открытие: рецепт открывается сам во время работы с профессией — у наставника его нет.",
      specialization: "Открывается очками знаний в специализации.", vendor: "Продаётся у торговца за валюту или известность.",
      quest: "Награда за задание.", drop: "Выпадает с существ и из сундуков.",
    },
    difficulty: { orange: "каждый раз", yellow: "часто", green: "редко", grey: "никогда" },
    band: (from, to) => `Навык с ${from} до ${to}`,
    reagentsCost: "Реагенты", toShopping: "Список покупок", fromAuction: "Аукцион", fromVendor: "У торговцев", buyAt: "Купить", way: "/way",
    learnStart: "Известен с самого начала", learnTrainer: (name, zone) => `${name}, ${zone}`, learnStation: (name, zone) => `${name}, ${zone}`,
    learnDiscovery: "Открывается само во время работы с профессией", learnSkill: (n) => `с навыка ${n}`,
    learnSpec: (node, tree) => `«${node}» (${tree})`, learnSpecAt: (n) => n <= 1 ? "первое очко" : `${n} ${ruPoints(n)}`,
    learnVendor: (name, zone) => zone ? `${name}, ${zone}` : name, learnOr: "или", learnRenown: (faction, rank) => `известность «${faction}» ${rank}`,
    learnDrop: "Добыча", learnDropFrom: (name) => name, learnDropIn: (zone) => zone, learnWorldDrop: "Случайная добыча", learnQuest: "Награда за задание",
    hubCost: "1–100 сейчас", hubBest: "Выгоднее всего", hubTop: "Дороже всего",
    otherProfessions: "Другие профессии", rank: "Ранг", coins: { gold: "золота", silver: "серебра", copper: "меди" }, goldShort: "з", numberLocale: "ru-RU",
  },
};
