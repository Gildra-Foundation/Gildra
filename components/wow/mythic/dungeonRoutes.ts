import { initialStops as rubyLifePoolsStops } from "./rubyLifePoolsData";
import type { RouteAbility, RouteEnemy, RouteStop } from "./rubyLifePoolsData";

export const dungeonSlugs = [
  "ruby-life-pools",
  "altar-of-fangs",
  "murder-row",
  "den-of-nalorakk",
  "the-blinding-vale",
  "voidscar-arena",
  "kings-rest",
  "temple-of-sethraliss",
] as const;

export type DungeonSlug = (typeof dungeonSlugs)[number];

export type DungeonRoute = {
  slug: DungeonSlug;
  name: string;
  nameRu: string;
  location: string;
  timerSeconds: number;
  mapImage: string;
  backdropImage: string;
  floors: { id: number; label: string }[];
  accent: string;
  description: string;
  guideUrl: string;
  mdtRouteUrl: string;
  stops: RouteStop[];
};

export type DungeonSelectorOption = Pick<DungeonRoute, "slug" | "name" | "nameRu" | "location" | "backdropImage">;

type StopSeed = {
  title: string;
  subtitle: string;
  x: number;
  y: number;
  floor?: number;
  kind?: RouteStop["kind"];
  duration: number;
  forces?: number;
  bloodlust?: boolean;
  summary: string;
  enemies?: Array<[string, number, RouteEnemy["priority"]]>;
  abilities?: Array<[string, RouteAbility["action"], string, string?]>;
  callouts: string[];
  tank?: string;
  healer?: string;
  dps?: string;
};

function buildStops(seeds: StopSeed[]): RouteStop[] {
  let cumulative = 0;
  return seeds.map((seed, index) => {
    cumulative = Math.round((cumulative + (seed.forces ?? 0)) * 10) / 10;
    const enemies = (seed.enemies ?? []).map(([name, count, priority]) => ({ name, count, priority }));
    const abilities = (seed.abilities ?? []).map(([name, action, target, source]) => ({ name, action, target, source }));
    return {
      id: index + 1,
      title: seed.title,
      subtitle: seed.subtitle,
      x: seed.x,
      y: seed.y,
      floor: seed.floor ?? 1,
      kind: seed.kind ?? "pull",
      duration: seed.duration,
      forces: seed.forces ?? 0,
      cumulative,
      bloodlust: seed.bloodlust,
      summary: seed.summary,
      enemies,
      abilities,
      callouts: seed.callouts,
      tank: seed.tank ?? "Соберите противников плотно, разверните опасные фронтальные атаки от группы и двигайтесь к следующей позиции только после контроля.",
      healer: seed.healer ?? "Следите за отмеченными целями, заранее готовьте лечение к групповому урону и снимайте опасные эффекты по назначению.",
      dps: seed.dps ?? "Бейте приоритетную цель, не дублируйте прерывания и сохраняйте контроль для отмеченной опасной способности.",
    };
  });
}

const altarOfFangs = buildStops([
  {
    title: "Жертвенный подход", subtitle: "Primal Serpents + Harrowers", x: 50, y: 84, duration: 92, forces: 12,
    summary: "Начальный коридор проверяет ротацию прерываний и снятие яда. Соберите змей у первой колонны, не позволяя двум Piercing Hiss пройти одновременно.",
    enemies: [["Primal Serpent", 3, "high"], ["Twinfang Harrower", 2, "high"], ["Ravenous Descendant", 2, "medium"]],
    abilities: [["Piercing Hiss", "Кик", "ShadowNova", "Primal Serpent"], ["Paralyzing Shots", "Диспел", "MysticHeals", "Twinfang Harrower"], ["Ravenous Claws", "Пурж", "MysticHeals", "Ravenous Descendant"]],
    callouts: ["Piercing Hiss прерываем по меткам.", "Paralyzing Shots снимаем сразу.", "Не стойте перед гарпунщиками."],
  },
  {
    title: "Голодные потомки", subtitle: "Ravenous Descendants", x: 43, y: 73, duration: 78, forces: 10,
    summary: "Потомки быстро разгоняют скорость атак. Короткое оглушение или отвод противника сбрасывает опасный темп и сохраняет защиту танка.",
    enemies: [["Ravenous Descendant", 3, "high"]],
    abilities: [["Ravenous Claws", "Пурж", "MysticHeals", "Ravenous Descendant"], ["Blood Frenzy", "Стоп", "Ironclad", "Ravenous Descendant"]],
    callouts: ["Оглушить потомка на разгоне атак.", "Не соединять два Blood Frenzy.", "После контроля добить отмеченную цель."],
  },
  {
    title: "Двор тотемов", subtitle: "Активировать древние тотемы", x: 57, y: 64, duration: 88, forces: 11,
    summary: "Зачистите обе стороны двора и активируйте все тотемы. Последнюю группу поставьте ближе к воротам босса, чтобы не терять время на переход.",
    enemies: [["Twinfang Harrower", 2, "high"], ["Primal Serpent", 2, "medium"]],
    abilities: [["Piercing Hiss", "Кик", "Windborne", "Primal Serpent"], ["Paralyzing Shots", "Диспел", "MysticHeals", "Twinfang Harrower"]],
    callouts: ["Активировать все тотемы после боя.", "Собраться у ворот после зачистки."],
  },
  {
    title: "Rav'i", subtitle: "Босс 1", x: 50, y: 54, kind: "boss", duration: 164, bloodlust: true,
    summary: "Уводите босса от Fresh Meat, разносите Triple Shot и проходите между волнами Regurgitate. Во время Ssscavenging закройте сферы и быстро снимите щит.",
    enemies: [["Rav'i", 1, "boss"]],
    abilities: [["Ravenous Stomp", "Уклонение", "Вся группа", "Rav'i"], ["Triple Shot", "Защита", "Цели механики", "Rav'i"], ["Regurgitate", "Диспел", "MysticHeals", "Rav'i"], ["Ssscavenging", "Фокус", "Все DPS", "Rav'i"]],
    callouts: ["Уводить босса от кусков мяса.", "Triple Shot — разойтись.", "В щит отдать весь доступный урон."],
    tank: "Переставляйте Rav'i после каждого Ravenous Stomp и не разворачивайте конус в группу.", healer: "Снимайте Regurgitate и поднимайте игроков до Triple Shot.", dps: "Сферы Ssscavenging закрываются сразу; щит босса — абсолютный приоритет.",
  },
  {
    title: "Камеры мутации", subtitle: "High Evolutionists", x: 49, y: 44, duration: 102, forces: 14,
    summary: "Не позволяйте завершить Evolve. Сначала ломайте щит усиленного эволюциониста, затем используйте контроль на следующую попытку мутации.",
    enemies: [["High Evolutionist", 2, "high"], ["Uncoiled Writhe", 3, "medium"]],
    abilities: [["Evolve", "Стоп", "Ironclad", "High Evolutionist"], ["Envenom", "Диспел", "MysticHeals", "High Evolutionist"], ["Spiteful Venom", "Диспел", "MysticHeals", "Uncoiled Writhe"]],
    callouts: ["Evolve останавливается контролем.", "Щит усиленного эволюциониста сломать первым.", "Яды снимать по одному."],
  },
  {
    title: "Инкубационный зал", subtitle: "Writhe + Evolutionists", x: 51, y: 36, duration: 108, forces: 14,
    summary: "Большая группа перед вторым боссом. Разнесите контроль Evolve, не вытягивая врагов в следующую комнату.",
    enemies: [["High Evolutionist", 2, "high"], ["Uncoiled Writhe", 4, "high"]],
    abilities: [["Evolve", "Стоп", "Windborne", "High Evolutionist"]],
    callouts: ["Не тратить оба массовых контроля вместе.", "Закончить бой до входа в комнату босса."],
  },
  {
    title: "The Writhing Coil", subtitle: "Босс 2", x: 50, y: 27, kind: "boss", duration: 178,
    summary: "Toxic Atrophy произносится серией из трёх заклинаний. Уклоняйтесь от Burrowing Charge, а на Death Rattle все пять игроков должны выбежать из притягивания.",
    enemies: [["The Writhing Coil", 1, "boss"]],
    abilities: [["Toxic Atrophy", "Кик", "Ротация киков", "The Writhing Coil"], ["Burrowing Charge", "Уклонение", "Вся группа", "The Writhing Coil"], ["Death Rattle", "Уклонение", "Вся группа", "The Writhing Coil"], ["Uncoil", "Фокус", "Все DPS", "The Writhing Coil"]],
    callouts: ["Три Toxic Atrophy — три назначенных прерывания.", "На Death Rattle бегут все.", "В фазе Uncoil урон проходит по всем копиям."],
  },
  {
    title: "Вознесённый страж", subtitle: "Ascendant Serpent", x: 50, y: 19, kind: "miniboss", duration: 104, forces: 17,
    summary: "Обязательный страж после второго босса. Сведите кольца к краю, прервите Mass Envenom и сохраните групповую защиту на вторую волну.",
    enemies: [["Ascendant Serpent", 1, "boss"], ["Ula'tek's Chosen", 2, "high"]],
    abilities: [["Mass Envenom", "Кик", "Ротация киков", "Ula'tek's Chosen"], ["Venomous Ascension", "Защита", "Вся группа", "Ascendant Serpent"]],
    callouts: ["Mass Envenom не пропускать.", "Кольца складывать у внешней стены."],
  },
  {
    title: "Последний ритуал", subtitle: "Ula'tek's Chosen", x: 50, y: 12, duration: 125, forces: 22,
    summary: "Последние силы противника. Прерывайте Mass Envenom, разносите ядовитые линии и не заходите на алтарь, пока группа не восстановилась.",
    enemies: [["Ula'tek's Chosen", 3, "high"], ["Primal Serpent", 2, "medium"]],
    abilities: [["Mass Envenom", "Кик", "Ротация киков", "Ula'tek's Chosen"], ["Piercing Hiss", "Кик", "Windborne", "Primal Serpent"]],
    callouts: ["Ровно 100% после группы.", "Перед боссом восстановить ресурсы."],
  },
  {
    title: "Zul'jan", subtitle: "Финальный босс", x: 50, y: 7, kind: "boss", duration: 188, bloodlust: true,
    summary: "Заранее назначьте четыре позиции для Ritual of the Fang. Перехватывайте лучи, снимайте уровни Ritual Venom через Boneslicer и уклоняйтесь от возвращающихся глеф.",
    enemies: [["Zul'jan", 1, "boss"]],
    abilities: [["Ritual of the Fang", "Защита", "Вся группа", "Zul'jan"], ["Ritual Venom", "Защита", "Цели механики", "Zul'jan"], ["Boneslicer", "Уклонение", "Цель дебаффа", "Zul'jan"], ["Axegrinder", "Уклонение", "Вся группа", "Zul'jan"]],
    callouts: ["Четыре луча перекрываются назначенными игроками.", "Boneslicer снимает все уровни яда.", "Учитывать обратный путь Axegrinder."],
  },
]);

