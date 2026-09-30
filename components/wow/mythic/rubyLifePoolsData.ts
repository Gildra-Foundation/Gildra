export type RouteEnemy = {
  name: string;
  count: number;
  priority: "low" | "medium" | "high" | "boss";
};

export type RouteAbility = {
  name: string;
  action: "Кик" | "Стоп" | "Диспел" | "Пурж" | "Уклонение" | "Защита" | "Фокус";
  target: string;
  source?: string;
};

export type RouteStop = {
  id: number;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  floor: number;
  kind: "pull" | "miniboss" | "boss" | "transition";
  duration: number;
  forces: number;
  cumulative: number;
  bloodlust?: boolean;
  summary: string;
  enemies: RouteEnemy[];
  abilities: RouteAbility[];
  callouts: string[];
  tank: string;
  healer: string;
  dps: string;
};

export const initialStops: RouteStop[] = [
  {
    id: 1, title: "Входной пак", subtitle: "Chillweaver + whelps", x: 48, y: 89, floor: 1, kind: "pull", duration: 65, forces: 7.2, cumulative: 7.2,
    summary: "Безопасный старт: соберите мобов у входа, но не ведите их через яйца — лишние Infused Whelp быстро перегружают танка стаками холода.",
    enemies: [{ name: "Flashfrost Chillweaver", count: 2, priority: "high" }, { name: "Infused Whelp", count: 4, priority: "medium" }],
    abilities: [{ name: "Ice Shield", action: "Кик", target: "ShadowNova" }, { name: "Cold Claws", action: "Диспел", target: "MysticHeals" }, { name: "Frostbolt", action: "Кик", target: "Windborne" }],
    callouts: ["Не наступайте на кладки яиц.", "Первый Ice Shield — маг, второй — охотник.", "Снять Cold Claws до 20 стаков."],
    tank: "Соберите мобов лицом от группы и не пересекайте яйца.", healer: "Следите за Cold Claws на танке и снимайте до заморозки.", dps: "Ice Shield важнее Frostbolt; не будите дополнительные яйца.",
  },
  {
    id: 2, title: "Зал инкубации", subtitle: "Earthshaper + Guardian", x: 36, y: 78, floor: 1, kind: "pull", duration: 75, forces: 8.6, cumulative: 15.8,
    summary: "Плотный пак в западной части зала. Земляные удары и персональный дебафф могут совпасть, поэтому не растягивайте бой.",
    enemies: [{ name: "Deepstone Earthshaper", count: 2, priority: "high" }, { name: "Earthbound Guardian", count: 1, priority: "high" }],
    abilities: [{ name: "Tectonic Strike", action: "Защита", target: "ArcanistVexis" }, { name: "Earthbound's Imprint", action: "Защита", target: "Цель дебаффа" }, { name: "Stone Missile", action: "Кик", target: "Ironclad" }],
    callouts: ["Разойтись перед Tectonic Slam.", "Игрок с Imprint использует личную защиту.", "Не уводить Guardian из cleave."],
    tank: "Не принимайте два Tectonic Strike без активной защиты.", healer: "Поднимайте цель Earthbound's Imprint до следующего удара.", dps: "Фокус Earthshaper, свободные кики — в Stone Missile.",
  },
  {
    id: 3, title: "Двойной Juggernaut", subtitle: "Опасный большой пулл", x: 43, y: 69, floor: 1, kind: "pull", duration: 80, forces: 8.4, cumulative: 24.2, bloodlust: true,
    summary: "Самый тяжёлый треш первого этажа. Стакайте пак для массового контроля, но держите групповые защиты на Excavating Blast.",
    enemies: [{ name: "Primal Juggernaut", count: 2, priority: "high" }, { name: "Flashfrost Chillweaver", count: 1, priority: "high" }, { name: "Infused Whelp", count: 3, priority: "medium" }],
    abilities: [{ name: "Excavating Blast", action: "Защита", target: "Вся группа" }, { name: "Crushing Smash", action: "Защита", target: "ArcanistVexis" }, { name: "Ice Shield", action: "Кик", target: "ShadowNova" }],
    callouts: ["Bloodlust после сбора паков.", "Не стойте в кругах Excavating Blast.", "Танк чередует mitigation на Smash."],
    tank: "Соберите обоих Juggernaut и не двигайте их без необходимости.", healer: "Групповой CD на второй Excavating Blast.", dps: "Используйте массовый контроль до Bloodlust и быстро убейте Chillweaver.",
  },
  {
    id: 4, title: "Defier Draghar", subtitle: "Обязательный мини-босс", x: 57, y: 62, floor: 1, kind: "miniboss", duration: 90, forces: 7, cumulative: 31.2,
    summary: "Обязательный страж перед Мелидруссой. Стойте у стены, чтобы коротко забайтить Blazing Rush, и не пересекайте расплавленные осколки.",
    enemies: [{ name: "Defier Draghar", count: 1, priority: "boss" }],
    abilities: [{ name: "Steel Barrage", action: "Защита", target: "ArcanistVexis" }, { name: "Blazing Rush", action: "Уклонение", target: "Случайная цель" }, { name: "Molten Steel", action: "Уклонение", target: "Вся группа" }],
    callouts: ["Стак у стены для короткого Rush.", "Сильный танковый CD на Steel Barrage.", "Не пересекайте осколки Molten Steel."],
    tank: "Большая защита на весь канал Steel Barrage.", healer: "Steel Barrage наносит урон и танку, и группе — лечите заранее.", dps: "Стойте у стены, затем шагните в сторону от линии Blazing Rush.",
  },
  {
    id: 5, title: "Мелидрусса Хладообраз", subtitle: "Босс 1", x: 50, y: 54, floor: 1, kind: "boss", duration: 150, forces: 0, cumulative: 31.2,
    summary: "Складывайте Hailbomb у края и двигайтесь по комнате одним направлением. На 66% и 33% разбивайте Ice Bulwark и убивайте whelps.",
    enemies: [{ name: "Melidrussa Chillworn", count: 1, priority: "boss" }, { name: "Infused Whelp", count: 8, priority: "high" }],
    abilities: [{ name: "Frigid Shard", action: "Кик", target: "Ротация киков" }, { name: "Chillstorm", action: "Уклонение", target: "Цель механики" }, { name: "Frost Overload", action: "Фокус", target: "Вся группа" }, { name: "Cold Claws", action: "Диспел", target: "MysticHeals" }],
    callouts: ["Hailbomb складывать у края.", "Цель Chillstorm выходит из группы.", "На 66%/33% весь урон в щит."],
    tank: "Подберите whelps и поставьте их в босса для cleave.", healer: "Планируйте CD на Chillstorm и каждый Frost Overload.", dps: "Сохраните burst на Ice Bulwark; Frigid Shard кикается по ротации.",
  },
  {
    id: 6, title: "Перелёт на Ruby Overlook", subtitle: "Radiant Drake · переход", x: 56, y: 47, floor: 1, kind: "transition", duration: 30, forces: 0, cumulative: 31.2,
    summary: "После босса активируйте Radiant Drake и перелетите на верхнюю площадку. Во время перехода обновите метки и назначение киков.",
    enemies: [], abilities: [], callouts: ["Все пять игроков садятся на дракона.", "Обновить метки Skull/Cross.", "Следующий пак начинаем после готовности хила."],
    tank: "Проверьте готовность группы перед следующим паком.", healer: "Восстановите ману до приземления.", dps: "Не начинайте верхний пак раньше танка.",
  },
  {
    id: 7, title: "Первый Destroyer", subtitle: "Cinderweaver + Scorchlings", x: 68, y: 43, floor: 2, kind: "pull", duration: 95, forces: 10.4, cumulative: 41.6,
    summary: "Первый из четырёх обязательных Destroyer. Уведите Living Bomb из группы и заранее отойдите перед взрывом Burnout.",
    enemies: [{ name: "Blazebound Destroyer", count: 1, priority: "high" }, { name: "Primalist Cinderweaver", count: 2, priority: "high" }, { name: "Scorchling", count: 5, priority: "low" }],
    abilities: [{ name: "Inferno", action: "Защита", target: "Вся группа" }, { name: "Fiery Blast", action: "Кик", target: "ShadowNova" }, { name: "Cinderbolt", action: "Кик", target: "Windborne" }, { name: "Burnout", action: "Уклонение", target: "Мили" }],
    callouts: ["Living Bomb вынести в сторону.", "Защиты на Inferno.", "На смерти Destroyer отойти на 20 ярдов."],
    tank: "Держите Destroyer неподвижно и приготовьтесь к Fiery Blast.", healer: "Поднимите группу до Inferno и его последующего DoT.", dps: "Кикайте Cinderbolt; все выходят из Burnout.",
  },
  {
    id: 8, title: "Thunderhead", subtitle: "Лейтенант + второй Destroyer", x: 78, y: 34, floor: 2, kind: "miniboss", duration: 100, forces: 11.2, cumulative: 52.8,
    summary: "Разверните дракона от группы. Rolling Thunder снимается по одному: ранний двойной диспел создаст смертельное наложение урона.",
    enemies: [{ name: "Thunderhead", count: 1, priority: "boss" }, { name: "Blazebound Destroyer", count: 1, priority: "high" }, { name: "Scorchling", count: 3, priority: "low" }],
    abilities: [{ name: "Storm Breath", action: "Уклонение", target: "Вся группа" }, { name: "Thunder Jaw", action: "Защита", target: "ArcanistVexis" }, { name: "Rolling Thunder", action: "Диспел", target: "MysticHeals" }, { name: "Inferno", action: "Защита", target: "Вся группа" }],
    callouts: ["Thunderhead всегда лицом от группы.", "Один Rolling Thunder диспелим, второй ждём.", "Не совместить Inferno и двойной взрыв."],
    tank: "Mitigation на Thunder Jaw и не направляйте Storm Breath в группу.", healer: "Разнесите два Rolling Thunder по времени.", dps: "Приоритет Destroyer, затем Thunderhead; берегите личные защиты.",
  },
  {
    id: 9, title: "Flamegullet", subtitle: "Лейтенант + Flamelasher", x: 68, y: 26, floor: 2, kind: "miniboss", duration: 95, forces: 10, cumulative: 62.8,
    summary: "Сохраните урон на 50% здоровья Flamegullet: Molten Blood быстро наращивает урон по группе. Flaming Barrage у Ashseer Flamelasher останавливается контролем.",
    enemies: [{ name: "Flamegullet", count: 1, priority: "boss" }, { name: "Ashseer Flamelasher", count: 1, priority: "high" }, { name: "Scorchling", count: 4, priority: "low" }],
    abilities: [{ name: "Flame Breath", action: "Уклонение", target: "Вся группа" }, { name: "Fire Maw", action: "Защита", target: "ArcanistVexis" }, { name: "Molten Blood", action: "Фокус", target: "Вся группа" }, { name: "Flaming Barrage", action: "Стоп", target: "Ironclad" }, { name: "Blaze of Glory", action: "Пурж", target: "MysticHeals" }],
    callouts: ["Стоп Flaming Barrage и пурж Blaze of Glory.", "На 50% все cooldowns в Flamegullet.", "Не стойте перед драконом."],
    tank: "Сильная защита на Fire Maw, разворачивайте Flame Breath.", healer: "На Molten Blood используйте заранее назначенный групповой CD; снимайте Blaze of Glory.", dps: "Не тратьте burst до 50%; Flaming Barrage остановите контролем.",
  },
  {
    id: 10, title: "Огненное кольцо", subtitle: "Destroyer 3–4", x: 54, y: 35, floor: 2, kind: "pull", duration: 90, forces: 11.6, cumulative: 74.4,
    summary: "Закройте двух оставшихся Destroyer отдельными волнами. Следите за Burnout и не стойте в Blaze of Glory после смерти Flamelasher.",
    enemies: [{ name: "Blazebound Destroyer", count: 2, priority: "high" }, { name: "Ashseer Flamelasher", count: 2, priority: "high" }, { name: "Scorchling", count: 6, priority: "low" }],
    abilities: [{ name: "Fiery Blast", action: "Кик", target: "Ротация киков" }, { name: "Flaming Barrage", action: "Стоп", target: "Ironclad" }, { name: "Blaze of Glory", action: "Пурж", target: "MysticHeals" }, { name: "Burnout", action: "Уклонение", target: "Вся группа" }],
    callouts: ["Не активировать обоих Destroyer одновременно.", "Пурж Blaze of Glory.", "После каждой смерти выйти из Burnout."],
    tank: "Держите вторую группу вне боя, пока первый Destroyer не умер.", healer: "Разнесите cooldowns на два Inferno.", dps: "Кик Fiery Blast и stop Flaming Barrage; не оставайтесь в melee на смерти.",
  },
  {
    id: 11, title: "Кокия Огненное Копыто", subtitle: "Босс 2", x: 44, y: 39, floor: 2, kind: "boss", duration: 175, forces: 0, cumulative: 74.4, bloodlust: true,
    summary: "Ведите босса по свободному краю площадки. Адда из Ritual of Blazebinding ставьте рядом с Кокией, быстро убивайте и выходите из Burnout.",
    enemies: [{ name: "Kokia Blazehoof", count: 1, priority: "boss" }, { name: "Blazebound Firestorm", count: 3, priority: "high" }],
    abilities: [{ name: "Ritual of Blazebinding", action: "Уклонение", target: "Цель механики" }, { name: "Blaze Volley", action: "Кик", target: "Ротация киков" }, { name: "Molten Boulder", action: "Уклонение", target: "Вся группа" }, { name: "Searing Blows", action: "Защита", target: "ArcanistVexis" }],
    callouts: ["Bloodlust на старте.", "Адд появляется рядом с боссом.", "Blaze Volley всегда кикается; после смерти адда разойтись."],
    tank: "Подведите босса к Firestorm для cleave, mitigation на Searing Blows.", healer: "Групповой CD на Inferno от каждого Firestorm.", dps: "Немедленно переключайтесь в адда и уходите от Burnout.",
  },
  {
    id: 12, title: "Спуск к храму", subtitle: "Storm Warrior pack", x: 37, y: 29, floor: 2, kind: "pull", duration: 75, forces: 8.5, cumulative: 82.9,
    summary: "На лестнице мили отходят от Thunderous Stomp, а ranged держатся ближе, чтобы не растягивать пак и не зацепить следующую группу.",
    enemies: [{ name: "Storm Warrior", count: 3, priority: "high" }, { name: "Flame Channeler", count: 1, priority: "high" }],
    abilities: [{ name: "Thunderous Stomp", action: "Уклонение", target: "Мили" }, { name: "Flashfire", action: "Кик", target: "ShadowNova" }, { name: "Thunder Stomper", action: "Стоп", target: "Windborne" }],
    callouts: ["Мили выходят на Thunderous Stomp.", "Первый кик Flashfire — маг.", "Не отбрасывать мобов вниз по лестнице."],
    tank: "Соберите пак у внутренней стены лестницы.", healer: "Следите за игроками, которые остались в Thunderous Stomp.", dps: "Flashfire — главный кик, Thunderous Stomp избегается движением.",
  },
  {
    id: 13, title: "Штормовые каналы", subtitle: "Channeler + Thundercloud", x: 42, y: 20, floor: 2, kind: "pull", duration: 80, forces: 8.2, cumulative: 91.1,
    summary: "Пуржите Stormcloud Barrier с призванного Thundercloud и разносите групповые защиты на Lightning Storm.",
    enemies: [{ name: "Tempest Channeler", count: 2, priority: "high" }, { name: "Primal Thundercloud", count: 2, priority: "high" }, { name: "Storm Warrior", count: 2, priority: "medium" }],
    abilities: [{ name: "Thunder Blast", action: "Кик", target: "Ротация киков" }, { name: "Lightning Storm", action: "Защита", target: "Вся группа" }, { name: "Stormcloud Barrier", action: "Пурж", target: "MysticHeals" }],
    callouts: ["Кики по меткам Skull/Cross.", "Пурж Stormcloud Barrier сразу.", "Личные защиты на Lightning Storm."],
    tank: "Заберите призванный Thundercloud сразу после появления.", healer: "Пуржите Barrier и готовьте лечение к Lightning Storm.", dps: "Не дублируйте кики; быстро переключайтесь в Thundercloud.",
  },
  {
    id: 14, title: "High Channeler Ryvati", subtitle: "Финальный мини-босс", x: 55, y: 16, floor: 2, kind: "miniboss", duration: 95, forces: 8.9, cumulative: 100,
    summary: "Последние проценты маршрута. Shock Blast нельзя пропускать, Tempest Stormshield ломается сразу, а призванный Thundercloud забирает танк.",
    enemies: [{ name: "High Channeler Ryvati", count: 1, priority: "boss" }, { name: "Primal Thundercloud", count: 2, priority: "high" }],
    abilities: [{ name: "Shock Blast", action: "Кик", target: "Ротация киков" }, { name: "Lightning Storm", action: "Защита", target: "Вся группа" }, { name: "Tempest Stormshield", action: "Фокус", target: "Все DPS" }, { name: "Stormcloud Barrier", action: "Пурж", target: "MysticHeals" }],
    callouts: ["Shock Blast — кик любой ценой.", "Щит ломаем сразу.", "После смерти должно быть ровно 100%."],
    tank: "Сразу подберите Thundercloud после Summon.", healer: "Групповой CD на Lightning Storm, purge Barrier.", dps: "Сохраните урон для Tempest Stormshield и не пропустите Shock Blast.",
  },
  {
    id: 15, title: "Киракка и Эркхарт", subtitle: "Финальный босс", x: 68, y: 13, floor: 2, kind: "boss", duration: 180, forces: 0, cumulative: 100,
    summary: "Приоритет — Киракка. Inferno Spit выносите к краю, прекращайте касты перед Interrupting Cloudburst и быстро снимайте Stormslam с танка.",
    enemies: [{ name: "Kyrakka", count: 1, priority: "boss" }, { name: "Erkhart Stormvein", count: 1, priority: "boss" }],
    abilities: [{ name: "Roaring Firebreath", action: "Уклонение", target: "Вся группа" }, { name: "Interrupting Cloudburst", action: "Стоп", target: "Все кастеры" }, { name: "Inferno Spit", action: "Уклонение", target: "Цель механики" }, { name: "Stormslam", action: "Диспел", target: "MysticHeals" }, { name: "Winds of Change", action: "Защита", target: "Вся группа" }],
    callouts: ["Весь доступный урон в Киракку.", "Inferno Spit складывать у края.", "Прекратить касты перед Cloudburst.", "Stormslam диспелить сразу."],
    tank: "Подводите Эркхарта к Киракке для cleave, прожимайтесь под Stormslam.", healer: "Снимайте Stormslam сразу и держите CD на вторую фазу.", dps: "Приоритет Киракка; остановите касты перед Cloudburst.",
  },
];

export const mdtRouteUrl = "https://wago.io/IEtQSuWgA";
export const currentGuideUrl = "https://www.wowhead.com/guide/midnight/ruby-life-pools-dungeon-overview-mythic-plus";
