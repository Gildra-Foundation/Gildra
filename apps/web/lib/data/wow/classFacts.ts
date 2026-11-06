/**
 * Short game facts for the class and specialization pages: armor, the
 * resource a specialization spends, what it is good at, and one line about
 * each hero talent tree. Written for Gildra; game names stay as in game.
 */
type Words = { en: string; ru: string };

export const classArmor: Record<string, "plate" | "mail" | "leather" | "cloth"> = {
  warrior: "plate", paladin: "plate", deathknight: "plate",
  hunter: "mail", shaman: "mail", evoker: "mail",
  rogue: "leather", druid: "leather", monk: "leather", demonhunter: "leather",
  mage: "cloth", priest: "cloth", warlock: "cloth",
};

export const armorWords: Record<(typeof classArmor)[string], Words> = {
  plate: { en: "Plate", ru: "Латы" },
  mail: { en: "Mail", ru: "Кольчуга" },
  leather: { en: "Leather", ru: "Кожа" },
  cloth: { en: "Cloth", ru: "Ткань" },
};

const resources = {
  mana: { en: "Mana", ru: "Мана" }, rage: { en: "Rage", ru: "Ярость" }, energy: { en: "Energy", ru: "Энергия" },
  focus: { en: "Focus", ru: "Концентрация" }, runic: { en: "Runic Power", ru: "Сила рун" }, holy: { en: "Holy Power", ru: "Энергия Света" },
  astral: { en: "Astral Power", ru: "Астральная мощь" }, insanity: { en: "Insanity", ru: "Безумие" }, maelstrom: { en: "Maelstrom", ru: "Водоворот" },
  shards: { en: "Soul Shards", ru: "Осколки душ" }, fury: { en: "Fury", ru: "Гнев" }, essence: { en: "Essence", ru: "Сущность" },
} satisfies Record<string, Words>;

/** The resource each specialization spends, by spec slug. */
export const specResource: Record<string, Words> = {
  "balance-druid": resources.astral, "feral-druid": resources.energy, "guardian-druid": resources.rage, "restoration-druid": resources.mana,
  "devastation-evoker": resources.essence, "preservation-evoker": resources.essence, "augmentation-evoker": resources.essence,
  "discipline-priest": resources.mana, "holy-priest": resources.mana, "shadow-priest": resources.insanity,
  "blood-death-knight": resources.runic, "frost-death-knight": resources.runic, "unholy-death-knight": resources.runic,
  "beast-mastery-hunter": resources.focus, "marksmanship-hunter": resources.focus, "survival-hunter": resources.focus,
  "assassination-rogue": resources.energy, "outlaw-rogue": resources.energy, "subtlety-rogue": resources.energy,
  "elemental-shaman": resources.maelstrom, "enhancement-shaman": resources.maelstrom, "restoration-shaman": resources.mana,
  "holy-paladin": resources.holy, "protection-paladin": resources.holy, "retribution-paladin": resources.holy,
  "arcane-mage": resources.mana, "fire-mage": resources.mana, "frost-mage": resources.mana,
  "arms-warrior": resources.rage, "fury-warrior": resources.rage, "protection-warrior": resources.rage,
  "affliction-warlock": resources.shards, "demonology-warlock": resources.shards, "destruction-warlock": resources.shards,
  "brewmaster-monk": resources.energy, "windwalker-monk": resources.energy, "mistweaver-monk": resources.mana,
  "havoc-demon-hunter": resources.fury, "vengeance-demon-hunter": resources.fury, "devourer-demon-hunter": resources.fury,
};