const murderRow = buildStops([
  {
    title: "Контрабандный вход", subtitle: "Felonious crew", x: 55, y: 88, duration: 92, forces: 10,
    summary: "Соберите первый патруль у стены и заберите кристалл Скверны после боя. Fel Missiles и Seduction требуют раздельных прерываний.",
    enemies: [["Felonious Mage", 2, "high"], ["Seductive Sayaad", 1, "high"]],
    abilities: [["Fel Missiles", "Кик", "ShadowNova", "Felonious Mage"], ["Seduction", "Кик", "Windborne", "Seductive Sayaad"]],
    callouts: ["Назначить отдельное прерывание на Seduction.", "Забрать кристалл после боя.", "Фронтальные атаки направлять в стену."],
  },
  {
    title: "Рынок Скверны", subtitle: "Mages + smugglers", x: 46, y: 79, duration: 96, forces: 10,
    summary: "Две группы можно соединить под сильные способности команды. Клоны от Fel Missiles нужно быстро прервать и уничтожить.",
    enemies: [["Felonious Mage", 3, "high"], ["Seductive Sayaad", 1, "high"]],
    abilities: [["Fel Missiles", "Кик", "Ротация киков", "Felonious Mage"], ["Seduction", "Кик", "ShadowNova", "Seductive Sayaad"]],
    callouts: ["Клоны мага уничтожить сразу.", "Не расходиться далеко от танка."],
  },
  {
    title: "Kystia Manaheart", subtitle: "Босс 1", x: 38, y: 68, kind: "boss", duration: 170,
    summary: "Прерывайте Felstorm у зеркальных образов и используйте окно Destabilized для сильного урона. Не тратьте основные способности до появления уязвимости.",
    enemies: [["Kystia Manaheart", 1, "boss"]],
    abilities: [["Felstorm", "Кик", "Ротация киков", "Mirror Images"], ["Fel Missiles", "Кик", "ShadowNova", "Kystia Manaheart"], ["Destabilized", "Фокус", "Все DPS", "Kystia Manaheart"]],
    callouts: ["Прерывать именно зеркальные образы.", "Основной урон — в Destabilized.", "Образы собирать рядом с боссом."],
  },
  {
    title: "Склад контрабанды", subtitle: "Barrels + freight", x: 36, y: 55, duration: 112, forces: 12,
    summary: "Оставьте одну бочку целой для механики следующего босса. Источники не подтверждают отдельные NPC-сущности для грузчиков и контрабандистов этого чернового пула.",
    enemies: [],
    abilities: [],
    callouts: ["Одну бочку сохранить.", "Груз Скверны уничтожить первым."],
  },
  {
    title: "Zaen Bladesorrow", subtitle: "Босс 2", x: 42, y: 44, kind: "boss", duration: 184, bloodlust: true,
    summary: "Первым Fire Bomb взорвите лишнюю бочку, вторую сохраните для Murder in a Row. Во время Killing Spree используйте групповую защиту и сильное лечение.",
    enemies: [["Zaen Bladesorrow", 1, "boss"]],
    abilities: [["Killing Spree", "Защита", "Вся группа", "Zaen Bladesorrow"], ["Fire Bomb", "Уклонение", "Цели механики", "Zaen Bladesorrow"], ["Murder in a Row", "Уклонение", "Вся группа", "Zaen Bladesorrow"]],
    callouts: ["Первая бомба взрывает лишнюю бочку.", "За второй бочкой прячемся от залпа.", "Групповая защита на Killing Spree."],
  },
  {
    title: "Казармы гвардии", subtitle: "Wrathguards", x: 48, y: 58, duration: 112, forces: 14,
    summary: "Fel Rage нельзя пропускать: усиленный страж получает значительное снижение урона. Разверните широкие удары от лестницы и держите группу вместе.",
    enemies: [["Wrathguard Flayer", 3, "high"], ["Fel Invoker", 2, "high"]],
    abilities: [["Fel Rage", "Кик", "Ротация киков", "Wrathguard Flayer"], ["Health Funnel", "Кик", "ShadowNova", "Fel Invoker"]],
    callouts: ["Fel Rage — главное прерывание.", "Health Funnel не должен пройти.", "Стражей развернуть от группы."],
  },
  {
    title: "Xathuux the Annihilator", subtitle: "Босс 3", x: 54, y: 50, kind: "boss", duration: 176,
    summary: "Ставьте Axe Toss рядом с боссом, обходите Legion Strike и ведите Xathuux по внешнему краю во время Demonic Rage.",
    enemies: [["Xathuux the Annihilator", 1, "boss"]],
    abilities: [["Legion Strike", "Уклонение", "ArcanistVexis", "Xathuux the Annihilator"], ["Axe Toss", "Фокус", "Все DPS", "Xathuux the Annihilator"], ["Demonic Rage", "Уклонение", "Вся группа", "Xathuux the Annihilator"]],
    callouts: ["Топоры ставить в ближней зоне.", "Босса вести по внешнему краю.", "Не пересекать след Demonic Rage."],
  },
  {
    title: "Демонический квартал", subtitle: "Invokers + flayers", x: 57, y: 38, duration: 112, forces: 14,
    summary: "Последовательность прерываний важнее урона. Сначала остановите Health Funnel, затем Fel Rage; призванных демонов соберите в общую зону урона.",
    enemies: [["Fel Invoker", 3, "high"], ["Wrathguard Flayer", 2, "high"], ["Furious Vilefiend", 3, "medium"]],
    abilities: [["Health Funnel", "Кик", "ShadowNova", "Fel Invoker"], ["Fel Rage", "Кик", "Windborne", "Wrathguard Flayer"], ["Vile Eruption", "Уклонение", "Вся группа", "Furious Vilefiend"]],
    callouts: ["Health Funnel прерывается первым.", "Призванных демонов свести к стражам.", "Личные защиты на Vile Eruption."],
  },
  {
    title: "Проклятый груз", subtitle: "Freight gauntlet", x: 54, y: 27, duration: 118, forces: 16,
    summary: "Двигайтесь по коридору короткими группами. Состав чернового пула скрыт до сверки NPC ID с источником.",
    enemies: [["Felonious Mage", 2, "high"]],
    abilities: [["Fel Missiles", "Кик", "Ротация киков", "Felonious Mage"]],
    callouts: ["Магов отмечать черепом.", "Не отставать на переходе."],
  },
  {
    title: "Высадка Литиэль", subtitle: "Последняя охрана", x: 52, y: 17, duration: 126, forces: 24,
    summary: "Последние силы противника стоят в двух волнах. Сохраните массовый контроль на вторую пару заклинателей и закончите бой с готовой групповой защитой.",
    enemies: [["Wrathguard Flayer", 3, "high"], ["Fel Invoker", 3, "high"], ["Furious Vilefiend", 4, "medium"]],
    abilities: [["Fel Rage", "Кик", "Ротация киков", "Wrathguard Flayer"], ["Health Funnel", "Кик", "ShadowNova", "Fel Invoker"], ["Vile Eruption", "Защита", "Вся группа", "Furious Vilefiend"]],
    callouts: ["Разделить охрану на две волны.", "Вторая волна — массовый контроль.", "После боя должно быть 100%."],
  },
  {
    title: "Lithiel Cinderfury", subtitle: "Финальный босс", x: 52, y: 8, kind: "boss", duration: 204, bloodlust: true,
    summary: "Уводите призванного Infernal от группы, контролируйте Furious Vilefiend и собирайтесь ближе перед Fingers of Gul'dan. Malefic Wave безопасно пересекается через врата.",
    enemies: [["Lithiel Cinderfury", 1, "boss"], ["Furious Vilefiend", 2, "high"]],
    abilities: [["Chaos Bolt", "Кик", "Ротация киков", "Lithiel Cinderfury"], ["Summon Infernal", "Уклонение", "ArcanistVexis", "Lithiel Cinderfury"], ["Fingers of Gul'dan", "Уклонение", "Вся группа", "Lithiel Cinderfury"], ["Malefic Wave", "Защита", "Вся группа", "Lithiel Cinderfury"]],
    callouts: ["Vilefiend умирает до следующего кольца.", "Собраться перед Fingers of Gul'dan.", "Через Malefic Wave пройти вратами."],
  },
]);

