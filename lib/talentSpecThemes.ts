export type TalentSpecMotif =
  | "astral" | "beast" | "nature" | "dream" | "dragonfire" | "time" | "earth"
  | "atonement" | "holy" | "void" | "blood" | "frost" | "plague" | "wild"
  | "marksman" | "spear" | "poison" | "pirate" | "shadow" | "storm" | "spirit"
  | "tide" | "sun" | "bulwark" | "judgment" | "arcane" | "fire" | "steel"
  | "fury" | "shield" | "decay" | "demon" | "chaos" | "brew" | "wind"
  | "mist" | "fel" | "vengeance" | "abyss";

export type TalentHeroPath = { id: number; name: string; nameRu: string };

export type TalentSpecTheme = {
  slug: string;
  specId: number;
  classId: number;
  classKey: string;
  className: string;
  classNameRu: string;
  specName: string;
  specNameRu: string;
  role: "tank" | "healer" | "melee" | "ranged" | "support";
  roleRu: string;
  motif: TalentSpecMotif;
  iconUrl: string;
  classIconUrl: string;
  accent: string;
  hot: string;
  deep: string;
  accentRgb: string;
  hotRgb: string;
  ambientRgb: string;
  resourceLabel: string;
  fantasy: string;
  heroPaths: [TalentHeroPath, TalentHeroPath];
};

export type TalentSpecClass = {
  classKey: string;
  classNameRu: string;
  specs: TalentSpecTheme[];
};

type ThemeSeed = Omit<TalentSpecTheme, "iconUrl" | "classIconUrl" | "roleRu"> & {
  icon?: string;
};

const classIcons: Record<string, string> = {
  druid: "druid", evoker: "evoker", priest: "priest", deathknight: "deathknight",
  hunter: "hunter", rogue: "rogue", shaman: "shaman", paladin: "paladin",
  mage: "mage", warrior: "warrior", warlock: "warlock", monk: "monk",
  demonhunter: "demonhunter",
};

const roleLabels: Record<TalentSpecTheme["role"], string> = {
  tank: "Танк", healer: "Лекарь", melee: "Ближний бой", ranged: "Дальний бой", support: "Поддержка",
};

const h = (id: number, name: string, nameRu: string): TalentHeroPath => ({ id, name, nameRu });

function makeTheme(seed: ThemeSeed): TalentSpecTheme {
  const classIconUrl = `/assets/classes/${classIcons[seed.classKey]}.jpg`;
  return {
    ...seed,
    roleRu: roleLabels[seed.role],
    classIconUrl,
    iconUrl: seed.icon ? `/assets/specs/${seed.icon}.jpg` : classIconUrl,
  };
}