export const strengthWords = {
  single: { en: "Single-target damage", ru: "Урон по одной цели" },
  aoe: { en: "Area damage", ru: "Урон по площади" },
  burst: { en: "Burst windows", ru: "Взрывной урон" },
  dots: { en: "Damage over time", ru: "Периодический урон" },
  sustained: { en: "Steady damage", ru: "Ровный урон" },
  moving: { en: "Damage on the move", ru: "Урон в движении" },
  mobility: { en: "Mobility", ru: "Мобильность" },
  pet: { en: "Pets", ru: "Питомцы" },
  survival: { en: "Strong defensives", ru: "Живучесть" },
  selfheal: { en: "Self-healing", ru: "Самоисцеление" },
  magic: { en: "Magic defense", ru: "Защита от магии" },
  control: { en: "Crowd control", ru: "Контроль" },
  groupHeal: { en: "Group healing", ru: "Исцеление группы" },
  focusHeal: { en: "Single-target healing", ru: "Исцеление одной цели" },
  absorbs: { en: "Shields and absorbs", ru: "Щиты и поглощение" },
  buffs: { en: "Empowers allies", ru: "Усиление союзников" },
  stealth: { en: "Stealth", ru: "Незаметность" },
  immunity: { en: "Immunities", ru: "Неуязвимость" },
  lust: { en: "Bloodlust", ru: "Героизм" },
  brez: { en: "Battle resurrection", ru: "Боевое воскрешение" },
} satisfies Record<string, Words>;
export type Strength = keyof typeof strengthWords;

/** Three things each specialization is known for (by spec slug). */
export const specStrengths: Record<string, [Strength, Strength, Strength]> = {
  "arms-warrior": ["single", "burst", "survival"], "fury-warrior": ["single", "aoe", "selfheal"], "protection-warrior": ["survival", "aoe", "magic"],
  "holy-paladin": ["focusHeal", "immunity", "brez"], "protection-paladin": ["survival", "immunity", "brez"], "retribution-paladin": ["burst", "immunity", "brez"],
  "beast-mastery-hunter": ["moving", "pet", "lust"], "marksmanship-hunter": ["single", "moving", "lust"], "survival-hunter": ["aoe", "pet", "lust"],
  "assassination-rogue": ["dots", "single", "stealth"], "outlaw-rogue": ["aoe", "sustained", "stealth"], "subtlety-rogue": ["burst", "single", "stealth"],
  "discipline-priest": ["absorbs", "groupHeal", "buffs"], "holy-priest": ["groupHeal", "focusHeal", "buffs"], "shadow-priest": ["dots", "aoe", "buffs"],
  "blood-death-knight": ["selfheal", "survival", "brez"], "frost-death-knight": ["burst", "magic", "brez"], "unholy-death-knight": ["dots", "pet", "brez"],
  "elemental-shaman": ["aoe", "burst", "lust"], "enhancement-shaman": ["burst", "aoe", "lust"], "restoration-shaman": ["groupHeal", "control", "lust"],
  "arcane-mage": ["burst", "single", "lust"], "fire-mage": ["burst", "aoe", "lust"], "frost-mage": ["single", "control", "lust"],
  "affliction-warlock": ["dots", "sustained", "brez"], "demonology-warlock": ["pet", "sustained", "brez"], "destruction-warlock": ["burst", "single", "brez"],
  "brewmaster-monk": ["survival", "mobility", "control"], "windwalker-monk": ["mobility", "aoe", "burst"], "mistweaver-monk": ["groupHeal", "mobility", "control"],
  "balance-druid": ["aoe", "dots", "brez"], "feral-druid": ["dots", "stealth", "brez"], "guardian-druid": ["survival", "selfheal", "brez"], "restoration-druid": ["groupHeal", "mobility", "brez"],
  "havoc-demon-hunter": ["mobility", "aoe", "burst"], "vengeance-demon-hunter": ["selfheal", "mobility", "control"], "devourer-demon-hunter": ["burst", "aoe", "mobility"],
  "devastation-evoker": ["aoe", "burst", "lust"], "preservation-evoker": ["groupHeal", "buffs", "lust"], "augmentation-evoker": ["buffs", "moving", "lust"],
};