const denOfNalorakk = buildStops([
  {
    title: "Лагерь собирателей", subtitle: "Собрать припасы", x: 48, y: 87, duration: 105, forces: 12,
    summary: "Соберите ресурсы для испытания и контролируйте птиц. Healing Breeze лечит всю группу врагов, поэтому это первое прерывание.",
    enemies: [["Keen-Eyed Striker", 3, "medium"], ["Earthwhisper Tender", 2, "high"]],
    abilities: [["Scavenge", "Кик", "Windborne", "Keen-Eyed Striker"], ["Healing Breeze", "Кик", "ShadowNova", "Earthwhisper Tender"]],
    callouts: ["Healing Breeze прерывать первым.", "После боя подобрать все припасы."],
  },
  {
    title: "Голодный дух", subtitle: "Spirit of Hunger", x: 40, y: 70, kind: "miniboss", duration: 98, forces: 10,
    summary: "Spirit of Hunger опасно соединять с другими сильными противниками. Снимайте Insatiable Hunger и не позволяйте духу долго атаковать одну цель.",
    enemies: [["Spirit of Hunger", 1, "boss"], ["Keen-Eyed Striker", 2, "medium"]],
    abilities: [["Insatiable Hunger", "Диспел", "MysticHeals", "Spirit of Hunger"], ["Devouring Lunge", "Защита", "ArcanistVexis", "Spirit of Hunger"]],
    callouts: ["Spirit of Hunger брать отдельно.", "Снимать Insatiable Hunger сразу.", "Не стоять на линии прыжка."],
  },
  {
    title: "The Hoardmonger", subtitle: "Босс 1", x: 47, y: 57, kind: "boss", duration: 176, bloodlust: true,
    summary: "Уклоняйтесь от Earthshatter Slam и закрывайте Spoiled Supplies. Грибы лучше собирать по краю, чтобы центр комнаты оставался свободным.",
    enemies: [["The Hoardmonger", 1, "boss"]],
    abilities: [["Ravenous Bellow", "Защита", "Вся группа", "The Hoardmonger"], ["Earthshatter Slam", "Уклонение", "Вся группа", "The Hoardmonger"], ["Spoiled Supplies", "Уклонение", "Цели механики", "The Hoardmonger"], ["Toxic Spores", "Диспел", "MysticHeals", "The Hoardmonger"]],
    callouts: ["Грибы закрывать у внешнего края.", "Выйти из конуса Earthshatter Slam.", "Снять Toxic Spores после перемещения."],
  },
  {
    title: "Мост ветров", subtitle: "Rising Winds", x: 54, y: 48, duration: 98, forces: 13,
    summary: "Быстро пересеките мост и прячьтесь за камнями от Rising Winds. Отбрасывающих врагов разверните в сторону стены.",
    enemies: [["Frigid Mauler", 2, "high"], ["Earthwhisper Tender", 1, "high"]],
    abilities: [["Frigid Roar", "Кик", "ShadowNova", "Frigid Mauler"], ["Healing Breeze", "Кик", "Windborne", "Earthwhisper Tender"]],
    callouts: ["Сначала пересечь мост, затем начинать бой.", "Прятаться за камнями от ветра.", "Отбрасывания направлять в стену."],
  },
  {
    title: "Ледяная пещера", subtitle: "Glacial Revenants", x: 59, y: 37, duration: 110, forces: 13,
    summary: "Укладывайте Snowdrift у одной стены и снимайте Cryo Surge только после стабилизации группы. Не стойте между двумя ледяными ядрами.",
    enemies: [["Glacial Revenant", 2, "high"], ["Fractured Shivercore", 4, "medium"], ["Frigid Mauler", 1, "high"]],
    abilities: [["Cryo Surge", "Диспел", "MysticHeals", "Glacial Revenant"], ["Snowdrift", "Уклонение", "Вся группа", "Fractured Shivercore"], ["Frigid Roar", "Кик", "ShadowNova", "Frigid Mauler"]],
    callouts: ["Лужи складывать у одной стены.", "Cryo Surge снимать по одному.", "Ядра добивать рядом с краем."],
  },
  {
    title: "Sentinel of Winter", subtitle: "Босс 2", x: 63, y: 27, kind: "boss", duration: 190,
    summary: "Убивайте Fractured Shivercore в заранее выбранной точке. Во время Frozen Tempest держитесь в безопасном глазу, а Winter's Shroud обязательно прерывайте.",
    enemies: [["Sentinel of Winter", 1, "boss"], ["Fractured Shivercore", 2, "high"]],
    abilities: [["Winter's Shroud", "Кик", "Ротация киков", "Sentinel of Winter"], ["Glacial Torment", "Диспел", "MysticHeals", "Sentinel of Winter"], ["Frozen Tempest", "Уклонение", "Вся группа", "Sentinel of Winter"], ["Rimeshatter", "Защита", "Цели механики", "Sentinel of Winter"]],
    callouts: ["Ядра умирают в одной точке.", "На Frozen Tempest зайти внутрь глаза.", "Winter's Shroud не должен пройти."],
  },
  {
    title: "Территория матриарха", subtitle: "Matriarch + beasttamers", x: 52, y: 34, duration: 116, forces: 14,
    summary: "Снимите Mother's Wrath до соединения зверей и не ведите матриарха к следующей группе.",
    enemies: [["Territorial Matriarch", 1, "high"], ["Bonded Beasttamer", 2, "high"], ["Loyal Saberfang", 3, "medium"]],
    abilities: [["Mother's Wrath", "Пурж", "MysticHeals", "Territorial Matriarch"], ["Bestial Wrath", "Пурж", "MysticHeals", "Bonded Beasttamer"]],
    callouts: ["Mother's Wrath снять сразу.", "Не вести матриарха к следующей группе."],
  },
  {
    title: "Аманийские укротители", subtitle: "Beasttamer packs", x: 43, y: 43, duration: 120, forces: 16,
    summary: "Две группы укротителей безопаснее брать по очереди. Bestial Wrath снимается сразу, а Arc Lightning требует отдельного прерывания.",
    enemies: [["Bonded Beasttamer", 3, "high"], ["Loyal Saberfang", 4, "medium"], ["Stormbound Mystic", 1, "high"]],
    abilities: [["Bestial Wrath", "Пурж", "MysticHeals", "Bonded Beasttamer"], ["Arc Lightning", "Кик", "ShadowNova", "Stormbound Mystic"]],
    callouts: ["Группы брать по очереди.", "Arc Lightning прерывать первым."],
  },
  {
    title: "Тропа испытания", subtitle: "Stormbound final packs", x: 37, y: 55, duration: 136, forces: 22,
    summary: "Последние силы противника. Разнесите Arc Lightning по двум назначениям и не активируйте арену, пока лечение и защитные способности не готовы.",
    enemies: [["Stormbound Mystic", 3, "high"], ["Loyal Saberfang", 3, "medium"], ["Bonded Beasttamer", 2, "high"]],
    abilities: [["Arc Lightning", "Кик", "Ротация киков", "Stormbound Mystic"], ["Bestial Wrath", "Пурж", "MysticHeals", "Bonded Beasttamer"], ["Storm Rush", "Уклонение", "Вся группа", "Loyal Saberfang"]],
    callouts: ["Два назначения на Arc Lightning.", "После боя должно быть 100%.", "Перед ареной восстановить ресурсы."],
  },
  {
    title: "Nalorakk", subtitle: "Финальный босс", x: 49, y: 66, kind: "boss", duration: 205, bloodlust: true,
    summary: "Echoing Maul размещайте у внешнего края. На Fury of the War God встаньте между Zul'jarra и медведями, а Forceful Slam разделите с танком.",
    enemies: [["Nalorakk", 1, "boss"], ["Echo of Nalorakk", 4, "high"]],
    abilities: [["Echoing Maul", "Уклонение", "Цели механики", "Nalorakk"], ["Forceful Roar", "Уклонение", "Вся группа", "Nalorakk"], ["Forceful Slam", "Защита", "ArcanistVexis", "Nalorakk"], ["Fury of the War God", "Защита", "Вся группа", "Nalorakk"]],
    callouts: ["Echoing Maul — у края.", "Медведей перехватывают назначенные игроки.", "Forceful Slam делить с танком."],
  },
]);