const specs: ThemeSeed[] = [
  { slug:"balance-druid",specId:102,classId:11,classKey:"druid",className:"Druid",classNameRu:"Друид",specName:"Balance",specNameRu:"Баланс",role:"ranged",motif:"astral",icon:"balance-druid",accent:"#64b8ff",hot:"#fff0a6",deep:"#102b54",accentRgb:"100,184,255",hotRgb:"255,240,166",ambientRgb:"38,91,154",resourceLabel:"Астральная мощь",fantasy:"Лунный свет и солнечные вспышки",heroPaths:[h(24,"Elune's Chosen","Избранник Элуны"),h(23,"Keeper of the Grove","Хранитель рощи")] },
  { slug:"feral-druid",specId:103,classId:11,classKey:"druid",className:"Druid",classNameRu:"Друид",specName:"Feral",specNameRu:"Сила зверя",role:"melee",motif:"beast",accent:"#ff8a35",hot:"#ffd27a",deep:"#4b1608",accentRgb:"255,138,53",hotRgb:"255,210,122",ambientRgb:"127,48,17",resourceLabel:"Энергия",fantasy:"Когти, рваные раны и хищный ритм",heroPaths:[h(21,"Druid of the Claw","Друид когтя"),h(22,"Wildstalker","Дикий охотник")] },
  { slug:"guardian-druid",specId:104,classId:11,classKey:"druid",className:"Druid",classNameRu:"Друид",specName:"Guardian",specNameRu:"Страж",role:"tank",motif:"nature",accent:"#c69a4b",hot:"#f5dc94",deep:"#35230d",accentRgb:"198,154,75",hotRgb:"245,220,148",ambientRgb:"75,58,22",resourceLabel:"Ярость",fantasy:"Древняя кора и неудержимая мощь медведя",heroPaths:[h(21,"Druid of the Claw","Друид когтя"),h(24,"Elune's Chosen","Избранник Элуны")] },
  { slug:"restoration-druid",specId:105,classId:11,classKey:"druid",className:"Druid",classNameRu:"Друид",specName:"Restoration",specNameRu:"Исцеление",role:"healer",motif:"dream",accent:"#56d891",hot:"#d2ffb5",deep:"#0b3d2b",accentRgb:"86,216,145",hotRgb:"210,255,181",ambientRgb:"25,100,66",resourceLabel:"Мана",fantasy:"Цветение Изумрудного Сна",heroPaths:[h(23,"Keeper of the Grove","Хранитель рощи"),h(22,"Wildstalker","Дикий охотник")] },

  { slug:"devastation-evoker",specId:1467,classId:13,classKey:"evoker",className:"Evoker",classNameRu:"Пробудитель",specName:"Devastation",specNameRu:"Опустошение",role:"ranged",motif:"dragonfire",icon:"dev-evoker",accent:"#ff6b42",hot:"#ffd06f",deep:"#4a100a",accentRgb:"255,107,66",hotRgb:"255,208,111",ambientRgb:"137,42,24",resourceLabel:"Сущность",fantasy:"Драконье пламя всех стай",heroPaths:[h(37,"Flameshaper","Создатель пламени"),h(36,"Scalecommander","Командир чешуи")] },
  { slug:"preservation-evoker",specId:1468,classId:13,classKey:"evoker",className:"Evoker",classNameRu:"Пробудитель",specName:"Preservation",specNameRu:"Хранитель",role:"healer",motif:"time",accent:"#58d8bf",hot:"#d3fff0",deep:"#0a3a38",accentRgb:"88,216,191",hotRgb:"211,255,240",ambientRgb:"21,100,91",resourceLabel:"Сущность",fantasy:"Изумрудная жизнь и бронзовое время",heroPaths:[h(38,"Chronowarden","Хранитель времени"),h(37,"Flameshaper","Создатель пламени")] },
  { slug:"augmentation-evoker",specId:1473,classId:13,classKey:"evoker",className:"Evoker",classNameRu:"Пробудитель",specName:"Augmentation",specNameRu:"Насыщатель",role:"support",motif:"earth",icon:"aug-evoker",accent:"#d197ff",hot:"#ffe1a3",deep:"#33204d",accentRgb:"209,151,255",hotRgb:"255,225,163",ambientRgb:"82,51,111",resourceLabel:"Сущность",fantasy:"Черная земля и бронзовая магия усиления",heroPaths:[h(38,"Chronowarden","Хранитель времени"),h(36,"Scalecommander","Командир чешуи")] },

  { slug:"discipline-priest",specId:256,classId:5,classKey:"priest",className:"Priest",classNameRu:"Жрец",specName:"Discipline",specNameRu:"Послушание",role:"healer",motif:"atonement",accent:"#fff0b8",hot:"#be9cff",deep:"#392b55",accentRgb:"255,240,184",hotRgb:"190,156,255",ambientRgb:"83,59,118",resourceLabel:"Мана",fantasy:"Равновесие Света и Тьмы",heroPaths:[h(20,"Oracle","Оракул"),h(18,"Voidweaver","Ткач Бездны")] },
  { slug:"holy-priest",specId:257,classId:5,classKey:"priest",className:"Priest",classNameRu:"Жрец",specName:"Holy",specNameRu:"Свет",role:"healer",motif:"holy",accent:"#ffe28a",hot:"#fffbe3",deep:"#49380d",accentRgb:"255,226,138",hotRgb:"255,251,227",ambientRgb:"128,101,30",resourceLabel:"Мана",fantasy:"Священное сияние и ангельские крылья",heroPaths:[h(20,"Oracle","Оракул"),h(19,"Archon","Архонт")] },
  { slug:"shadow-priest",specId:258,classId:5,classKey:"priest",className:"Priest",classNameRu:"Жрец",specName:"Shadow",specNameRu:"Тьма",role:"ranged",motif:"void",icon:"shadow-priest",accent:"#a86cff",hot:"#e3c4ff",deep:"#210b43",accentRgb:"168,108,255",hotRgb:"227,196,255",ambientRgb:"78,35,135",resourceLabel:"Безумие",fantasy:"Шепот Бездны и ломающееся сознание",heroPaths:[h(19,"Archon","Архонт"),h(18,"Voidweaver","Ткач Бездны")] },

  { slug:"blood-death-knight",specId:250,classId:6,classKey:"deathknight",className:"Death Knight",classNameRu:"Рыцарь смерти",specName:"Blood",specNameRu:"Кровь",role:"tank",motif:"blood",accent:"#d62836",hot:"#ff7b72",deep:"#3d050b",accentRgb:"214,40,54",hotRgb:"255,123,114",ambientRgb:"113,8,19",resourceLabel:"Сила рун",fantasy:"Кровавые руны, кости и вампирская стойкость",heroPaths:[h(33,"Deathbringer","Вестник смерти"),h(31,"San'layn","Сан'лейн")] },
  { slug:"frost-death-knight",specId:251,classId:6,classKey:"deathknight",className:"Death Knight",classNameRu:"Рыцарь смерти",specName:"Frost",specNameRu:"Лёд",role:"melee",motif:"frost",icon:"frost-dk",accent:"#63cfff",hot:"#e8fbff",deep:"#082b49",accentRgb:"99,207,255",hotRgb:"232,251,255",ambientRgb:"20,84,130",resourceLabel:"Сила рун",fantasy:"Ледяные руны, иней и хруст стали",heroPaths:[h(33,"Deathbringer","Вестник смерти"),h(32,"Rider of the Apocalypse","Всадник Апокалипсиса")] },
  { slug:"unholy-death-knight",specId:252,classId:6,classKey:"deathknight",className:"Death Knight",classNameRu:"Рыцарь смерти",specName:"Unholy",specNameRu:"Нечестивость",role:"melee",motif:"plague",icon:"unholy-dk",accent:"#8ad34f",hot:"#d5ff86",deep:"#17380b",accentRgb:"138,211,79",hotRgb:"213,255,134",ambientRgb:"54,104,26",resourceLabel:"Сила рун",fantasy:"Чума, некромантия и армия мертвых",heroPaths:[h(32,"Rider of the Apocalypse","Всадник Апокалипсиса"),h(31,"San'layn","Сан'лейн")] },

  { slug:"beast-mastery-hunter",specId:253,classId:3,classKey:"hunter",className:"Hunter",classNameRu:"Охотник",specName:"Beast Mastery",specNameRu:"Повелитель зверей",role:"ranged",motif:"wild",icon:"bm-hunter",accent:"#79d15d",hot:"#d8ff9a",deep:"#153916",accentRgb:"121,209,93",hotRgb:"216,255,154",ambientRgb:"45,104,43",resourceLabel:"Концентрация",fantasy:"Стая, следы и звериная ярость",heroPaths:[h(44,"Dark Ranger","Темный следопыт"),h(43,"Pack Leader","Вожак стаи")] },
  { slug:"marksmanship-hunter",specId:254,classId:3,classKey:"hunter",className:"Hunter",classNameRu:"Охотник",specName:"Marksmanship",specNameRu:"Стрельба",role:"ranged",motif:"marksman",icon:"mm-hunter",accent:"#b9d77a",hot:"#f4ffd0",deep:"#293913",accentRgb:"185,215,122",hotRgb:"244,255,208",ambientRgb:"70,95,32",resourceLabel:"Концентрация",fantasy:"Безупречный прицел и ветер стрел",heroPaths:[h(44,"Dark Ranger","Темный следопыт"),h(42,"Sentinel","Часовой")] },
  { slug:"survival-hunter",specId:255,classId:3,classKey:"hunter",className:"Hunter",classNameRu:"Охотник",specName:"Survival",specNameRu:"Выживание",role:"melee",motif:"spear",accent:"#d6a84c",hot:"#ffe59b",deep:"#3e2b0d",accentRgb:"214,168,76",hotRgb:"255,229,155",ambientRgb:"105,77,24",resourceLabel:"Концентрация",fantasy:"Копья, ловушки и порох",heroPaths:[h(43,"Pack Leader","Вожак стаи"),h(42,"Sentinel","Часовой")] },

  { slug:"assassination-rogue",specId:259,classId:4,classKey:"rogue",className:"Rogue",classNameRu:"Разбойник",specName:"Assassination",specNameRu:"Ликвидация",role:"melee",motif:"poison",icon:"assa-rogue",accent:"#b8e65b",hot:"#efffa4",deep:"#273d0b",accentRgb:"184,230,91",hotRgb:"239,255,164",ambientRgb:"79,112,24",resourceLabel:"Энергия",fantasy:"Яды, кровотечения и точный финальный удар",heroPaths:[h(53,"Deathstalker","Ловчий смерти"),h(52,"Fatebound","Связанный судьбой")] },
  { slug:"outlaw-rogue",specId:260,classId:4,classKey:"rogue",className:"Rogue",classNameRu:"Разбойник",specName:"Outlaw",specNameRu:"Головорез",role:"melee",motif:"pirate",icon:"outlaw-rogue",accent:"#d9b24c",hot:"#fff0a1",deep:"#46300a",accentRgb:"217,178,76",hotRgb:"255,240,161",ambientRgb:"111,79,20",resourceLabel:"Энергия",fantasy:"Порох, сабли и удача на костях",heroPaths:[h(52,"Fatebound","Связанный судьбой"),h(51,"Trickster","Трикстер")] },
  { slug:"subtlety-rogue",specId:261,classId:4,classKey:"rogue",className:"Rogue",classNameRu:"Разбойник",specName:"Subtlety",specNameRu:"Скрытность",role:"melee",motif:"shadow",icon:"sub-rogue",accent:"#8d7cff",hot:"#d9d1ff",deep:"#201847",accentRgb:"141,124,255",hotRgb:"217,209,255",ambientRgb:"58,48,120",resourceLabel:"Энергия",fantasy:"Танец теней и клинки из темноты",heroPaths:[h(53,"Deathstalker","Ловчий смерти"),h(51,"Trickster","Трикстер")] },

  { slug:"elemental-shaman",specId:262,classId:7,classKey:"shaman",className:"Shaman",classNameRu:"Шаман",specName:"Elemental",specNameRu:"Стихии",role:"ranged",motif:"storm",icon:"ele-shaman",accent:"#55b9ff",hot:"#d5f5ff",deep:"#0a2e55",accentRgb:"85,185,255",hotRgb:"213,245,255",ambientRgb:"25,83,142",resourceLabel:"Водоворот",fantasy:"Молнии, лава и первобытный шторм",heroPaths:[h(56,"Farseer","Предсказатель"),h(55,"Stormbringer","Вестник бури")] },
  { slug:"enhancement-shaman",specId:263,classId:7,classKey:"shaman",className:"Shaman",classNameRu:"Шаман",specName:"Enhancement",specNameRu:"Совершенствование",role:"melee",motif:"spirit",icon:"enh-shaman",accent:"#4fe0cf",hot:"#ddfff1",deep:"#083d39",accentRgb:"79,224,207",hotRgb:"221,255,241",ambientRgb:"21,107,97",resourceLabel:"Водоворот",fantasy:"Духи волков и оружие стихий",heroPaths:[h(55,"Stormbringer","Вестник бури"),h(54,"Totemic","Тотемист")] },
  { slug:"restoration-shaman",specId:264,classId:7,classKey:"shaman",className:"Shaman",classNameRu:"Шаман",specName:"Restoration",specNameRu:"Исцеление",role:"healer",motif:"tide",icon:"resto-shaman",accent:"#46bfe3",hot:"#c6fff7",deep:"#073548",accentRgb:"70,191,227",hotRgb:"198,255,247",ambientRgb:"18,88,112",resourceLabel:"Мана",fantasy:"Приливы, дождь и древние тотемы",heroPaths:[h(56,"Farseer","Предсказатель"),h(54,"Totemic","Тотемист")] },

  { slug:"holy-paladin",specId:65,classId:2,classKey:"paladin",className:"Paladin",classNameRu:"Паладин",specName:"Holy",specNameRu:"Свет",role:"healer",motif:"sun",accent:"#ffd35c",hot:"#fff7c9",deep:"#4b3305",accentRgb:"255,211,92",hotRgb:"255,247,201",ambientRgb:"132,94,15",resourceLabel:"Энергия Света",fantasy:"Солнечные лучи и священные печати",heroPaths:[h(50,"Herald of the Sun","Вестник Солнца"),h(49,"Lightsmith","Кузнец Света")] },
  { slug:"protection-paladin",specId:66,classId:2,classKey:"paladin",className:"Paladin",classNameRu:"Паладин",specName:"Protection",specNameRu:"Защита",role:"tank",motif:"bulwark",accent:"#e9c557",hot:"#fff4be",deep:"#40300b",accentRgb:"233,197,87",hotRgb:"255,244,190",ambientRgb:"111,86,24",resourceLabel:"Энергия Света",fantasy:"Освященная земля и нерушимый щит",heroPaths:[h(49,"Lightsmith","Кузнец Света"),h(48,"Templar","Храмовник")] },
  { slug:"retribution-paladin",specId:70,classId:2,classKey:"paladin",className:"Paladin",classNameRu:"Паладин",specName:"Retribution",specNameRu:"Воздаяние",role:"melee",motif:"judgment",icon:"ret-paladin",accent:"#ffe06b",hot:"#fffbd3",deep:"#53360a",accentRgb:"255,224,107",hotRgb:"255,251,211",ambientRgb:"143,94,20",resourceLabel:"Энергия Света",fantasy:"Правосудие, пепел и небесный молот",heroPaths:[h(50,"Herald of the Sun","Вестник Солнца"),h(48,"Templar","Храмовник")] },

  { slug:"arcane-mage",specId:62,classId:8,classKey:"mage",className:"Mage",classNameRu:"Маг",specName:"Arcane",specNameRu:"Тайная магия",role:"ranged",motif:"arcane",icon:"arcane-mage",accent:"#b279ff",hot:"#f0d8ff",deep:"#281049",accentRgb:"178,121,255",hotRgb:"240,216,255",ambientRgb:"75,38,129",resourceLabel:"Мана",fantasy:"Чистая мана и геометрия тайной магии",heroPaths:[h(40,"Spellslinger","Заклинатель"),h(39,"Sunfury","Солнечная ярость")] },
  { slug:"fire-mage",specId:63,classId:8,classKey:"mage",className:"Mage",classNameRu:"Маг",specName:"Fire",specNameRu:"Огонь",role:"ranged",motif:"fire",icon:"fire-mage",accent:"#ff5b2e",hot:"#ffd34f",deep:"#4e0d04",accentRgb:"255,91,46",hotRgb:"255,211,79",ambientRgb:"145,31,12",resourceLabel:"Мана",fantasy:"Жар, воспламенение и живое пламя",heroPaths:[h(41,"Frostfire","Ледяной огонь"),h(39,"Sunfury","Солнечная ярость")] },
  { slug:"frost-mage",specId:64,classId:8,classKey:"mage",className:"Mage",classNameRu:"Маг",specName:"Frost",specNameRu:"Лёд",role:"ranged",motif:"frost",icon:"frost-mage",accent:"#62cfff",hot:"#eafcff",deep:"#082d55",accentRgb:"98,207,255",hotRgb:"234,252,255",ambientRgb:"18,85,139",resourceLabel:"Мана",fantasy:"Кристаллы льда и осколки зимы",heroPaths:[h(41,"Frostfire","Ледяной огонь"),h(40,"Spellslinger","Заклинатель")] },

  { slug:"arms-warrior",specId:71,classId:1,classKey:"warrior",className:"Warrior",classNameRu:"Воин",specName:"Arms",specNameRu:"Оружие",role:"melee",motif:"steel",icon:"arms-warrior",accent:"#c7a16d",hot:"#fff0cf",deep:"#392619",accentRgb:"199,161,109",hotRgb:"255,240,207",ambientRgb:"93,62,40",resourceLabel:"Ярость",fantasy:"Тяжелая сталь и выверенный смертельный удар",heroPaths:[h(62,"Colossus","Колосс"),h(60,"Slayer","Истребитель")] },
  { slug:"fury-warrior",specId:72,classId:1,classKey:"warrior",className:"Warrior",classNameRu:"Воин",specName:"Fury",specNameRu:"Неистовство",role:"melee",motif:"fury",icon:"fury-warrior",accent:"#e54827",hot:"#ffad54",deep:"#4a0e08",accentRgb:"229,72,39",hotRgb:"255,173,84",ambientRgb:"133,29,17",resourceLabel:"Ярость",fantasy:"Два клинка, кровь и неуправляемая ярость",heroPaths:[h(61,"Mountain Thane","Горный тан"),h(60,"Slayer","Истребитель")] },
  { slug:"protection-warrior",specId:73,classId:1,classKey:"warrior",className:"Warrior",classNameRu:"Воин",specName:"Protection",specNameRu:"Защита",role:"tank",motif:"shield",accent:"#b89661",hot:"#f3dfb8",deep:"#33271b",accentRgb:"184,150,97",hotRgb:"243,223,184",ambientRgb:"81,65,43",resourceLabel:"Ярость",fantasy:"Щит, громовой удар и железная воля",heroPaths:[h(62,"Colossus","Колосс"),h(61,"Mountain Thane","Горный тан")] },

  { slug:"affliction-warlock",specId:265,classId:9,classKey:"warlock",className:"Warlock",classNameRu:"Чернокнижник",specName:"Affliction",specNameRu:"Колдовство",role:"ranged",motif:"decay",icon:"aff-lock",accent:"#9bdd58",hot:"#ddff9d",deep:"#203c0b",accentRgb:"155,221,88",hotRgb:"221,255,157",ambientRgb:"64,113,25",resourceLabel:"Осколки душ",fantasy:"Порча, агония и пожирание души",heroPaths:[h(58,"Hellcaller","Призыватель Ада"),h(57,"Soul Harvester","Жнец душ")] },
  { slug:"demonology-warlock",specId:266,classId:9,classKey:"warlock",className:"Warlock",classNameRu:"Чернокнижник",specName:"Demonology",specNameRu:"Демонология",role:"ranged",motif:"demon",icon:"demo-lock",accent:"#b46bff",hot:"#e6c1ff",deep:"#2e0b4a",accentRgb:"180,107,255",hotRgb:"230,193,255",ambientRgb:"84,30,129",resourceLabel:"Осколки душ",fantasy:"Демонический портал и легион прислужников",heroPaths:[h(59,"Diabolist","Диаболист"),h(57,"Soul Harvester","Жнец душ")] },
  { slug:"destruction-warlock",specId:267,classId:9,classKey:"warlock",className:"Warlock",classNameRu:"Чернокнижник",specName:"Destruction",specNameRu:"Разрушение",role:"ranged",motif:"chaos",accent:"#f06c35",hot:"#d8ff5e",deep:"#451305",accentRgb:"240,108,53",hotRgb:"216,255,94",ambientRgb:"123,43,15",resourceLabel:"Осколки душ",fantasy:"Хаос, угли и испепеляющий огонь Скверны",heroPaths:[h(59,"Diabolist","Диаболист"),h(58,"Hellcaller","Призыватель Ада")] },

  { slug:"brewmaster-monk",specId:268,classId:10,classKey:"monk",className:"Monk",classNameRu:"Монах",specName:"Brewmaster",specNameRu:"Хмелевар",role:"tank",motif:"brew",accent:"#c8b064",hot:"#f4ebbb",deep:"#393016",accentRgb:"200,176,100",hotRgb:"244,235,187",ambientRgb:"91,79,37",resourceLabel:"Энергия",fantasy:"Дым, бочки и текучая защита",heroPaths:[h(66,"Master of Harmony","Мастер гармонии"),h(65,"Shado-Pan","Шадо-Пан")] },
  { slug:"windwalker-monk",specId:269,classId:10,classKey:"monk",className:"Monk",classNameRu:"Монах",specName:"Windwalker",specNameRu:"Танцующий с ветром",role:"melee",motif:"wind",icon:"ww-monk",accent:"#5ed9a2",hot:"#d6ffe9",deep:"#0b3e2c",accentRgb:"94,217,162",hotRgb:"214,255,233",ambientRgb:"26,103,73",resourceLabel:"Энергия",fantasy:"Нефритовый ветер и безупречная серия ударов",heroPaths:[h(64,"Conduit of the Celestials","Проводник Небожителей"),h(65,"Shado-Pan","Шадо-Пан")] },
  { slug:"mistweaver-monk",specId:270,classId:10,classKey:"monk",className:"Monk",classNameRu:"Монах",specName:"Mistweaver",specNameRu:"Ткач туманов",role:"healer",motif:"mist",accent:"#6de3c0",hot:"#e1fff5",deep:"#0b4038",accentRgb:"109,227,192",hotRgb:"225,255,245",ambientRgb:"31,111,93",resourceLabel:"Мана",fantasy:"Нефритовый туман и танец Небожителей",heroPaths:[h(64,"Conduit of the Celestials","Проводник Небожителей"),h(66,"Master of Harmony","Мастер гармонии")] },

  { slug:"havoc-demon-hunter",specId:577,classId:12,classKey:"demonhunter",className:"Demon Hunter",classNameRu:"Охотник на демонов",specName:"Havoc",specNameRu:"Истребление",role:"melee",motif:"fel",icon:"havoc-dh",accent:"#9cff3f",hot:"#e8ff91",deep:"#223f08",accentRgb:"156,255,63",hotRgb:"232,255,145",ambientRgb:"69,124,22",resourceLabel:"Гнев",fantasy:"Скверна, глефы и рваное движение",heroPaths:[h(35,"Aldrachi Reaver","Альдрахийский разоритель"),h(34,"Fel-Scarred","Оскверненный")] },
  { slug:"vengeance-demon-hunter",specId:581,classId:12,classKey:"demonhunter",className:"Demon Hunter",classNameRu:"Охотник на демонов",specName:"Vengeance",specNameRu:"Месть",role:"tank",motif:"vengeance",accent:"#b38cff",hot:"#dfff76",deep:"#281345",accentRgb:"179,140,255",hotRgb:"223,255,118",ambientRgb:"79,46,119",resourceLabel:"Боль",fantasy:"Огненные печати и демонические шипы",heroPaths:[h(35,"Aldrachi Reaver","Альдрахийский разоритель"),h(124,"Annihilator","Аннигилятор")] },
  { slug:"devourer-demon-hunter",specId:1480,classId:12,classKey:"demonhunter",className:"Demon Hunter",classNameRu:"Охотник на демонов",specName:"Devourer",specNameRu:"Пожиратель",role:"ranged",motif:"abyss",accent:"#8059ff",hot:"#d9c6ff",deep:"#170a42",accentRgb:"128,89,255",hotRgb:"217,198,255",ambientRgb:"54,31,130",resourceLabel:"Гнев",fantasy:"Голод Бездны и разрывы реальности",heroPaths:[h(124,"Annihilator","Аннигилятор"),h(126,"Void-Scarred","Отмеченный Бездной")] },
];

export const talentSpecThemes = specs.map(makeTheme);
export const defaultTalentSpecTheme = talentSpecThemes.find((spec) => spec.slug === "fury-warrior")!;

export function getTalentSpecTheme(slug: string) {
  return talentSpecThemes.find((spec) => spec.slug === slug);
}

export function getTalentSpecThemeById(specId: number) {
  return talentSpecThemes.find((spec) => spec.specId === specId);
}

export const talentSpecClasses: TalentSpecClass[] = Array.from(new Set(talentSpecThemes.map((spec) => spec.classKey))).map((classKey) => ({
  classKey,
  classNameRu: talentSpecThemes.find((spec) => spec.classKey === classKey)!.classNameRu,
  specs: talentSpecThemes.filter((spec) => spec.classKey === classKey),
}));
