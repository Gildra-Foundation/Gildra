import type { Boss, Loot, Mechanic } from "@/lib/lairs";

const altarArt = "/assets/wow/mythic/backgrounds/altar.webp";
const altarMap = "/assets/wow/maps/altar.webp";
const coiledArt = "/assets/wow/mythic/backgrounds/altar.webp";
const coiledMap = "/assets/wow/maps/altar.webp";
const spell = (name: string) => `/assets/wow/mythic/spells/${name}.webp`;
const npc = (name: string) => `/assets/wow/mythic/npcs/season-two/${name}.webp`;

const dungeonLoot: Loot[] = [
  { name: "Midnight dungeon gear", slot: "Любой", armor: "По специализации", stats: "Сезонные характеристики", priority: "Высокий" },
  { name: "Hero-track Great Vault reward", slot: "Хранилище", armor: "По специализации", stats: "Зависит от ключа", priority: "Лучший выбор" },
  { name: "Valorstone & Crests", slot: "Улучшение", armor: "Валюта", stats: "Улучшение экипировки", priority: "Высокий" },
];

const delveLoot: Loot[] = [
  { name: "Delver’s Bounty reward", slot: "Любой", armor: "По специализации", stats: "Сезонная экипировка", priority: "Высокий" },
  { name: "Great Vault — Delves", slot: "Хранилище", armor: "По специализации", stats: "Зависит от уровня", priority: "Лучший выбор" },
  { name: "Undercoin & seasonal currency", slot: "Валюта", armor: "Универсальный", stats: "Покупки и улучшения", priority: "Средний" },
];

const dungeonBase = {
  kind: "dungeon" as const,
  zone: "The Coiled Isle · Altar of Fangs",
  image: altarArt,
  portrait: altarArt,
  map: altarMap,
  accent: "#65c7a4",
  reset: "Без локаута · Mythic+ по ключу",
  composition: { tanks: "1", healers: "1", dps: "3", size: "5" },
  farm: { waypoint: "/way #2509 47.2 67.6 Altar of Fangs Entrance", access: "Heroic, Mythic и Mythic+; вход в Vaults of Atal’Utek", lockout: "Mythic+ можно повторять без ограничения", best: "Mythic+ и Great Vault" },
  difficulties: [
    { name: "Heroic", group: "1 / 1 / 3", reward: "Veteran", note: "Знакомство с маршрутами и механиками" },
    { name: "Mythic", group: "1 / 1 / 3", reward: "Champion", note: "Полный набор механик боссов" },
    { name: "Mythic+", group: "1 / 1 / 3", reward: "Hero / Vault", note: "29-минутный таймер и сезонные модификаторы" },
  ],
  loot: dungeonLoot,
};

const delveBase = {
  kind: "delve" as const,
  zone: "The Coiled Isle",
  image: coiledArt,
  portrait: coiledArt,
  map: coiledMap,
  accent: "#a581d8",
  reset: "Сколько угодно прохождений · награда по ключам",
  composition: { tanks: "0–1", healers: "0–1", dps: "1–5", size: "1–5" },
  farm: { waypoint: "", access: "Соло или группа до 5 игроков с NPC-компаньоном", lockout: "Повторяемо; Bountiful-награда расходует ключ", best: "Tier 8+ и Great Vault" },
  difficulties: [
    { name: "Tier 1–3", group: "1–5", reward: "Обучение", note: "Базовый набор механик" },
    { name: "Tier 4–7", group: "1–5", reward: "Veteran", note: "Растут здоровье, урон и цена ошибки" },
    { name: "Tier 8–11", group: "1–5", reward: "Champion / Vault", note: "Основной еженедельный фарм" },
  ],
  loot: delveLoot,
};

const m = (mechanics: Mechanic[]) => mechanics;