const blindingVale = buildStops([
  {
    title: "Тропа Светоцвета", subtitle: "Spellsowers + lashers", x: 18, y: 63, duration: 96, forces: 11,
    summary: "Начальная развилка позволяет выбрать сторону. На безопасном маршруте прерывайте Light Bolt Volley.",
    enemies: [["Radiant Spellsower", 2, "high"], ["Lightgorged Lasher", 2, "high"]],
    abilities: [["Light Bolt Volley", "Кик", "Ротация киков", "Radiant Spellsower"]],
    callouts: ["Volley прерывать по меткам.", "Идём по левой тропе."],
  },
  {
    title: "Сад триединства", subtitle: "Kezkitt's attendants", x: 35, y: 52, duration: 108, forces: 12,
    summary: "Сведите трёх хранителей к центру, но оставьте проход к Lightblossom свободным. Disorienting Screech останавливается любым доступным контролем.",
    enemies: [["Lightfeather Petalwing", 3, "high"], ["Radiant Spellsower", 2, "high"]],
    abilities: [["Disorienting Screech", "Стоп", "Ironclad", "Lightfeather Petalwing"], ["Light Bolt Volley", "Кик", "ShadowNova", "Radiant Spellsower"]],
    callouts: ["Screech остановить контролем.", "Не перекрывать Lightblossom лужами.", "Хранителей держать вместе."],
  },
  {
    title: "Lightblossom Trinity", subtitle: "Босс 1", x: 47, y: 50, kind: "boss", duration: 185,
    summary: "Разноситесь перед Thornblade, уходите от Fan Of Thorns и не стойте на пути Lightsower Dash. Лучи в Lightblossom необходимо перекрывать игроками.",
    enemies: [["Meittik", 1, "boss"], ["Lekshi", 1, "boss"], ["Kezkitt", 1, "boss"]],
    abilities: [["Thornblade", "Уклонение", "Цели механики", "Lekshi"], ["Fan Of Thorns", "Уклонение", "Вся группа", "Lekshi"], ["Lightsower Dash", "Уклонение", "Вся группа", "Lekshi"], ["Lightblossom Beam", "Защита", "Цели механики", "Kezkitt"]],
    callouts: ["Лучи перекрывать внутри цветка.", "После телепорта сразу выйти из Fan Of Thorns.", "Не пересекать линию рывка."],
  },
  {
    title: "Кровавые заросли", subtitle: "Sporeblight Belchers", x: 55, y: 65, duration: 112, forces: 13,
    summary: "Для этой группы оставлены только сущности и способность, которые удалось точно связать с источником.",
    enemies: [["Sporeblight Belcher", 2, "high"], ["Lightfeather Petalwing", 2, "high"]],
    abilities: [["Disorienting Screech", "Стоп", "Ironclad", "Lightfeather Petalwing"]],
    callouts: ["Screech остановить контролем."],
  },
  {
    title: "Ikuzz the Light Hunter", subtitle: "Босс 2", x: 66, y: 52, kind: "boss", duration: 180, bloodlust: true,
    summary: "После Verdant Stomp быстро вернитесь к центру. На Bloodthorn Roots соберитесь для массового урона, а цель Bloodthirsty Gaze убегает от босса.",
    enemies: [["Ikuzz the Light Hunter", 1, "boss"], ["Bloodthorn Roots", 5, "high"]],
    abilities: [["Verdant Stomp", "Уклонение", "Вся группа", "Ikuzz the Light Hunter"], ["Bloodthorn Roots", "Фокус", "Все DPS", "Ikuzz the Light Hunter"], ["Bloodthirsty Gaze", "Уклонение", "Цель механики", "Ikuzz the Light Hunter"]],
    callouts: ["На корнях собраться вместе.", "Фиксация бежит от босса.", "После отбрасывания не попадать в заросли."],
  },
  {
    title: "Сияющий перевал", subtitle: "Petalwings + wardens", x: 62, y: 37, duration: 106, forces: 14,
    summary: "Держитесь внутри тропы и не отбрасывайте врагов в соседние группы. Прерывайте Light Bolt Volley и сохраняйте контроль для Disorienting Screech.",
    enemies: [["Lightfeather Petalwing", 3, "high"], ["Radiant Spellsower", 1, "medium"]],
    abilities: [["Disorienting Screech", "Стоп", "Ironclad", "Lightfeather Petalwing"], ["Light Bolt Volley", "Кик", "ShadowNova", "Radiant Spellsower"]],
    callouts: ["Screech остановить массовым контролем.", "Не срезать через соседнюю тропу."],
  },
  {
    title: "Поля спор", subtitle: "Belchers + lashers", x: 49, y: 34, duration: 118, forces: 14,
    summary: "Названия abilities этой группы ожидают проверки по источнику и не публикуются в tactical draft.",
    enemies: [["Lightgorged Lasher", 3, "high"], ["Sporeblight Belcher", 2, "high"]],
    abilities: [],
    callouts: ["Проверка abilities этой группы не завершена."],
  },
  {
    title: "Lightwarden Ruia", subtitle: "Босс 3", x: 51, y: 24, kind: "boss", duration: 184,
    summary: "Раскладывайте Lightfire, полностью лечите Grievous Thrash и стойте неподвижно с конусами Pulverizing Strikes, чтобы другие игроки разошлись.",
    enemies: [["Lightwarden Ruia", 1, "boss"]],
    abilities: [["Warden's Wrath", "Кик", "Ротация киков", "Lightwarden Ruia"], ["Lightfire", "Уклонение", "Цели механики", "Lightwarden Ruia"], ["Grievous Thrash", "Защита", "MysticHeals", "Lightwarden Ruia"], ["Pulverizing Strikes", "Уклонение", "Цели механики", "Lightwarden Ruia"]],
    callouts: ["Цели конусов стоят, остальные отходят.", "Grievous Thrash снимается полным здоровьем.", "Warden's Wrath прерывать."],
  },
  {
    title: "Цветущая низина", subtitle: "Final vale packs", x: 69, y: 31, duration: 116, forces: 16,
    summary: "Пройдите нижнюю тропу двумя группами и сохраняйте массовое оглушение для тройного Screech.",
    enemies: [["Lightgorged Lasher", 2, "high"], ["Lightfeather Petalwing", 3, "high"], ["Sporeblight Belcher", 1, "high"]],
    abilities: [["Disorienting Screech", "Стоп", "Ironclad", "Lightfeather Petalwing"]],
    callouts: ["Разделить участок на две группы.", "Массовый контроль на тройной Screech.", "Belcher — первая цель."],
  },
  {
    title: "Берег Светоцвета", subtitle: "Ziekket's sentries", x: 82, y: 46, duration: 128, forces: 20,
    summary: "Последняя охрана перед финальной ареной. Прерывайте Lightspore Shot и закончите бой с готовыми защитными способностями.",
    enemies: [["Lightspawn Lasher", 3, "high"], ["Radiant Spellsower", 2, "high"]],
    abilities: [["Lightspore Shot", "Кик", "Ротация киков", "Lightspawn Lasher"], ["Light Bolt Volley", "Кик", "ShadowNova", "Radiant Spellsower"]],
    callouts: ["Lightspore Shot — главное прерывание.", "После боя должно быть 100%.", "Перед ареной восстановить ресурсы."],
  },
  {
    title: "Ziekket", subtitle: "Финальный босс", x: 88, y: 46, kind: "boss", duration: 196, bloodlust: true,
    summary: "Закрывайте Lightbloom's Essence ради усиления, убивайте пробуждённых противников и направляйте Concentrated Lightbeam в их тела.",
    enemies: [["Ziekket", 1, "boss"], ["Lightspawn Lasher", 3, "high"]],
    abilities: [["Lightspore Shot", "Кик", "Ротация киков", "Ziekket"], ["Lightbloom's Essence", "Защита", "Цели механики", "Ziekket"], ["Awaken the Lightbloom", "Фокус", "Все DPS", "Ziekket"], ["Concentrated Lightbeam", "Уклонение", "Цель механики", "Ziekket"]],
    callouts: ["Сферы закрывать по назначению.", "Добавочных врагов быстро убить.", "Луч направить через их тела."],
  },
]);