/** One line per hero talent tree, by hero tree id. */
export const heroTreeLines: Record<number, Words> = {
  18: { en: "Void rifts that tear at enemies around the target", ru: "Разломы Бездны рвут врагов вокруг цели" },
  19: { en: "Halos of Light and Shadow empower your spells", ru: "Кольца Света и Тьмы усиливают заклинания" },
  20: { en: "Foresight and healing before the damage lands", ru: "Предвидение и исцеление до удара" },
  21: { en: "Heavy strikes in bear and cat form", ru: "Тяжелые удары в облике медведя и кошки" },
  22: { en: "Thorns and blooms that work over time", ru: "Шипы и цветение, действующие со временем" },
  23: { en: "Treants and the Dream empower nature spells", ru: "Древни и сила Сна усиливают заклинания природы" },
  24: { en: "Moonlight and Arcane damage", ru: "Лунный свет и урон тайной магией" },
  31: { en: "Vampiric strikes and blood essence", ru: "Вампирские удары и кровавая сущность" },
  32: { en: "Calls the horsemen of the Apocalypse to fight", ru: "Всадники Апокалипсиса сражаются рядом" },
  33: { en: "Marks and detonations on a single target", ru: "Метки и взрывы по одной цели" },
  34: { en: "Demonic transformations and fel fire", ru: "Демонические превращения и огонь Скверны" },
  35: { en: "An empowered glaive and stronger strikes", ru: "Усиленная глефа и мощные удары" },
  36: { en: "A dragon squad and wide disintegration", ru: "Отряд драконов и широкая дезинтеграция" },
  37: { en: "Engulfing flame that spreads over time", ru: "Поглощающее пламя, растущее со временем" },
  38: { en: "Bends time to strengthen spells", ru: "Управление временем усиливает заклинания" },
  39: { en: "Phoenix flame and sun magic", ru: "Пламя феникса и солнечная магия" },
  40: { en: "Splinters that keep hitting the target", ru: "Осколки, которые продолжают бить цель" },
  41: { en: "Frost and fire in the same bolt", ru: "Лед и огонь в одной стреле" },
  42: { en: "Sentinel marks and lunar storms", ru: "Метки часового и лунные бури" },
  43: { en: "Calls beasts of the pack into the fight", ru: "Звери стаи вступают в бой" },
  44: { en: "Black arrows and shadow damage", ru: "Черные стрелы и урон темной магией" },
  48: { en: "Hammers of Light from the sky", ru: "Молоты Света с неба" },
  49: { en: "Holy armaments for allies", ru: "Священное оружие для союзников" },
  50: { en: "Dawnlight and sun-powered spells", ru: "Свет зари и солнечная магия" },
  51: { en: "Unseen blades and quick flourishes", ru: "Невидимые клинки и быстрые удары" },
  52: { en: "Coin flips that empower finishers", ru: "Монета судьбы усиливает завершающие приемы" },
  53: { en: "A deadly mark on the main target", ru: "Смертельная метка на основной цели" },
  54: { en: "Surging totems and the power of earth", ru: "Тотемы и сила земли" },
  55: { en: "Storm and lightning strikes", ru: "Удары бури и молнии" },
  56: { en: "Ancestors echo your spells", ru: "Предки повторяют ваши заклинания" },
  57: { en: "A demonic soul and soul fragments", ru: "Демоническая душа и фрагменты душ" },
  58: { en: "Withering curses from hell", ru: "Иссушающие проклятия ада" },
  59: { en: "Demonic rituals and summons", ru: "Демонические ритуалы и призывы" },
  60: { en: "Slayer strikes and execute pressure", ru: "Удары истребителя и добивание" },
  61: { en: "Thunder and lightning-charged blows", ru: "Гром и удары, заряженные молнией" },
  62: { en: "Demolishing blows and stacking might", ru: "Сокрушительные удары и копящаяся мощь" },
  64: { en: "Celestials join the fight and the healing", ru: "Небожители сражаются и исцеляют" },
  65: { en: "A flurry of fast strikes", ru: "Шквал быстрых ударов" },
  66: { en: "Chi in balance, healing from damage", ru: "Гармония ци и исцеление от урона" },
  124: { en: "Heavy void-charged blows", ru: "Тяжелые удары энергией Бездны" },
  126: { en: "Void transformations", ru: "Превращения силой Бездны" },
};