export const seasonGuideBosses: Boss[] = [
  {
    ...dungeonBase,
    slug: "ravi", name: "Rav’i", title: "Хозяин Carnage Pit", coordinates: "Этаж 1 · 48.8, 79.2", badgeIcon: npc("rav-i-259445"),
    flavor: "На алтаре Кровавого Бога слабость — лишь ещё один повод для пира.",
    summary: "Первый босс Altar of Fangs: держите дистанцию от Stomp, снимайте Regurgitate и ломайте защиту, пока Rav’i пожирает добычу.",
    mechanics: m([
      { name: "Ravenous Stomp", role: "Все", tone: "danger", action: "DODGE", icon: spell("ravenous-stomp-1310413"), description: "Удар создаёт расходящуюся волну физического урона.", response: "Отойдите от босса и пройдите между опасными секторами." },
      { name: "Triple Shot", role: "Все", tone: "danger", action: "RUN", icon: spell("triple-shot-1307573"), description: "Три последовательных выстрела по отмеченной цели создают опасную линию.", response: "Цель уходит в сторону; остальные не пересекают траекторию и прожимают защиту." },
      { name: "Regurgitate", role: "Хилы", tone: "control", action: "DISPEL", icon: spell("regurgitate-1304491"), description: "Сильный ядовитый эффект быстро добивает цель без лечения.", response: "Снимайте яд сразу и поднимайте здоровье цели до следующего события." },
      { name: "Ssscavenging", role: "DPS", tone: "control", action: "KILL", icon: spell("devour-1302629"), description: "Rav’i пожирает сферу и получает защитный эффект.", response: "Ломайте щит всем уроном; сохраните бурст на этот каст." },
    ]),
  },
  {
    ...dungeonBase,
    slug: "the-writhing-coil", name: "The Writhing Coil", title: "Живая мутация", coordinates: "Этаж 2 · 69.7, 51.7", badgeIcon: npc("the-writhing-coil-259446"), accent: "#77d27b",
    flavor: "Змея, собранная из змей, помнит голод каждой из своих голов.",
    summary: "Бой на прерывания и пространство: Toxic Atrophy нельзя пропускать, а после Death Rattle нужно немедленно покинуть опасную зону.",
    mechanics: m([
      { name: "Toxic Atrophy", role: "DPS", tone: "control", action: "INTERRUPT", icon: spell("toxic-atrophy-1310974"), description: "Серия из трёх опасных ядовитых кастов по группе.", response: "Заранее назначьте три прерывания и не тратьте их на второстепенные заклинания." },
      { name: "Burrowing Charge", role: "Все", tone: "danger", action: "DODGE", icon: spell("burrowing-charge-1300083"), description: "Босс зарывается и атакует по прямой линии.", response: "Сместитесь перпендикулярно линии рывка, не ведите её через группу." },
      { name: "Death Rattle", role: "Все", tone: "danger", action: "RUN", icon: spell("death-rattle-1299080"), description: "Смертельная область быстро заполняет пространство вокруг босса.", response: "Сразу выбегайте на край и держите способности мобильности на этот момент." },
      { name: "Uncoil", role: "DPS", tone: "tank", action: "KILL", icon: spell("uncoil-1287811"), description: "Босс разделяется, создавая дополнительные цели и давление на группу.", response: "Соберите аддов, контрольте и убейте их через cleave до следующего Atrophy." },
    ]),
  },
  {
    ...dungeonBase,
    slug: "zuljan", name: "Zul’jan", title: "Верховный жрец клыка", coordinates: "Этаж 3 · 45.9, 17.8", badgeIcon: npc("zul-jan-255717"), accent: "#d0a34c",
    flavor: "Каждый удар топора — часть ритуала. Каждая капля крови — его завершение.",
    summary: "Финал Altar of Fangs: распределяйте soak Ritual of the Fang, очищайте яд физическим ударом и никогда не стойте перед Axegrinder.",
    mechanics: m([
      { name: "Ritual of the Fang", role: "Все", tone: "control", action: "SOAK", icon: spell("ritual-of-the-fang-1301063"), description: "Ритуал требует разделить урон между игроками в отмеченной области.", response: "Соберитесь в круг заранее; не оставляйте отмеченную цель одну." },
      { name: "Ritual Venom", role: "Все", tone: "frost", action: "DISPEL", icon: spell("ritual-venom-1300901"), description: "Яд остаётся на игроке, пока его не заденет физическая атака Boneslicer.", response: "Цель встаёт на траекторию Boneslicer, остальные отходят от линии." },
      { name: "Boneslicer", role: "DPS", tone: "control", action: "DODGE", icon: spell("boneslicer-1301509"), description: "Линейная физическая атака, которую можно использовать для очистки Ritual Venom.", response: "Без яда выйдите из линии; с ядом — осознанно перехватите удар." },
      { name: "Axegrinder", role: "Танки", tone: "tank", action: "TANK", icon: spell("axegrinder-1312846"), description: "Тяжёлая танковая серия и фронтальная опасная зона.", response: "Разверните босса от группы и сохраните активную защиту на комбо." },
    ]),
  },
  {
    ...delveBase,
    slug: "drakta", name: "Drakta", title: "Чемпион Ring of Glory", zone: "The Coiled Isle · The Ring of Glory", coordinates: "Арена чемпионов", badgeIcon: spell("bind-soul-330810"), accent: "#68a8d7",
    flavor: "На этой арене победа принадлежит тому, кто переживёт рёв толпы.",
    summary: "Подвижный чемпион: уводите Soul Cleave из центра и кайтите Drakta во время Roar of the Champion.",
    mechanics: m([
      { name: "Soul Cleave", role: "Все", tone: "danger", action: "DODGE", icon: spell("bind-soul-330810"), description: "Drakta беспорядочно рубит пространство и оставляет опасные зоны.", response: "Кайтите вдоль края, оставляя центр чистым для следующей механики." },
      { name: "Roar of the Champion", role: "Все", tone: "danger", action: "RUN", icon: spell("forceful-roar-1255385"), description: "Рёв резко повышает урон босса и одновременно замедляет его.", response: "Не танкуйте усиление лицом: бегите, замедляйте и возвращайтесь после окончания эффекта." },
    ]),
  },
  {
    ...delveBase,
    slug: "gnok", name: "Gnok", title: "Крушитель арены", zone: "The Coiled Isle · The Ring of Glory", coordinates: "Арена чемпионов", badgeIcon: spell("pulverizing-strikes-1240257"), accent: "#d58a55",
    flavor: "Ему не нужна точность, когда вся арена становится оружием.",
    summary: "Gnok заставляет постоянно менять позицию: выходите из луж после прыжка, переживайте отбрасывание и уклоняйтесь от decay-снарядов.",
    mechanics: m([
      { name: "Upheaval", role: "Все", tone: "danger", action: "DODGE", icon: spell("quaking-leap-1303328"), description: "Босс прыгает к игроку, наносит неизбежный удар и оставляет опасную область.", response: "После приземления сразу выйдите из лужи и не перекрывайте путь отхода." },
      { name: "Pulverize", role: "Все", tone: "control", action: "RUN", icon: spell("pulverizing-strikes-1240257"), description: "Сильное отбрасывание с замедлением.", response: "Стойте так, чтобы вас не отбросило в лужи или дополнительных противников." },
      { name: "Ejecting Decay", role: "Все", tone: "frost", action: "DODGE", icon: spell("defiling-taint-1301202"), description: "Во второй фазе Gnok выпускает серии разлагающихся снарядов.", response: "Двигайтесь через свободные промежутки, не забегая в старые зоны." },
      { name: "Necrotic Upheaval", role: "Все", tone: "danger", action: "RUN", icon: spell("corrupted-lifeforce-1301029"), description: "Оставшиеся области превращаются в новые зоны decay.", response: "Заранее перейдите на чистую половину арены." },
    ]),
  },
  {
    ...delveBase,
    slug: "gralka-snake-eater", name: "Gralka Snake-Eater", title: "Пожирательница змеев", zone: "The Coiled Isle · Gnarldor Isle", coordinates: "Затопленные руины", badgeIcon: spell("a-knot-of-snakes-1290031"), accent: "#78bb5a",
    flavor: "Она становится сильнее с каждым проглоченным змеем — и уязвимее с каждым жадным глотком.",
    summary: "Позвольте Gralka пожирать змей ради окна уязвимости, но уводите её из яда и выбегайте из усиленного Purging Breath.",
    mechanics: m([
      { name: "Snake Eater", role: "DPS", tone: "control", action: "KILL", icon: spell("a-knot-of-snakes-1290031"), description: "Gralka съедает двух змей, оставляет яд и получает +15% входящего урона за каждую.", response: "Уведите её из лужи и отдайте бурст в окно двух стаков уязвимости." },
      { name: "Venomblade Slash", role: "Танки", tone: "tank", action: "TANK", icon: spell("envenom-1307571"), description: "Ядовитый удар усиливается после Snake Eater.", response: "Используйте активную защиту; хилу подготовить внешний сейв на высоких стаках." },
      { name: "Purging Breath", role: "Все", tone: "danger", action: "DODGE", icon: spell("poison-spit-1310116"), description: "Неподвижный конус длится дольше за каждый съеденный стак.", response: "Сразу уйдите за спину и не возвращайтесь до исчезновения конуса." },
    ]),
  },
  {
    ...delveBase,
    slug: "osseous-amalgamation", name: "Osseous Amalgamation", title: "Костяной конструкт", zone: "The Coiled Isle · Gnarldor Isle", coordinates: "Костяные пещеры", badgeIcon: spell("entomb-271569"), accent: "#b7c7d0",
    flavor: "Каждая кость острова — ещё одна деталь его брони.",
    summary: "Ломайте Bone Armor, уходите от Bone Storm и не позволяйте шипам запереть путь для кайта.",
    mechanics: m([
      { name: "Frost Strike", role: "Танки", tone: "tank", action: "TANK", icon: spell("cryo-surge-1239871"), description: "Базовый удар наносит frost-урон и замедляет.", response: "Держите босса у края и оставляйте безопасный маршрут для Bone Storm." },
      { name: "Bone Armor", role: "DPS", tone: "control", action: "KILL", icon: spell("entomb-271569"), description: "Поглощающий щит блокирует прогресс боя.", response: "Сохраните сильные способности и немедленно разбейте щит." },
      { name: "Bone Storm", role: "Все", tone: "danger", action: "RUN", icon: spell("frozen-tempest-1312760"), description: "Тяжёлый постоянный урон по игрокам рядом с боссом.", response: "Кайтите до конца канала, не пытайтесь стоять и размениваться уроном." },
      { name: "Bone Spikes", role: "Все", tone: "danger", action: "DODGE", icon: spell("earthshatter-slam-1270428"), description: "Шипы появляются из земли и оглушают попавших игроков.", response: "Следите за маркерами под ногами и сохраняйте свободную линию отхода." },
    ]),
  },
  {
    ...delveBase,
    slug: "aztarec", name: "Azta’rec", title: "Nemesis of Venomfall", zone: "The Coiled Isle · Venomfall Deeps", coordinates: "51.23, 30.70", badgeIcon: spell("venomous-ascension-1272784"), accent: "#a56fe2",
    flavor: "Он проверяет не урон. Он проверяет, запомнили ли вы порядок собственного спасения.",
    summary: "Сезонный Nemesis: прерывайте Soul Extinction, не пропускайте Void Toxin и решайте memory-интермиссии на 90%, 60% и 30% здоровья.",
    farm: { ...delveBase.farm, waypoint: "/way #2512 51.23 30.70 Venomfall Deeps Entrance", access: "Tier ? после Tier 7 без потери жизни; Tier ?? после Tier 10 без потери жизни", best: "Nemesis achievements, cloak, toy и mount" },
    difficulties: [
      { name: "Tier ?", group: "1–5", reward: "Nemesis cache", note: "Memory-последовательности из 3, 4 и 5 секторов" },
      { name: "Tier ??", group: "1–5", reward: "Mount / Title", note: "Echo на каждой интермиссии; последовательности 5, 6 и 7" },
    ],
    mechanics: m([
      { name: "Noxious Bile", role: "Все", tone: "danger", action: "DODGE", icon: spell("poison-splash-1300351"), description: "Ядовитый конус оставляет долго живущие лужи.", response: "Уводите конус к краю и не загрязняйте центр арены." },
      { name: "Void Toxin", role: "Хилы", tone: "control", action: "INTERRUPT", icon: spell("cytotoxin-1308148"), description: "Прерываемый DoT создаёт постоянное давление на цель.", response: "Сбивайте каст; если прошёл — немедленно снимите яд и поднимите цель." },
      { name: "Soul Extinction", role: "Все", tone: "danger", action: "INTERRUPT", icon: spell("bind-soul-330810"), description: "Смертельный канал, который нельзя позволить завершить.", response: "Это абсолютный приоритет прерывания; всегда держите один kick в резерве." },
      { name: "Venom Storm", role: "Все", tone: "frost", action: "DODGE", icon: spell("venomous-ascension-1272784"), description: "Медленные волны яда пересекают арену.", response: "Смотрите на направление волн и проходите через широкий промежуток." },
      { name: "Serpent’s Strike", role: "Танки", tone: "tank", action: "TANK", icon: spell("piercing-hiss-1294557"), description: "Тяжёлый удар по текущей цели.", response: "Активная защита на каждый удар; не входите в него с низким здоровьем." },
      { name: "Venomous Recollection", role: "Все", tone: "control", action: "RUN", icon: spell("latent-hex-1311982"), description: "На 90%, 60% и 30% безопасные сектора загораются в последовательности.", response: "Запомните порядок и повторите его; на Tier ?? одновременно убивайте Echo." },
    ]),
  },
];