const voidscarArena = buildStops([
  {
    title: "Врата бойцов", subtitle: "Brawlers + magi", x: 50, y: 87, duration: 96, forces: 12,
    summary: "На развилке выбран левый путь с усилением универсальности. Demoralizing Shout и Shadowbolt Volley требуют отдельных прерываний.",
    enemies: [["Dominated Brawler", 3, "high"], ["Voidtouched Magi", 2, "high"], ["Sycophantic Tarasek", 2, "medium"]],
    abilities: [["Demoralizing Shout", "Кик", "Windborne", "Dominated Brawler"], ["Shadowbolt Volley", "Кик", "ShadowNova", "Voidtouched Magi"], ["Melt Armor", "Диспел", "MysticHeals", "Sycophantic Tarasek"]],
    callouts: ["Берём левый путь: усиление универсальности.", "Volley — главное прерывание.", "Melt Armor снять с танка."],
  },
  {
    title: "Левая трибуна", subtitle: "Krolusks + tuskarr", x: 34, y: 60, duration: 112, forces: 13,
    summary: "Разверните Brutok в стену, снимите Bolster и прервите Violent Sand. Защитная черепаха получает больше урона после падения щита.",
    enemies: [["Angry Krolusk", 2, "high"], ["Longtooth Tuskarr", 2, "high"], ["Protective Turtle", 1, "medium"], ["Brutok", 1, "high"]],
    abilities: [["Violent Sand", "Кик", "ShadowNova", "Angry Krolusk"], ["Bolster", "Пурж", "MysticHeals", "Longtooth Tuskarr"]],
    callouts: ["Bolster снять сразу.", "Черепаху добить после щита."],
  },
  {
    title: "Taz'Rah", subtitle: "Босс 1", x: 29, y: 31, kind: "boss", duration: 176,
    summary: "Разнесите линии Nether Dash и не пересекайте траектории других игроков. Dark Bloom создаёт сферы из каждой лужи — держите центр свободным.",
    enemies: [["Taz'Rah", 1, "boss"]],
    abilities: [["Nether Dash", "Уклонение", "Вся группа", "Taz'Rah"], ["Dark Bloom", "Уклонение", "Цели механики", "Taz'Rah"]],
    callouts: ["Линии Dash раскладывать веером.", "Лужи Dark Bloom — у края.", "Не пересекать чужую линию."],
  },
  {
    title: "Переход через арену", subtitle: "Screamers + voidscythes", x: 50, y: 52, duration: 110, forces: 15,
    summary: "Mad Shriek останавливается любой ценой, Corrosive Essence снимается с цели. Не стойте на линии Voidscythe.",
    enemies: [["Kilivore Screamer", 3, "high"], ["Agitated Voidscythe", 2, "high"], ["Devouring Brutalizer", 1, "medium"]],
    abilities: [["Mad Shriek", "Кик", "Ротация киков", "Kilivore Screamer"], ["Corrosive Essence", "Диспел", "MysticHeals", "Agitated Voidscythe"], ["Devour", "Фокус", "Все DPS", "Devouring Brutalizer"]],
    callouts: ["Mad Shriek не пропускать.", "Цель Devour быстро освободить.", "Corrosive Essence снять после рывка."],
  },
  {
    title: "Ядовитый круг", subtitle: "Tarasek + voidscythes", x: 68, y: 59, duration: 116, forces: 15,
    summary: "Соберите группу в центре круга, разложите ядовитые зоны по внешнему краю и снимите Melt Armor до следующего удара по танку.",
    enemies: [["Sycophantic Tarasek", 3, "high"], ["Agitated Voidscythe", 2, "high"], ["Voidtouched Magi", 1, "high"]],
    abilities: [["Melt Armor", "Диспел", "MysticHeals", "Sycophantic Tarasek"], ["Corrosive Essence", "Диспел", "MysticHeals", "Agitated Voidscythe"], ["Shadowbolt Volley", "Кик", "ShadowNova", "Voidtouched Magi"]],
    callouts: ["Ядовитые зоны — у края.", "Melt Armor снимать до следующего удара.", "Volley прерывается первым."],
  },
  {
    title: "Atroxus", subtitle: "Босс 2", x: 72, y: 31, kind: "boss", duration: 184, bloodlust: true,
    summary: "Быстро уничтожайте Toxic Creeper после Monstrous Roar, уходите из Poison Splash и снимайте Mind-Numbing Poison только после безопасного перемещения.",
    enemies: [["Atroxus", 1, "boss"], ["Toxic Creeper", 1, "high"]],
    abilities: [["Monstrous Roar", "Фокус", "Все DPS", "Atroxus"], ["Poison Splash", "Уклонение", "Вся группа", "Atroxus"], ["Mind-Numbing Poison", "Диспел", "MysticHeals", "Atroxus"]],
    callouts: ["Toxic Creeper — абсолютный приоритет.", "Лужи раскладывать у края.", "Яд снять после выхода из опасной зоны."],
  },
  {
    title: "Зверинец Бездны", subtitle: "Brutalizers", x: 66, y: 49, duration: 114, forces: 14,
    summary: "Devouring Brutalizer пытается съесть союзного ему противника и восстановить здоровье. Уничтожьте выбранную жертву до завершения Devour.",
    enemies: [["Devouring Brutalizer", 2, "high"], ["Kilivore Screamer", 2, "high"]],
    abilities: [["Devour", "Фокус", "Все DPS", "Devouring Brutalizer"], ["Mad Shriek", "Кик", "ShadowNova", "Kilivore Screamer"]],
    callouts: ["Жертву Devour уничтожить первой.", "Shriek прерывать по метке."],
  },
  {
    title: "Зал разума", subtitle: "Voidminders", x: 57, y: 42, duration: 118, forces: 14,
    summary: "Mending Void нельзя пропускать. Сведите две группы только при наличии массового контроля и заранее назначьте два прерывания.",
    enemies: [["Voidminder", 3, "high"], ["Voidtouched Magi", 2, "high"], ["Sycophantic Tarasek", 2, "medium"]],
    abilities: [["Mending Void", "Кик", "Ротация киков", "Voidminder"], ["Shadowbolt Volley", "Кик", "ShadowNova", "Voidtouched Magi"], ["Melt Armor", "Диспел", "MysticHeals", "Sycophantic Tarasek"]],
    callouts: ["Два назначения на Mending Void.", "Массовый контроль после сбора.", "Танк отмечает следующую цель."],
  },
  {
    title: "Космический порог", subtitle: "Final arena guards", x: 50, y: 24, duration: 132, forces: 17,
    summary: "Последние силы противника. Не объединяйте две пары заклинателей и закончите бой с готовыми способностями перед Charonus.",
    enemies: [["Voidminder", 2, "high"], ["Agitated Voidscythe", 3, "high"], ["Dominated Brawler", 3, "medium"]],
    abilities: [["Mending Void", "Кик", "ShadowNova", "Voidminder"], ["Corrosive Essence", "Диспел", "MysticHeals", "Agitated Voidscythe"], ["Demoralizing Shout", "Кик", "Windborne", "Dominated Brawler"]],
    callouts: ["Пары заклинателей брать отдельно.", "После боя должно быть 100%.", "Перед боссом восстановить ресурсы."],
  },
  {
    title: "Charonus", subtitle: "Финальный босс", x: 50, y: 12, kind: "boss", duration: 198, bloodlust: true,
    summary: "Водите Gravitic Orbs в Unstable Singularity, расходите Cosmic Crash и двигайтесь вокруг босса во время Void Cascade.",
    enemies: [["Charonus", 1, "boss"], ["Gravitic Orb", 3, "high"]],
    abilities: [["Unstable Singularity", "Уклонение", "Вся группа", "Charonus"], ["Cosmic Crash", "Уклонение", "Цели механики", "Charonus"], ["Gravitic Orbs", "Уклонение", "Цели механики", "Charonus"], ["Void Cascade", "Уклонение", "Цель механики", "Charonus"]],
    callouts: ["Каждой сфере назначить свою сингулярность.", "Cosmic Crash — разойтись.", "Void Cascade вести по кругу."],
  },
]);

const kingsRest = buildStops([
  {
    title: "Склеп первого короля", subtitle: "Minions of Zul", x: 18, y: 48, duration: 102, forces: 11,
    summary: "В этом подземелье требуется победить почти каждого противника. Minion of Zul можно мгновенно уничтожить снятием магического щита.",
    enemies: [["Minion of Zul", 4, "high"], ["Risen Hexer", 2, "high"], ["Animated Guardian", 2, "medium"]],
    abilities: [["Pit of Despair", "Диспел", "MysticHeals", "Minion of Zul"], ["Hex Volley", "Кик", "Ротация киков", "Risen Hexer"]],
    callouts: ["Щит Minion of Zul снять сразу.", "Hex Volley прерывать по меткам.", "Не пропускать боковую группу."],
  },
  {
    title: "Позолоченный проход", subtitle: "Constructs + hexers", x: 35, y: 47, duration: 98, forces: 10,
    summary: "Соберите конструкции у лестницы и оставьте проход к боссу свободным. Ядовитые облака раскладываются вдоль стены.",
    enemies: [["Animated Guardian", 3, "high"], ["Risen Hexer", 2, "high"]],
    abilities: [["Hex Volley", "Кик", "ShadowNova", "Risen Hexer"]],
    callouts: ["Конструкции развернуть от группы.", "Облака — вдоль стены.", "Hexer убивается первым."],
  },
  {
    title: "The Golden Serpent", subtitle: "Босс 1", x: 48, y: 48, kind: "boss", duration: 178, bloodlust: true,
    summary: "Складывайте Spit Gold рядом, но не перекрывайте путь. На Lucre's Call быстро уничтожайте Animated Gold и не направляйте хвост в группу.",
    enemies: [["The Golden Serpent", 1, "boss"], ["Animated Gold", 4, "high"]],
    abilities: [["Spit Gold", "Уклонение", "Цели механики", "The Golden Serpent"], ["Lucre's Call", "Фокус", "Все DPS", "The Golden Serpent"], ["Serpentine Gust", "Уклонение", "Вся группа", "The Golden Serpent"]],
    callouts: ["Spit Gold складывать рядом.", "Animated Gold быстро собрать и убить.", "Не стоять перед головой и хвостом."],
  },
  {
    title: "Зал бальзамирования", subtitle: "Mummies + fluids", x: 47, y: 31, duration: 116, forces: 13,
    summary: "Wretched Discharge прерывается, Lingering Fluid снимается после перемещения. Не стойте в выбросах бальзамирующей жидкости.",
    enemies: [["Half-Finished Mummy", 3, "high"], ["Embalming Fluid", 2, "medium"], ["Seneschal M'bara", 1, "high"]],
    abilities: [["Wretched Discharge", "Кик", "Ротация киков", "Half-Finished Mummy"], ["Lingering Fluid", "Диспел", "MysticHeals", "Embalming Fluid"], ["Unholy Mending", "Кик", "ShadowNova", "Seneschal M'bara"]],
    callouts: ["Wretched Discharge не пропускать.", "Unholy Mending — второе назначение.", "Жидкость снимать вне опасной зоны."],
  },
  {
    title: "Shadow of Zul", subtitle: "Обязательный мини-босс", x: 51, y: 24, kind: "miniboss", duration: 120, forces: 12,
    summary: "Два игрока постоянно закрывают зоны Dark Revelation. Появившихся Minion of Zul снимайте или быстро ломайте их щиты.",
    enemies: [["Shadow of Zul", 1, "boss"], ["Minion of Zul", 2, "high"]],
    abilities: [["Dark Revelation", "Защита", "Цели механики", "Shadow of Zul"], ["Shadow Barrage", "Защита", "Вся группа", "Shadow of Zul"], ["Pit of Despair", "Диспел", "MysticHeals", "Minion of Zul"]],
    callouts: ["Два игрока постоянно стоят в зонах.", "Minion of Zul снять сразу.", "Групповая защита на Shadow Barrage."],
  },
  {
    title: "Mchimba the Embalmer", subtitle: "Босс 2", x: 58, y: 17, kind: "boss", duration: 182,
    summary: "Игрок в гробу подаёт сигнал своей группе. Открывайте правильный саркофаг, уходите от Burn Corruption и не стойте в Drain Fluids.",
    enemies: [["Mchimba the Embalmer", 1, "boss"]],
    abilities: [["Entomb", "Фокус", "Все DPS", "Mchimba the Embalmer"], ["Burn Corruption", "Уклонение", "Вся группа", "Mchimba the Embalmer"], ["Drain Fluids", "Уклонение", "Цель механики", "Mchimba the Embalmer"]],
    callouts: ["Игрок в гробу пингует позицию.", "Открыть правильный саркофаг.", "Не пересекать лужи Burn Corruption."],
  },
  {
    title: "Зал почётных мёртвых", subtitle: "Queens + seneschals", x: 64, y: 44, duration: 126, forces: 14,
    summary: "Bind Soul и Unholy Mending требуют разных прерываний. Не соединяйте обе стороны комнаты без массового контроля.",
    enemies: [["Queen Wasi", 2, "high"], ["Seneschal M'bara", 2, "high"], ["Royal Berserker", 3, "medium"]],
    abilities: [["Bind Soul", "Кик", "ShadowNova", "Queen Wasi"], ["Unholy Mending", "Кик", "Windborne", "Seneschal M'bara"], ["Severing Blade", "Уклонение", "Мили", "Royal Berserker"]],
    callouts: ["Комнату делим на две стороны.", "Bind Soul — первое прерывание.", "Berserker разворачивается к стене."],
  },
  {
    title: "Совет племён", subtitle: "Босс 3", x: 76, y: 49, kind: "boss", duration: 205,
    summary: "Каждый член совета требует отдельной реакции: Poison Nova прерывается, тотемы уничтожаются сразу, а прыжки раскладываются по комнате.",
    enemies: [["Zanazal the Wise", 1, "boss"], ["Aka'ali the Conqueror", 1, "boss"], ["Kula the Butcher", 1, "boss"], ["Explosive Totem", 2, "high"]],
    abilities: [["Poison Nova", "Кик", "Ротация киков", "Zanazal the Wise"], ["Call of the Elements", "Фокус", "Все DPS", "Zanazal the Wise"], ["Debilitating Backhand", "Защита", "ArcanistVexis", "Aka'ali the Conqueror"], ["Barrel Through", "Уклонение", "Вся группа", "Kula the Butcher"]],
    callouts: ["Poison Nova не пропускать.", "Explosive Totem убивать первым.", "Backhand — сильная защита танка."],
  },
  {
    title: "Галерея завоевателей", subtitle: "Spectral guard", x: 69, y: 66, duration: 120, forces: 14,
    summary: "Фантомные стражи активируются по очереди. Прерывайте Hex и не позволяйте двум Blade Combo попасть в танка без защиты.",
    enemies: [["Phantom Hex Priest", 2, "high"], ["Royal Berserker", 3, "high"], ["Honored Raptor", 3, "medium"]],
    abilities: [["Hex", "Кик", "ShadowNova", "Phantom Hex Priest"], ["Blade Combo", "Защита", "ArcanistVexis", "Royal Berserker"]],
    callouts: ["Стражей активировать по очереди.", "Hex прерывать первым.", "Blade Combo — защита танка."],
  },
  {
    title: "Reban и T'zala", subtitle: "Королевские звери", x: 80, y: 69, duration: 118, forces: 12,
    summary: "Deathly Roar прерывается, Savage Maul снимается с танка. Разнесите прыжки и не заводите зверей в зал финального босса.",
    enemies: [["Reban", 1, "boss"], ["T'zala", 1, "boss"], ["Honored Raptor", 2, "medium"]],
    abilities: [["Deathly Roar", "Кик", "Ротация киков", "Reban"], ["Savage Maul", "Диспел", "MysticHeals", "T'zala"], ["Quaking Leap", "Уклонение", "Цели механики", "Honored Raptor"]],
    callouts: ["Deathly Roar обязательно прервать.", "Savage Maul снять с танка.", "Прыжки разнести."],
  },
  {
    title: "Залы пепла", subtitle: "Final royal guard", x: 48, y: 73, duration: 132, forces: 14,
    summary: "Последняя охрана идёт волнами. Не спешите активировать финального босса и закончите зачистку ровно на 100%.",
    enemies: [["Royal Berserker", 3, "high"], ["Phantom Hex Priest", 2, "high"], ["Animated Guardian", 2, "medium"]],
    abilities: [["Blade Combo", "Защита", "ArcanistVexis", "Royal Berserker"], ["Hex", "Кик", "Ротация киков", "Phantom Hex Priest"]],
    callouts: ["Волны активировать по очереди.", "После боя должно быть 100%.", "Перед Дазаром восстановить ресурсы."],
  },
  {
    title: "King Dazar", subtitle: "Финальный босс", x: 42, y: 81, kind: "boss", duration: 212, bloodlust: true,
    summary: "Уклоняйтесь от фронтальной Gilded Destruction, разносите Quaking Leap и используйте сильную защиту танка на Blade Combo.",
    enemies: [["King Dazar", 1, "boss"], ["Reban", 1, "high"], ["T'zala", 1, "high"]],
    abilities: [["Blade Combo", "Защита", "ArcanistVexis", "King Dazar"], ["Gilded Destruction", "Уклонение", "Вся группа", "King Dazar"], ["Quaking Leap", "Уклонение", "Цели механики", "King Dazar"], ["Deathly Roar", "Кик", "Ротация киков", "Reban"]],
    callouts: ["Спирсы Gilded Destruction появляются на игроках.", "Quaking Leap — разойтись.", "Blade Combo — большая защита танка."],
  },
]);

const templeOfSethraliss = buildStops([
  {
    title: "Атриум Сетралисс", subtitle: "Shrouded Fangs", x: 66, y: 88, duration: 102, forces: 11,
    summary: "Начальная группа задаёт ротацию прерываний. Poisoned Cheap Shot снимается с цели, а фронтальные атаки направляются к внешней стене.",
    enemies: [["Shrouded Fang", 3, "high"], ["Faithless Subjugator", 2, "high"], ["Poisonous Viper", 3, "medium"]],
    abilities: [["Poisoned Cheap Shot", "Кик", "ShadowNova", "Shrouded Fang"], ["Addle Mind", "Кик", "Windborne", "Faithless Subjugator"], ["Cytotoxin", "Диспел", "MysticHeals", "Poisonous Viper"]],
    callouts: ["Cheap Shot — первое прерывание.", "Cytotoxin снять сразу.", "Змей держать лицом к стене."],
  },
  {
    title: "Adderis и Aspix", subtitle: "Босс 1", x: 58, y: 77, kind: "boss", duration: 194,
    summary: "Бейте только босса без Storm Blessed. Tempest Winds складывайте у края, Gale Force переживайте ближе к центру, а Thunder and Lightning закрывайте группой.",
    enemies: [["Adderis", 1, "boss"], ["Aspix", 1, "boss"]],
    abilities: [["Tempest Winds", "Уклонение", "Цели механики", "Aspix"], ["Gale Force", "Уклонение", "Вся группа", "Aspix"], ["Thunder and Lightning", "Защита", "Вся группа", "Adderis"], ["Storm Blessed", "Фокус", "Все DPS", "Adderis и Aspix"]],
    callouts: ["Менять цель вместе со Storm Blessed.", "Групповой удар закрывать вместе.", "Зоны молчания складывать у края."],
  },
  {
    title: "Кладка Великой Матери", subtitle: "Vipers + riders", x: 45, y: 64, duration: 114, forces: 12,
    summary: "Poisonous Viper умирают первыми. Прерывайте Addle Mind и снимайте Cytotoxin.",
    enemies: [["Poisonous Viper", 4, "high"], ["Sand-Sworn Rider", 2, "high"], ["Faithless Subjugator", 1, "medium"]],
    abilities: [["Cytotoxin", "Диспел", "MysticHeals", "Poisonous Viper"], ["Addle Mind", "Кик", "ShadowNova", "Faithless Subjugator"]],
    callouts: ["Viper — первая цель.", "Addle Mind прерывать."],
  },
  {
    title: "Merektha", subtitle: "Босс 2", x: 39, y: 51, kind: "boss", duration: 190, bloodlust: true,
    summary: "Соберитесь перед A Knot of Snakes и освободите игрока массовым контролем. Непрерывно двигайтесь с Thunder Spit и уходите с линии Burrow.",
    enemies: [["Merektha", 1, "boss"], ["A Knot of Snakes", 4, "high"]],
    abilities: [["Poison Spit", "Кик", "Ротация киков", "Merektha"], ["A Knot of Snakes", "Стоп", "Ironclad", "Merektha"], ["Thunder Spit", "Уклонение", "Цель механики", "Merektha"], ["Burrow", "Уклонение", "Вся группа", "Merektha"]],
    callouts: ["На Knot of Snakes собраться.", "Добавочных змей освободить массовым контролем.", "Burrow пересекает арену по прямой."],
  },
  {
    title: "Песчаные всадники", subtitle: "Rider gauntlet", x: 41, y: 39, duration: 118, forces: 13,
    summary: "Сначала уничтожьте ядовитых змей, снимайте Cytotoxin и не ведите группу к следующей лестнице.",
    enemies: [["Sand-Sworn Rider", 3, "high"], ["Poisonous Viper", 3, "high"], ["Shrouded Fang", 2, "medium"]],
    abilities: [["Cytotoxin", "Диспел", "MysticHeals", "Poisonous Viper"], ["Poisoned Cheap Shot", "Кик", "ShadowNova", "Shrouded Fang"]],
    callouts: ["Viper добить следующей.", "Не вести группу к следующей лестнице."],
  },
  {
    title: "Гальванизированный грот", subtitle: "Stormcallers + nimbus", x: 44, y: 25, duration: 126, forces: 14,
    summary: "Снимайте Accumulate Charge и разносите Imbued Conduction. Группу ставьте между опорами, оставляя путь к лучам свободным.",
    enemies: [["Imbued Stormcaller", 3, "high"], ["Agitated Nimbus", 2, "high"]],
    abilities: [["Imbued Conduction", "Диспел", "MysticHeals", "Imbued Stormcaller"], ["Accumulate Charge", "Пурж", "MysticHeals", "Agitated Nimbus"]],
    callouts: ["Accumulate Charge снять сразу.", "Conduction разнести.", "Не закрывать путь к шпилям."],
  },
  {
    title: "Galvazzt", subtitle: "Босс 3", x: 43, y: 15, kind: "boss", duration: 188,
    summary: "Игроки по очереди перекрывают Lightning Spire. После нескольких уровней смените принимающего луч, а босса уводите из Induction.",
    enemies: [["Galvazzt", 1, "boss"], ["Lightning Spire", 4, "high"]],
    abilities: [["Lightning Spire", "Защита", "Цели механики", "Galvazzt"], ["Induction", "Уклонение", "ArcanistVexis", "Galvazzt"], ["Galvanize", "Защита", "Вся группа", "Galvazzt"]],
    callouts: ["Назначить порядок перекрытия лучей.", "Меняться после нескольких уровней.", "Босса уводить из Induction."],
  },
  {
    title: "Око Сетралисс", subtitle: "Escort the eye", x: 55, y: 38, duration: 104, forces: 14,
    summary: "Око следует за группой после победы над Temple Disruptor. Контролируйте канал Essence Disruption и не бросайте объект далеко позади.",
    enemies: [["Temple Disruptor", 2, "high"], ["Faithless Subjugator", 2, "high"], ["Poisonous Viper", 3, "medium"]],
    abilities: [["Essence Disruption", "Стоп", "Ironclad", "Temple Disruptor"], ["Addle Mind", "Кик", "ShadowNova", "Faithless Subjugator"], ["Cytotoxin", "Диспел", "MysticHeals", "Poisonous Viper"]],
    callouts: ["Disruptor контролируется до завершения Ока.", "Не уходить далеко от объекта.", "Addle Mind прерывать."],
  },
  {
    title: "Вестибюль неверных", subtitle: "Hexxers + disruptors", x: 65, y: 55, duration: 126, forces: 16,
    summary: "Flame Shock и Essence Disruption распределяются между игроками. Завершите активацию Ока до следующей группы.",
    enemies: [["Twisted Hexxer", 3, "high"], ["Temple Disruptor", 2, "high"]],
    abilities: [["Flame Shock", "Кик", "Ротация киков", "Twisted Hexxer"], ["Essence Disruption", "Стоп", "Ironclad", "Temple Disruptor"]],
    callouts: ["Око активировать до следующего боя.", "Flame Shock — два назначения.", "Disruptor контролировать."],
  },
  {
    title: "Стражи аватара", subtitle: "Final temple guards", x: 73, y: 67, duration: 138, forces: 20,
    summary: "Последняя группа требует массового контроля и сильной защиты. Flame Shock прерывается, а Corrupted Lifeforce оставляется для следующей фазы.",
    enemies: [["Twisted Hexxer", 3, "high"], ["Temple Disruptor", 2, "medium"]],
    abilities: [["Flame Shock", "Кик", "Ротация киков", "Twisted Hexxer"], ["Essence Disruption", "Стоп", "Ironclad", "Temple Disruptor"]],
    callouts: ["Массовый контроль после сбора.", "После боя должно быть 100%.", "Перед аватаром восстановить ресурсы."],
  },
  {
    title: "Avatar of Sethraliss", subtitle: "Финальный босс", x: 78, y: 78, kind: "boss", duration: 208, bloodlust: true,
    summary: "Атакующие закрывают Corrupted Lifeforce, Latent Hex раскладывается у края. Быстро уничтожайте Faithless Tormentor, не исцеляя босса под Defiling Taint.",
    enemies: [["Avatar of Sethraliss", 1, "boss"], ["Faithless Tormentor", 5, "high"], ["Heart Guardian", 1, "high"]],
    abilities: [["Corrupted Lifeforce", "Защита", "Все DPS", "Avatar of Sethraliss"], ["Latent Hex", "Уклонение", "Цели механики", "Avatar of Sethraliss"], ["Defiling Taint", "Кик", "Ротация киков", "Faithless Tormentor"]],
    callouts: ["Фиолетовые зоны закрывают атакующие.", "Не лечить босса под Defiling Taint."],
  },
]);

export const dungeonRoutes: Record<DungeonSlug, DungeonRoute> = {
  "ruby-life-pools": {
    slug: "ruby-life-pools", name: "Ruby Life Pools", nameRu: "Омуты Рубиновой Жизни", location: "Драконьи острова", timerSeconds: 28 * 60,
    mapImage: "/assets/wow/maps/ruby-life-pools-floor-1.png", backdropImage: "/assets/wow/mythic/ruby-depth-v3-light-fast.webp", floors: [{ id: 1, label: "Нижний" }, { id: 2, label: "Верхний" }], accent: "#d25f32",
    description: "Победите трёх боссов, наберите 100% сил противника и завершите маршрут до истечения таймера.",
    guideUrl: "https://www.wowhead.com/guide/midnight/ruby-life-pools-dungeon-overview-mythic-plus", mdtRouteUrl: "https://wago.io/IEtQSuWgA", stops: rubyLifePoolsStops,
  },
  "altar-of-fangs": {
    slug: "altar-of-fangs", name: "Altar of Fangs", nameRu: "Алтарь Клыков", location: "Извилистый остров", timerSeconds: 29 * 60,
    mapImage: "/assets/wow/maps/altar.webp", backdropImage: "/assets/wow/mythic/backgrounds/altar.webp", floors: [{ id: 1, label: "Алтарь" }], accent: "#75b855", description: "Пройдите ритуальные залы, остановите мутации и сорвите финальный ритуал Зул'джана.",
    guideUrl: "https://www.wowhead.com/guide/midnight/altar-of-fangs-dungeon-overview-location-rewards", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/altar-of-fangs", stops: altarOfFangs,
  },
  "murder-row": {
    slug: "murder-row", name: "Murder Row", nameRu: "Переулок Убийц", location: "Луносвет", timerSeconds: 34 * 60,
    mapImage: "/assets/wow/maps/murder.webp", backdropImage: "/assets/wow/mythic/backgrounds/murder.webp", floors: [{ id: 1, label: "Переулок" }], accent: "#c044d8", description: "Зачистите подпольный квартал Луносвета и остановите ритуал Литиэль Пепельной Ярости.",
    guideUrl: "https://www.wowhead.com/guide/midnight/murder-row-dungeon-overview-location-rewards", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/murder-row", stops: murderRow,
  },
  "den-of-nalorakk": {
    slug: "den-of-nalorakk", name: "Den of Nalorakk", nameRu: "Логово Налоракка", location: "Зул'Аман", timerSeconds: 32 * 60,
    mapImage: "/assets/wow/maps/nalorakk.webp", backdropImage: "/assets/wow/mythic/backgrounds/nalorakk.webp", floors: [{ id: 1, label: "Сон" }], accent: "#69a9c7", description: "Соберите припасы, переживите вечную зиму и докажите силу перед лоа войны.",
    guideUrl: "https://www.wowhead.com/guide/midnight/den-of-nalorakk-dungeon-overview-location-rewards", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/den-of-nalorakk", stops: denOfNalorakk,
  },
  "the-blinding-vale": {
    slug: "the-blinding-vale", name: "The Blinding Vale", nameRu: "Ослепляющая долина", location: "Харандар", timerSeconds: 31 * 60,
    mapImage: "/assets/wow/maps/blinding.webp", backdropImage: "/assets/wow/mythic/backgrounds/blinding.webp", floors: [{ id: 1, label: "Долина" }], accent: "#8ccf5a", description: "Проложите безопасный путь через Светоцвет и очистите долину от искажённых хранителей.",
    guideUrl: "https://www.wowhead.com/guide/midnight/the-blinding-vale-dungeon-overview-location-rewards", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/the-blinding-vale", stops: blindingVale,
  },
  "voidscar-arena": {
    slug: "voidscar-arena", name: "Voidscar Arena", nameRu: "Арена Шрама Бездны", location: "Буря Бездны", timerSeconds: 30 * 60,
    mapImage: "/assets/wow/maps/voidscar.webp", backdropImage: "/assets/wow/mythic/backgrounds/voidscar.webp", floors: [{ id: 1, label: "Арена" }], accent: "#8d67dc", description: "Выберите усиление, победите чемпионов арены и подчините гравитацию в финальном бою.",
    guideUrl: "https://www.wowhead.com/guide/midnight/voidscar-arena-dungeon-overview-location-rewards", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/voidscar-arena", stops: voidscarArena,
  },
  "kings-rest": {
    slug: "kings-rest", name: "Kings' Rest", nameRu: "Гробница королей", location: "Зулдазар", timerSeconds: 33 * 60,
    mapImage: "/assets/wow/maps/kings.webp", backdropImage: "/assets/wow/mythic/backgrounds/kings.webp", floors: [{ id: 1, label: "Гробница" }], accent: "#d6aa4e", description: "Пройдите королевские залы, уничтожьте тени Зула и бросьте вызов первому королю.",
    guideUrl: "https://www.wowhead.com/guide/midnight/kings-rest-dungeon-overview-mythic-plus", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/kings-rest", stops: kingsRest,
  },
  "temple-of-sethraliss": {
    slug: "temple-of-sethraliss", name: "Temple of Sethraliss", nameRu: "Храм Сетралисс", location: "Вол'дун", timerSeconds: 33 * 60,
    mapImage: "/assets/wow/maps/temple.webp", backdropImage: "/assets/wow/mythic/backgrounds/temple.webp", floors: [{ id: 1, label: "Храм" }], accent: "#55b9ce", description: "Верните Око Сетралисс, очистите храм и восстановите силы павшего аватара.",
    guideUrl: "https://www.wowhead.com/guide/midnight/temple-of-sethraliss-dungeon-overview-mythic-plus", mdtRouteUrl: "https://keystone.guru/routes/midnight-season-2/temple-of-sethraliss", stops: templeOfSethraliss,
  },
};

export function getDungeonRoute(slug?: string): DungeonRoute | undefined {
  if (!slug) return dungeonRoutes["ruby-life-pools"];
  return dungeonRoutes[slug as DungeonSlug];
}

export function getDungeonSelectorOptions(): DungeonSelectorOption[] {
  return dungeonSlugs.map((slug) => {
    const { name, nameRu, location, backdropImage } = dungeonRoutes[slug];
    return { slug, name, nameRu, location, backdropImage };
  });
}
