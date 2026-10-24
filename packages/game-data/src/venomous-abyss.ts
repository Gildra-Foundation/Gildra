import contentManifest from "./content-manifest.json";

export type Lang = "en" | "ru";
export type Difficulty = "normal" | "heroic" | "mythic";
export type LocalText = { en: string; ru: string };
export type ArenaLayout = "split" | "triangle" | "edge" | "lanes" | "platforms" | "center";

export type VerifiedAbilityIdentity = {
  spellId: number;
  name: LocalText;
  description: LocalText | null;
  descriptionVerificationStatus: "verified" | "withheld_unresolved_tokens";
  descriptionSourceKind: "spell_description" | "spell_description_reference" | "spell_description_spell_names" | "spell_description_spell_names_duration" | "spell_description_static_modifier_duration" | "exact_build_unresolved";
  iconId: number;
  iconName: string;
  iconUrl: string;
  iconSourceUrl: string;
  iconSourceKind: "blizzard_api" | "wago_tools";
  iconVerifiedAt: string;
};

export type VerifiedJournalPhaseIdentity = {
  order: number;
  name: LocalText;
  journalSectionId: number;
  phaseKind: "stage" | "intermission";
  sourceUrl: string;
  lastVerifiedAt: string;
};

export type BossGuide = {
  slug: string;
  number: number;
  name: LocalText;
  identityDescription: LocalText;
  encounterId: number;
  journalId: number;
  build: string;
  identitySourceUrl: string;
  identityLastVerifiedAt: string;
  strategyVerificationStatus: "source_tracked";
  journalAbilities: VerifiedAbilityIdentity[];
  journalPhases: VerifiedJournalPhaseIdentity[];
  type: LocalText;
  summary: LocalText;
  pull: LocalText;
  layout: ArenaLayout;
  positioning: LocalText;
  roles: Record<"tank" | "healer" | "dps", LocalText[]>;
  timeline: { marker: string; title: LocalText; detail: LocalText }[];
  difficulty: Record<Difficulty, { headline: LocalText; changes: LocalText[] }>;
  composition: Record<Difficulty, { tanks: number; healers: number; dps: number; note: LocalText }>;
  source: string;
};

type BossStrategyDraft = Omit<
  BossGuide,
  | "name"
  | "identityDescription"
  | "encounterId"
  | "journalId"
  | "build"
  | "identitySourceUrl"
  | "identityLastVerifiedAt"
  | "strategyVerificationStatus"
  | "journalAbilities"
  | "journalPhases"
> & { name: string };

const tx = (en: string, ru: string): LocalText => ({ en, ru });

export const difficulties: Difficulty[] = ["normal", "heroic", "mythic"];

const strategyDrafts: BossStrategyDraft[] = [
  {
    slug: "nekzali-the-soulcoiler",
    number: 1,
    name: "Nek’zali the Soulcoiler",
    type: tx("Two phases · priority adds", "Две фазы · приоритетные цели"),
    summary: tx(
      "Break the Restless Amani shields, keep them out of the Soulcoil Well, then burn Nek’zali before her final energy cycle ends.",
      "Магическим уроном разрушайте щиты духов амани и убивайте их до колодца. На 50% здоровья победите два эха, затем добейте Нек’зали до заполнения энергии.",
    ),
    pull: tx("Bloodlust: start of Phase 2", "Героизм: начало второй фазы"),
    layout: "edge",
    positioning: tx(
      "Walk the boss toward the largest coffin cluster. Drop Essence Rend on the outer wall. On Heroic, gather corpses for Hungering Pyre.",
      "Ведите босса к самому большому скоплению саркофагов. «Essence Rend» выносите к стене. На героической сложности собирайте тела под «Hungering Pyre».",
    ),
    roles: {
      tank: [
        tx("Swap at 5–6 Hollowing Strikes stacks.", "Меняйтесь на 5–6 стаках «Hollowing Strikes»."),
        tx("Move well away from the raid for Possession Barrage; nobody stands between tank and boss.", "На «Possession Barrage» отойдите далеко от рейда; между танком и боссом никто не должен стоять."),
      ],
      healer: [
        tx("Dispel Essence Rend only after its target reaches the wall.", "Снимайте «Essence Rend» только после того, как цель дошла до стены."),
        tx("Commit raid cooldowns to Soulcoil Ignition and late Invoke stacks.", "Распределите защиту рейда между «Soulcoil Ignition» и поздними применениями «Invoke»."),
      ],
      dps: [
        tx("Magic damage breaks Restless Amani shields; cleave them into the active Echo.", "Магическим уроном разрушайте щиты духов амани; собирайте их рядом с активным эхом для одновременного урона."),
        tx("Phase 2 is a hard energy race—save damage for it.", "Вторая фаза — жёсткая гонка энергии: сохраните урон на неё."),
      ],
    },
    timeline: [
      { marker: "P1", title: tx("Coffins awaken", "Пробуждение саркофагов"), detail: tx("Shields, Essence Rend and tank combo.", "Щиты, «Essence Rend» и танковая серия.") },
      { marker: "P1", title: tx("Soulcoil Ignition", "«Soulcoil Ignition»"), detail: tx("Prepare healing for repeated raid hits and dodge impacts. Full energy is an enrage, not a phase transition.", "Подготовьте лечение на серию ударов и уклоняйтесь от падений. Полная энергия вызывает исступление, а не переход фазы.") },
      { marker: "50%", title: tx("Ritual of Awakening", "Ритуал пробуждения"), detail: tx("At 50% health the boss becomes immune. Kill both Echoes, avoid the Soul Transfer beam and share Hungering Pyre. On Heroic, burn corpses before they revive.", "На 50% здоровья босс становится неуязвимым. Убейте оба эха, выйдите из луча Soul Transfer и разделите «Hungering Pyre». На героической сложности сжигайте тела до их оживления.") },
      { marker: "P2", title: tx("Uncoiled race", "Финальная гонка"), detail: tx("Bloodlust, permanent Rite stacks, kill before 100 energy.", "Героизм, постоянные стаки усиления, убийство до 100 энергии.") },
    ],
    difficulty: {
      normal: { headline: tx("Keep adds away from the Well", "Не пускайте духов к колодцу"), changes: [tx("Assign a group to share Hungering Pyre; burn each Echo while controlling new Amani.", "Назначьте группу для разделения урона «Hungering Pyre». Убивайте каждое эхо, удерживая новых духов амани вдали от колодца."), tx("Essence Rend is safe when dispelled at the wall.", "«Essence Rend» безопасно снимать у стены.")] },
      heroic: { headline: tx("Ritual Burn raises the healing check", "Ритуальный ожог повышает нагрузку на лекарей"), changes: [tx("Soulcoil Ignition also applies Ritual Burn.", "«Soulcoil Ignition» также накладывает «Ritual Burn»."), tx("Mobile ranged players use Slithering Flame on stray corpses.", "Мобильные бойцы дальнего боя сжигают отдельные тела с помощью «Slithering Flame».")] },
      mythic: { headline: tx("Three teams rotate through the Well", "Три группы по очереди уходят в колодец"), changes: [tx("Grasping Depths pulls the raid; rotate three teams of four DPS and one healer into Immortal Coil.", "«Grasping Depths» стягивает рейд; три группы из четырёх бойцов и хила по очереди заходят в «Immortal Coil»."), tx("Invoke interrupts casts and silences interrupted players.", "«Invoke» прерывает касты и немит прерванных игроков.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Flexible; bring reliable magic burst.", "Пример состава на 20 игроков. Нужен сильный кратковременный магический урон.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Mobile ranged make corpse cleanup safer.", "Мобильным бойцам дальнего боя удобно поручить сжигание отдельных тел.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Pre-assign three 5-player Well teams.", "Заранее назначьте три группы по 5 человек для колодца.") },
    },
    source: "https://www.method.gg/guides/the-venomous-abyss/nekzali-the-soulcoiler-heroic",
  },
  {
    slug: "entombed-sentinels",
    number: 2,
    name: "Entombed Sentinels",
    type: tx("Two bosses · split raid", "Два босса · разделение рейда"),
    summary: tx("Keep Blood and Breath more than 40 yards apart, balance their health, and solve toxin pairings during each Stasis.", "Разведите стражей более чем на 40 метров и выравнивайте их здоровье. Во время стазиса находите партнёра, чтобы сумма ваших токсинов была равна четырём."),
    pull: tx("Bloodlust: final synchronized burn", "Героизм: финальный синхронный добив"),
    layout: "split",
    positioning: tx("Split into two balanced groups. After each intermission assign each group to the other Sentinel, allowing its previous mark to expire.", "Разделитесь на две равные группы. После каждой переходной фазы переключайтесь на другого стража, чтобы прежняя метка успела исчезнуть."),
    roles: {
      tank: [tx("Keep the bosses 40+ yards apart.", "Держите боссов дальше 40 метров."), tx("Swap Sentinels after each intermission; plan cooldowns for late Empowering Slams.", "После каждого стазиса меняйтесь стражами. Сохраните сильную защиту на последние «Empowering Slam» перед переходом.")],
      healer: [tx("Keep the Blood group near a safe edge so Blighted Blood can be dispelled promptly and any pools remain out of the crossing path.", "Расположите группу Крови у свободного края: быстро снимайте «Blighted Blood» и оставляйте возможные лужи вдали от пути перехода."), tx("Cover the end of each marks cycle and stagger pool drops.", "Закрывайте конец каждого цикла меток и разводите сброс луж.")],
      dps: [tx("Balance both health bars before Vitriolic Stasis.", "Выравнивайте здоровье перед «Vitriolic Stasis»."), tx("Step on Toxic Droplets and hard-swap to Venom Coagulation.", "Наступайте на «Toxic Droplets» и сразу переключайтесь в «Venom Coagulation».")],
    },
    timeline: [
      { marker: "A", title: tx("Split pressure", "Раздельное давление"), detail: tx("Marks ramp while each half handles its Sentinel.", "Стаки меток растут, пока каждая половина работает со своим боссом.") },
      { marker: "ADD", title: tx("Coagulation", "Coagulation"), detail: tx("Kill the large add; clear droplets around Breath.", "Убейте большого ядовитого противника и соберите капли вокруг стража Дыхания.") },
      { marker: "100", title: tx("Vitriolic Stasis", "«Vitriolic Stasis»"), detail: tx("Stop damage and pair toxin values to exactly four.", "Остановите урон и сложите значения токсинов ровно до четырёх.") },
      { marker: "SWAP", title: tx("Group crossover", "Смена сторон"), detail: tx("Each group switches to the other Sentinel after Stasis. Tanks spread the bosses apart again and exchange targets.", "После стазиса каждая группа переключается на другого стража. Танки снова разводят боссов и меняют цели.") },
    ],
    difficulty: {
      normal: { headline: tx("Two clean, independent camps", "Два чистых независимых лагеря"), changes: [tx("Match 1+3 or 2+2 during Helical Toxins.", "Собирайте 1+3 или 2+2 во время «Helical Toxins»."), tx("The lower-health boss heals during Stasis.", "Босс с меньшим здоровьем лечится во время «Stasis».")] },
      heroic: { headline: tx("Returning venom punishes messy space", "Возвратный яд наказывает за грязное пространство"), changes: [tx("Destroyed droplets send Living Venom back to Breath.", "Уничтоженные капли отправляют «Living Venom» обратно к «Breath»."), tx("Blood mechanics leave pools; toxin totals above four are lethal.", "Кровавые механики оставляют лужи; сумма токсинов выше четырёх смертельна.")] },
      mythic: { headline: tx("Prototype-venom partners", "Пары прототипного яда"), changes: [tx("Shifting Protovenom targets must collide with each other.", "Цели «Shifting Protovenom» должны столкнуться друг с другом."), tx("Touching an unmarked player erupts in a 10-yard knockback.", "Касание игрока без метки вызывает взрыв и отбрасывание в радиусе 10 метров.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 4, dps: 14, note: tx("Split healing evenly between camps.", "Распределите лекарей поровну между группами.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Even ranged coverage on both sides.", "Распределите бойцов дальнего боя поровну между сторонами.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Use fixed toxin and Protovenom meeting points.", "Назначьте точки встречи для Toxins и «Protovenom».") },
    },
    source: "https://www.icy-veins.com/wow/entombed-sentinels-raid-guide",
  },
  {
    slug: "the-lost-explorers",
    number: 3,
    name: "The Lost Explorers",
    type: tx("Three-target council", "Совет из трёх целей"),
    summary: tx("Cleave two explorers, balance all three health bars, and use Gebbo’s fish to choose a safe ultimate order.", "Бейте двух исследователей вместе, выравнивая здоровье всех троих. Кормите выбранного босса рыбой из ящиков, чтобы управлять порядком особых атак; добейте троих одновременно."),
    pull: tx("Bloodlust: on pull", "Героизм: в начале боя"),
    layout: "triangle",
    positioning: tx("Keep Nama with only one other boss; never stack all three. Melee bait Shell Spin outward while ranged reserve edge space for bombs and Frostfire pools.", "Держите Наму рядом только с одним из остальных боссов: сближение всех троих даёт им защиту. Направляйте «Shell Spin» к краю; сохраняйте свободное место для бомб и огненно-ледяных областей."),
    roles: {
      tank: [tx("Swap after Shredding Shards and rotate Nama between Gebbo and Iku.", "Меняйтесь после «Shredding Shards» и водите Nama между Gebbo и Iku."), tx("Never bring all three within United Defense range.", "Никогда не сводите всех троих в радиус «United Defense».")],
      healer: [tx("Plan cooldowns for Frostfire pool clears.", "Распределите защиту рейда на время очистки огненных и ледяных областей."), tx("Top Mighty Thud targets before the leap sequence.", "Поднимайте цели Mighty Thud до серии прыжков.")],
      dps: [tx("Interrupt Icebound Flames. Open every crate before Relic Rupture; rotate collectors so Splinters does not overwhelm one player.", "Прерывайте «Icebound Flames». Открывайте все ящики до Relic Rupture; чередуйте сборщиков, чтобы кровотечение «Splinters» не накопилось на одном игроке."), tx("Feed at 90–95 energy: Gebbo → Nama → Iku. Each explorer can eat only once; kill all three before the next energy cap.", "Кормите на 90–95 энергии: Gebbo → Nama → Iku. Каждый исследователь ест только один раз; после третьего кормления победите до следующего заполнения энергии.")],
    },
    timeline: [
      { marker: "PULL", title: tx("Two-target cleave", "Клив двух целей"), detail: tx("Balance all three bosses; control Shell Spin.", "Выравнивайте всех троих; контролируйте «Shell Spin».") },
      { marker: "90", title: tx("Grab Fish", "Grab Fish"), detail: tx("Break a crate and feed the planned explorer.", "Сломайте ящик и накормите выбранного исследователя.") },
      { marker: "G", title: tx("Gebbo ultimate", "Ультимейт Gebbo"), detail: tx("Place bombs at the edge. Enter a mushroom just before the approaching Blast Wave reaches you to jump over it; do not consume mushrooms early.", "Оставьте бомбы у края. Коснитесь гриба перед приближением Взрывной волны, чтобы перелететь над ней; не расходуйте грибы заранее.") },
      { marker: "N/I", title: tx("Nama then Iku", "Nama, затем Iku"), detail: tx("Alternate leap soaks, then clear opposite Frostfire pools.", "Разделяйте урон трёх прыжков; затем с огненным эффектом собирайте ледяные области, а с ледяным — огненные. Каждая очистка наносит урон рейду.") },
    ],
    difficulty: {
      normal: { headline: tx("Control the ultimate order", "Контролируйте порядок ультимейтов"), changes: [tx("Use Gebbo → Nama → Iku for predictable space.", "Используйте Gebbo → Nama → Iku ради предсказуемого пространства."), tx("Balance three separate health bars.", "Выравнивайте три отдельные полосы здоровья.")] },
      heroic: { headline: tx("Soak teams and pool discipline", "Распределение урона и очистка арены"), changes: [tx("Assign three groups to the three Mighty Thud marks: one near the boss and two at range. Every circle needs soakers; leave the impact craters.", "Назначьте три группы на три метки Mighty Thud: одну рядом с боссом и две на расстоянии. В каждом круге нужны союзники; после удара покиньте воронку."), tx("Clearing opposite Frostfire pools deals raid damage.", "Очистка противоположных Frostfire-луж наносит урон рейду.")] },
      mythic: { headline: tx("Every crate becomes a raid decision", "Каждый ящик становится решением рейда"), changes: [tx("Breaking a crate applies Splinters raid-wide.", "Разрушение ящика накладывает «Splinters» на весь рейд."), tx("An unopened crate ruptures after 25 seconds.", "Неоткрытый ящик взрывается через 25 секунд.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Favor cleave without losing priority damage.", "Наносите урон двум целям, сохраняя возможность быстро переключаться.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Three assigned Mighty Thud groups.", "Три назначенные группы для Mighty Thud.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign crate breaks and healing CDs by wave.", "Назначьте открытие ящиков и хил-сейвы по волнам.") },
    },
    source: "https://www.icy-veins.com/wow/lost-explorers-raid-guide",
  },
  {
    slug: "vashnik-the-malignant",
    number: 4,
    name: "Vashnik the Malignant",
    type: tx("Add control · rotating arena", "Контроль слизней · перемещение по арене"),
    summary: tx("Steer which two fountains Vashnik imbibes, then kill every venom add before it reaches the Malignant Cavity.", "Ставьте Вашника между двумя выбранными фонтанами перед «Imbibe». Уничтожайте всех ядовитых слизней до их входа в центральную впадину."),
    pull: tx("Bloodlust: on pull", "Героизм: в начале боя"),
    layout: "center",
    positioning: tx("Tank Vashnik between the next two fountains and rotate around the central cavity. Keep ranged spread for Catalytic Bile while preserving add-control lanes.", "Ставьте Вашника между следующими двумя фонтанами. Бойцы дальнего боя рассредотачиваются для «Catalytic Bile»; оставляйте свободные пути к слизням."),
    roles: {
      tank: [tx("Swap after every Dripping Fangs.", "Меняйтесь после каждого «Dripping Fangs»."), tx("Move the boss far enough to lock the intended fountain pair.", "Уводите босса достаточно далеко, чтобы зафиксировать нужную пару фонтанов.")],
      healer: [tx("Top Exploding Infection before the target leaves; clear Stygian absorbs.", "Восстановите здоровье цели «Exploding Infection» перед её выходом из группы. Исцеляйте цели эффектов, поглощающих лечение."), tx("For Siphoning Infection, allies inside the circle supply health.", "При «Siphoning Infection» союзники внутри круга отдают здоровье.")],
      dps: [tx("Priority: Burning → Clotting → Shrouded Venoms.", "Убивайте слизней в таком порядке: огненные, кровавые, теневые."), tx("Control Shrouded Venoms away from the cavity. Clotting Venoms are immune to crowd control and split on death: kill their offspring too.", "Удерживайте теневых слизней вдали от центра. Кровавые слизни невосприимчивы к контролю и делятся после смерти: уничтожайте и появившиеся части.")],
    },
    timeline: [
      { marker: "PULL", title: tx("Fire + Shadow", "Огонь + Тьма"), detail: tx("Stack Burning Venoms onto rooted Shrouded adds.", "Сводите огненных слизней к обездвиженным теневым и убивайте огненных первыми.") },
      { marker: "~1:30", title: tx("Fire + Blood", "Огонь + Кровь"), detail: tx("Move burning adds to Clotting Venom and control splits.", "Убивайте огненных слизней рядом с кровавыми; после деления быстро добивайте их части.") },
      { marker: "~3:00", title: tx("Blood + Shadow", "Кровь + Тьма"), detail: tx("Kill Blood first while Shadow adds remain rooted.", "Сначала уничтожьте кровавых слизней, удерживая теневых на месте.") },
      { marker: "LOOP", title: tx("Repeat empowered cycle", "Повтор усиленного цикла"), detail: tx("At each full energy, Imbibe takes the two nearest fountains and adds permanent Toxic Vapor. Kill every venom before it reaches the cavity.", "При полной энергии «Imbibe» выбирает два ближайших фонтана и усиливает постоянный Toxic Vapor. Уничтожайте всех слизней до их входа в центральную впадину.") },
    ],
    difficulty: {
      normal: { headline: tx("Learn the three fountain pairs", "Освойте три пары фонтанов"), changes: [tx("Rotate Fire+Shadow → Fire+Blood → Blood+Shadow.", "Чередуйте Огонь+Тьма → Огонь+Кровь → Кровь+Тьма."), tx("Aim Plague Wave away from the group.", "Направляйте «Plague Wave» от группы.")] },
      heroic: { headline: tx("Every player helps cover Bile", "Каждую область желчи должен закрыть игрок"), changes: [tx("Catalytic Bile creates individual soak zones.", "«Catalytic Bile» создаёт отдельные зоны: каждую должен закрыть игрок."), tx("Killing both Burning Venoms together can make Caustic Surge lethal.", "Убивайте огненных слизней по очереди: одновременные взрывы «Caustic Surge» опасны для рейда.")] },
      mythic: { headline: tx("Use Plague Wave to unlock Tumors", "Снимайте защиту Tumors через «Plague Wave»"), changes: [tx("Imbibe also spawns Malignant Tumors with 99% damage reduction.", "«Imbibe» также создаёт Malignant Tumors со снижением урона на 99%."), tx("Hit each Tumor with Plague Wave before killing it; a leak applies a stacking one-minute DoT.", "Попадите «Plague Wave» по каждому Tumor до его убийства; пропущенный адд оставляет минутный стакующийся DoT.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Knockbacks and roots are especially valuable.", "Особенно полезны отбрасывания и обездвиживание.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Spread ranged for full soak coverage.", "Рассредоточьте дальних бойцов, чтобы они успевали закрывать отмеченные области.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign Plague Wave aimers to each Tumor.", "Назначьте направляющих «Plague Wave» на каждый Tumor.") },
    },
    source: "https://www.icy-veins.com/wow/vashnik-raid-guide/",
  },
  {
    slug: "sszorak",
    number: 5,
    name: "Sszorak",
    type: tx("Knockback puzzle · burn windows", "Отбрасывания · периоды уязвимости"),
    summary: tx("Place cysts opposite the active wind tunnels, survive the five-hit Apex Predator combo, then chain knockbacks through the intermission.", "Оставляйте кисты напротив активных аэротруб. Распределите удары серии «Apex Predator» между танками и группами, а на переходе используйте кисты для возвращения к центру."),
    pull: tx("Bloodlust: on pull or first Dig In", "Героизм: в начале боя или первом «Dig In»"),
    layout: "lanes",
    positioning: tx("Mark spots opposite the lit wind tunnels before the pull. Drop one Viscous Cyst per marker and keep the boss away from that reserve lane.", "Перед боем отметьте места напротив активных аэротруб. Оставляйте по одной кисте на метке и держите босса в стороне, чтобы случайно не взорвать их."),
    roles: {
      tank: [tx("Split each Apex Predator combo so each tank takes one Ravage and one Mutilate.", "Делите «Apex Predator» так, чтобы каждый танк получил по одному «Ravage» и Mutilate."), tx("Face Ravage away; place Mutilate into the assigned soak team.", "Направляйте «Ravage» от рейда, а Mutilate — в назначенную группу, разделяющую урон.")],
      healer: [tx("Prepare externals for unpredictable combo order.", "Следите за порядком ударов серии и вовремя помогайте танкам защитными способностями."), tx("Stabilize the raid before each cyst knockback.", "Поднимайте рейд перед каждым отбрасыванием от кисты.")],
      dps: [tx("Drop Venomous Surge on assigned markers only.", "Ставьте «Venomous Surge» только на назначенные метки."), tx("During Dig In, the boss takes 30% extra damage.", "Во время «Dig In» босс получает на 30% больше урона.")],
    },
    timeline: [
      { marker: "READ", title: tx("Read wind tunnels", "Определите порядок ветра"), detail: tx("Three tunnels activate in the order shown by one, two and three orbs. Mark cyst positions opposite those tunnels; keep the spare fourth cyst clear of the route.", "Три трубы включаются в порядке одной, двух и трёх сфер над ними. Отметьте кисты напротив этих труб; четвёртая запасная киста не должна мешать маршруту.") },
      { marker: "x5", title: tx("Apex Predator", "«Apex Predator»"), detail: tx("Two Ravages, two Mutilates, one Tempest in random order.", "Два «Ravage», два Mutilate и один «Tempest» в случайном порядке.") },
      { marker: "DROP", title: tx("Venomous Surge", "«Venomous Surge»"), detail: tx("Create one cyst at each safe marker.", "Создайте по одной кисте на каждой безопасной метке.") },
      { marker: "INT", title: tx("Howling Maelstrom", "«Howling Maelstrom»"), detail: tx("Start near the center. Let each wind carry you into its opposite cyst so the explosion throws you back toward the center. Damage the boss during Dig In.", "Начните у центра. Каждый поток должен отнести вас к противоположной кисте, взрыв которой вернёт к центру. Усиливайте урон по боссу во время «Dig In».") },
    ],
    difficulty: {
      normal: { headline: tx("Build a clean knockback route", "Постройте чистый маршрут отбрасываний"), changes: [tx("One shared Mutilate group is enough.", "Достаточно одной общей группы Mutilate."), tx("Pair opposite Raging Crosswinds directions.", "Соединяйте пары с противоположными направлениями «Raging Crosswinds».")] },
      heroic: { headline: tx("Two alternating Mutilate groups", "Две чередующиеся группы Mutilate"), changes: [tx("Mutilate needs at least five soakers. Its vulnerability requires two alternating teams on Heroic.", "Урон Mutilate разделяют минимум пять игроков. На героической сложности из-за уязвимости чередуйте две группы."), tx("Caustic Claws leaves damaging pools. Dodge the impacts and move the boss to a clean sector; keep the cyst landing areas clear.", "«Caustic Claws» оставляет опасные лужи. Уклоняйтесь от падений и переводите босса в чистый сектор; сохраняйте свободные места приземления у кист.")] },
      mythic: { headline: tx("Stack fourteen, then spread beams", "Соберите четырнадцать, затем разведите лучи"), changes: [tx("Fourteen players stack on the Serpent’s Fury target to trigger the charge.", "Четырнадцать игроков стакаются на цели Serpent’s «Fury», чтобы вызвать рывок."), tx("After To the Slaughter, spread Virulence beams; Crosswinds uses four directions.", "После «To the Slaughter» разведите лучи «Virulence»; «Crosswinds» работает в четырёх направлениях.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Mobile classes recover from knockbacks easily.", "Мобильные классы проще исправляют отбрасывания.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Create two equal Mutilate teams.", "Соберите две равные группы Mutilate.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Fourteen-player Fury stack is mandatory.", "Стак из 14 игроков на «Fury» обязателен.") },
    },
    source: "https://www.icy-veins.com/wow/sszorak-raid-guide/",
  },
  {
    slug: "the-twin-fangs",
    number: 6,
    name: "The Twin Fangs",
    type: tx("Dual boss · venom stacks", "Два босса · стаки яда"),
    summary: tx("Balance Vexhul and Ithraz, manage permanent Eternal Venom stacks, and spend those stacks safely in Ravenous Feast soaks.", "Выравнивайте здоровье двух змеев, собирайте ядовитые сферы игроками с малым числом стаков и снимайте яд, разделяя «Ravenous Feast». Убейте обоих до третьего погружения."),
    pull: tx("Bloodlust: on pull", "Героизм: в начале боя"),
    layout: "edge",
    positioning: tx("The bosses cannot be moved. Spread around them, reserve the center for adds and place Coiling Ichor along the edge. During Submerge, watch the orbs showing Vile Flood’s rotation and move into the safe area behind the sweep.", "Боссов нельзя передвигать. Расположитесь вокруг них, оставьте центр для дополнительных противников, а «Coiling Ichor» выносите к краю. На переходе следите за сферами, показывающими вращение «Vile Flood», и уходите в безопасную область позади прошедшего луча."),
    roles: {
      tank: [tx("Always maintain melee range; swap after every Stone Breaker set.", "Всегда оставайтесь в мили; меняйтесь после каждой серии «Stone Breaker»."), tx("Soak all three Stone Breaker impacts in their spawn order.", "Примите все три удара Крушителя камня в порядке появления.")],
      healer: [tx("Track Eternal Venom and Feasted before assigning soaks.", "Перед распределением ударов проверяйте накопленный яд и наличие «Feasted» у игроков."), tx("Cover Venomous Emergence and intermission overlaps.", "Используйте сильное лечение при появлении противников в центре и во время одновременных атак на переходе.")],
      dps: [tx("Hard-swap to the three Spawn of Vexhul in the center.", "Сразу переключайтесь в трёх Spawn of Vexhul в центре."), tx("Keep both bosses even; low-stack players soak Caustic Globules.", "Выравнивайте здоровье боссов. Сферы «Caustic Globule» собирают игроки с небольшим числом стаков яда.")],
    },
    timeline: [
      { marker: "MAIN", title: tx("Build and spend venom", "Набор и снятие яда"), detail: tx("Soak globules, kill center adds, drop edge pools.", "Собирайте сферы, быстро убивайте противников в центре и оставляйте лужи у края.") },
      { marker: "x3", title: tx("Ravenous Feast", "«Ravenous Feast»"), detail: tx("Cover all three hits. On Heroic each player uses only one assigned hit and removes only one venom stack per sequence.", "Разделите все три удара. На героической сложности каждый игрок участвует только в одном назначенном ударе и снимает один стак яда за серию.") },
      { marker: "INT", title: tx("Submerge", "Submerge"), detail: tx("Read the beam’s rotation before it starts; reach the safe area behind it early and dodge Sanguine Storm impacts.", "Определите направление вращения до появления луча; заранее займите безопасную область позади него и уклоняйтесь от «Sanguine Storm».") },
      { marker: "3×100", title: tx("Third Submerge", "Третье погружение"), detail: tx("Defeat both bosses before the third energy cap: Caustic Rain ends the encounter.", "Победите обоих боссов до третьего заполнения энергии: Едкий дождь приводит к гибели рейда.") },
    ],
    difficulty: {
      normal: { headline: tx("Use Feast to reset venom stacks", "Снимайте яд через «Feast»"), changes: [tx("The same players may soak multiple Feast hits.", "Одни и те же игроки могут разделять несколько последовательных ударов Яростного пожирания."), tx("Low-stack players collect Caustic Globules.", "Игроки с небольшим числом стаков яда собирают Едкие комки.")] },
      heroic: { headline: tx("Three exclusive Feast teams", "Три отдельные группы «Feast»"), changes: [tx("Feasted prevents a player from taking another hit in the sequence.", "«Feasted» не позволяет игроку принять следующий удар серии."), tx("Ten Eternal Venom stacks are lethal. Avoid the slowing gore pools while moving out of the laser.", "Десять стаков Вечного яда смертельны. При уходе от луча обходите замедляющие лужи крови.")] },
      mythic: { headline: tx("Interrupt shields and post-soaks", "Прерывайте щиты и досоки"), changes: [tx("Interrupt Barbed Bulwark before anyone collects a globule.", "Прервите «Barbed Bulwark» до того, как кто-либо заберёт сферу."), tx("Rouse the Brood adds need assigned kicks; each Feast group immediately soaks Tainted Blood.", "Аддам «Rouse the Brood» нужны назначенные прерывания; каждая «Feast»-группа сразу сокает «Tainted Blood».")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Strong two-target cleave is ideal.", "Полезны способности, наносящие урон двум целям одновременно.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Pre-build three Feast soak teams.", "Заранее соберите три группы «Feast».") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign an interrupt to every Brood spawn.", "Назначьте прерывание на каждый Brood-адд.") },
    },
    source: "https://www.icy-veins.com/wow/twin-fangs-raid-guide",
  },
  {
    slug: "the-coiled-altar",
    number: 7,
    name: "The Coiled Altar",
    type: tx("Three phases · two bosses", "Три фазы · два босса"),
    summary: tx("Consolidate venom for Zul’jan’s Sever, break Malacrass’s mind controls, then stack both bosses and kill them together.", "Собирайте ядовитые сферы под рассечение Зул’джана, освобождайте союзников от контроля Малакрасса и уничтожайте призраков. В финале сведите боссов и добейте одновременно."),
    pull: tx("Bloodlust: empowered Zul’jan intermission", "Героизм: переходная фаза с уязвимым Зул’джаном"),
    layout: "center",
    positioning: tx("Stack loosely near the middle. Assign a venom depot clear of Axegrinder paths; in Phase 2 stack on one side of Malacrass and gather manifestations in the center.", "Стойте рядом друг с другом у центра. Выберите место для ядовитых сфер вдали от летающих топоров. Во второй фазе держитесь с одной стороны Малакрасса, направляя призраков в центр."),
    roles: {
      tank: [tx("Aim Sever and Soul Sever through every prepared target, then swap.", "Направляйте «Sever» и «Soul Sever» через все подготовленные цели, затем меняйтесь."), tx("Stack both bosses in Phase 3 and balance health.", "В третьей фазе сведите боссов и выравнивайте здоровье.")],
      healer: [tx("Dispel Venomfang and cover grouped orb detonations.", "Снимайте «Venomfang» и закрывайте групповые взрывы сфер."), tx("Watch raid health before Fragment of Malacrass soaks.", "Перехватывайте осколки Малакрасса, только когда рейд готов пережить новый урон.")],
      dps: [tx("Assigned mobile players collect and stack Coalesced Venom.", "Назначенные мобильные игроки собирают «Coalesced Venom» в одну точку."), tx("Break mind-control shields. Interrupt Spiritcackle’s Wail of Terror; damage Malacrass’s shield to stop Eternal Nightfall.", "Разбивайте щиты на подконтрольных союзниках. Прерывайте Wail of Terror у Spiritcackle; чтобы остановить «Eternal Nightfall», уничтожьте щит Малакрасса.")],
    },
    timeline: [
      { marker: "P1", title: tx("Zul’jan", "Зул’джан"), detail: tx("Collect venom, clear with Sever and alternate Guillotine groups. After the axe lands, leave its corner. At 0% health, remaining venom detonates and Malacrass joins.", "Собирайте яд под «Sever» и чередуйте группы «Guillotine». После падения топора покиньте его угол. На 0% здоровья оставшиеся сферы взорвутся и вступит Малакрасс.") },
      { marker: "P2", title: tx("Malacrass", "Малакрасс"), detail: tx("Free controlled allies. Face fixating ghosts to stop them and line them up for Soul Sever. Gloombomb targets spread, then collect their own fragments within 15 seconds.", "Освобождайте союзников от контроля. Смотрите на преследующих призраков, чтобы остановить их, и соберите их под «Soul Sever». С Gloombomb отойдите от рейда, затем соберите свои осколки за 15 секунд.") },
      { marker: "INT", title: tx("Fragment bargain", "Сделка с фрагментами"), detail: tx("At Malacrass’s 0%, brace for knockback toward the center. Attack vulnerable Zul’jan while Malacrass is immune. Intercept fragments to prevent healing, but stagger them while the raid recovers.", "На 0% здоровья Малакрасса встречайте отбрасывание со стороны центра. Бейте уязвимого Зул’джана: Малакрасс неуязвим. Перехватывайте осколки, лечащие Малакрасса, по очереди, давая рейду восстановить здоровье.") },
      { marker: "P3", title: tx("Coiled together", "Вместе у алтаря"), detail: tx("Both bosses repeat mechanics and must die together.", "Оба босса повторяют механики и должны умереть вместе.") },
    ],
    difficulty: {
      normal: { headline: tx("Build one controlled venom depot", "Собирайте яд в назначенной области"), changes: [tx("Sever destroys every orb in its cone.", "«Sever» уничтожает все сферы в конусе."), tx("At least five players soak Guillotine.", "Урон Гильотины разделяют как минимум пять игроков.")] },
      heroic: { headline: tx("Alternate Guillotine teams", "Чередуйте группы «Guillotine»"), changes: [tx("Guillotined increases damage from another Guillotine by 500%.", "«Guillotined» увеличивает урон следующего «Guillotine» на 500%."), tx("Venom Rupture becomes a stacking DoT—do not clear too many orbs together.", "«Venom Rupture» накладывает суммирующийся периодический урон: уничтожайте сферы порциями, которые могут выдержать лекари.")] },
      mythic: { headline: tx("Mutated venom changes collection", "Мутировавший яд меняет сбор"), changes: [tx("Kill Virulent Cysts before they spawn more orbs every six seconds.", "Убивайте «Virulent Cyst» до новых сфер каждые шесть секунд."), tx("Mutation carriers stay 8 yards from allies and other venom; Tainted Blood prevents rapid repeat drops.", "Носители Mutation держатся в 8 метрах от союзников и яда; «Tainted Blood» запрещает быстрые повторные сбросы.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 4, dps: 14, note: tx("Mobile collectors and frequent interrupts help.", "Полезны мобильные сборщики и частые прерывания.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Two Guillotine groups of at least five.", "Две группы «Guillotine» минимум по пять человек.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign Cyst swaps and Mutation lanes.", "Назначьте переключения в Cyst и коридоры Mutation.") },
    },
    source: "https://www.icy-veins.com/wow/coiled-altar-raid-guide",
  },
  {
    slug: "ulatek",
    number: 8,
    name: "Ula’tek",
    type: tx("Three phases · eggs · collapsing platforms", "Три фазы · яйца · разрушающиеся платформы"),
    summary: tx("Carry eggs safely through venom waves, split for the outer corridors, then rotate across collapsing platforms for the final Heart burn.", "Защищайте яйца от ядовитых волн, разделитесь для прохождения внешних коридоров и вовремя покидайте разрушающиеся платформы. Усиления урона берегите для уязвимого сердца."),
    pull: tx("Bloodlust: first exposed Heart", "Героизм: первое открытие сердца"),
    layout: "platforms",
    positioning: tx("Pre-split into two equal teams. In Phase 3, melee stay on Ula’tek while ranged and healers take the platform immediately counter-clockwise; all groups rotate left before each break.", "Заранее разделитесь на две равные команды. В третьей фазе бойцы ближнего боя остаются у босса, а дальние бойцы и лекари занимают соседнюю платформу против часовой стрелки. Перед разрушением все переходят на следующую платформу."),
    roles: {
      tank: [tx("One tank must remain in melee range of Ula’tek and one in range of her tail.", "Один танк постоянно находится в ближнем бою с боссом, второй — рядом с хвостом."), tx("After Mother’s Wrath, return to the red pool; swap during Caustic Waves.", "После отбрасывания Гневом матери вернитесь в красную область; меняйтесь во время Едких волн.")],
      healer: [tx("Cover paired tether breaks and every Spectral Coils soak.", "Восстанавливайте здоровье рейда после разрыва каждой пары связей и при разделении урона Призрачных колец."), tx("In Phase 3, anchor the healer Serpent’s Bite group in the middle.", "В третьей фазе группа, разделяющая урон Укуса змеи с лекарем, занимает центральную позицию.")],
      dps: [tx("Carry every egg into Spectral Coils; never let a wave touch it.", "Несите каждое яйцо в Призрачные кольца; не позволяйте волне яда коснуться его."), tx("Prioritize Wardens, Weakened Doomscales and Shriekers; interrupt Anguished Cry and Vicious Echoes.", "Сначала убивайте стражей, ослабленных змеев и крикунов. Прерывайте «Anguished Cry» и «Vicious Echoes».")],
    },
    timeline: [
      { marker: "P1", title: tx("Eggs and waves", "Яйца и волны"), detail: tx("Carry eggs into Coils; dodge alternating Caustic Waves.", "Несите яйца в Призрачные кольца; проходите через промежутки между Едкими волнами.") },
      { marker: "HEART", title: tx("Rage of the Shackled", "«Rage of the Shackled»"), detail: tx("Bloodlust before the 20-second double-damage Heart window.", "Используйте Героизм перед 20 секундами уязвимости сердца: урон по нему удвоен.") },
      { marker: "P2", title: tx("Two outer corridors", "Два внешних коридора"), detail: tx("Interrupt Warden’s Malice, kill the guards and break Grasping Fangs tethers in pairs, waiting for the raid damage to end. Deliver small eggs to the Cauldron first and the large egg last; kill the Weakened Doomscale before returning.", "Прерывайте «Warden’s Malice», убивайте стражей и разрывайте связи Grasping Fangs парами, дожидаясь окончания урона по рейду. Сначала доставьте в котёл маленькие яйца, последним — большое; убейте ослабленного змея и возвращайтесь.") },
      { marker: "INT", title: tx("Six alternating slams", "Шесть чередующихся ударов"), detail: tx("Teams soak 1/3/5 and 2/4/6; leave the center before shatter.", "Первая команда принимает удары 1/3/5, вторая — 2/4/6. Покиньте центр до разрушения платформы.") },
      { marker: "P3", title: tx("Four-platform rotation", "Ротация четырёх платформ"), detail: tx("Soak three Bite groups, spread Purge, move left before Circling Prey.", "Разделите урон Укуса змеи тремя группами, разойдитесь перед взрывами и перейдите на следующую платформу против часовой стрелки.") },
    ],
    difficulty: {
      normal: { headline: tx("Protect every egg from venom", "Защитите каждое яйцо от яда"), changes: [tx("Both Spectral Coils can be soaked by the full raid.", "Весь рейд может вместе разделять урон обоих Призрачных колец."), tx("Use mobility to reach both outer corridors.", "Используйте мобильность для выхода в оба внешних коридора.")] },
      heroic: { headline: tx("Two teams own the entire fight", "Две группы ведут весь бой"), changes: [tx("Each Phase 1 Coil belongs to one assigned team.", "Каждое Призрачное кольцо в первой фазе принимает своя заранее назначенная группа."), tx("Alternate intermission slams 1/3/5 and 2/4/6; Phase 3 uses melee, ranged and healer Bite groups.", "Чередуйте команды на ударах 1/3/5 и 2/4/6. В третьей фазе назначьте отдельные группы для Укуса змеи у ближних бойцов, дальних бойцов и лекарей.")] },
      mythic: { headline: tx("Strategy still being verified", "Стратегия ещё проверяется"), changes: [tx("Reliable public Mythic strategy was not available at the last review.", "На момент последней проверки надёжной публичной Mythic-стратегии ещё не было."), tx("Use the Heroic structure as preparation; expect assignments and tuning to change after verified kills.", "Готовьтесь по структуре Heroic; назначения и числа изменятся после подтверждённых убийств.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 4, dps: 14, note: tx("Two balanced corridor teams.", "Две равные группы для коридоров.") },
      heroic: { tanks: 2, healers: 5, dps: 13, note: tx("Safer for progression; split healing 2/3 across corridors.", "Пример состава для освоения боя: распределите лекарей по коридорам в соотношении 2/3.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Provisional until verified Mythic strategy is published.", "Предварительно, до публикации проверенной Mythic-стратегии.") },
    },
    source: "https://www.icy-veins.com/wow/ulatek-raid-guide/",
  },
];

type ManifestEncounterIdentity = {
  id: string;
  canonicalSlug: string;
  instance?: string;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
  build: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  strategyVerificationStatus?: string;
  explicitJournalPhaseCount?: number;
  phaseCoverageStatus?: string;
  refs: { encounterId: number | null; journalId: number | null };
};

type ManifestAbilityIdentity = {
  parentId: string;
  spellId: number;
  iconId: number;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
  descriptionVerificationStatus?: string;
  descriptionSourceKind?: string;
  iconName?: string;
  iconUrl?: string;
  iconSourceUrl?: string;
  iconSourceKind?: string;
  iconVerifiedAt?: string;
  iconVerificationStatus?: string;
};

type ManifestPhaseIdentity = {
  parentId: string;
  order: number;
  names: { en: string | null; ru: string | null };
  journalSectionId?: number;
  phaseKind?: string;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  verificationStatus: string;
  descriptions: { en: string | null; ru: string | null };
  timeline?: unknown;
};

const encounterIdentityBySlug = new Map(
  (contentManifest.encounters as ManifestEncounterIdentity[])
    .filter((entry) => entry.instance === "venomous-abyss")
    .map((entry) => [entry.canonicalSlug, entry]),
);

export const venomousAbyss: BossGuide[] = strategyDrafts.map(({ name: draftName, ...draft }) => {
  const identity = encounterIdentityBySlug.get(draft.slug);
  if (
    !identity?.names.en
    || !identity.names.ru
    || !identity.descriptions.en
    || !identity.descriptions.ru
    || !identity.build
    || !identity.sourceUrl
    || !identity.lastVerifiedAt
    || !identity.refs.encounterId
    || !identity.refs.journalId
  ) {
    throw new Error(`Verified Venomous Abyss identity is incomplete for ${draft.slug}`);
  }
  if (identity.names.en.replaceAll("'", "’") !== draftName.replaceAll("'", "’")) {
    throw new Error(`Strategy draft identity diverges from the canonical manifest for ${draft.slug}`);
  }
  if (identity.strategyVerificationStatus !== "source_tracked") {
    throw new Error(`Unexpected strategy verification status for ${draft.slug}`);
  }
  const journalAbilities = (contentManifest.abilities as ManifestAbilityIdentity[])
    .filter((ability) => ability.parentId === identity.id)
    .map((ability) => {
      if (
        !ability.names.en
        || !ability.names.ru
        || !ability.spellId
        || !ability.iconId
        || !ability.iconName
        || !ability.iconUrl
        || !ability.iconSourceUrl
        || !ability.iconVerifiedAt
        || ability.iconVerificationStatus !== "verified"
        || !["blizzard_api", "wago_tools"].includes(ability.iconSourceKind ?? "")
        || !["verified", "withheld_unresolved_tokens"].includes(ability.descriptionVerificationStatus ?? "")
        || !["spell_description", "spell_description_reference", "spell_description_spell_names", "spell_description_spell_names_duration", "spell_description_static_modifier_duration", "exact_build_unresolved"].includes(ability.descriptionSourceKind ?? "")
      ) {
        throw new Error(`Verified Venomous Abyss ability identity is incomplete for spell ${ability.spellId}`);
      }
      const descriptionIsVerified = ability.descriptionVerificationStatus === "verified";
      if (
        (descriptionIsVerified && (!ability.descriptions.en || !ability.descriptions.ru))
        || (!descriptionIsVerified && (ability.descriptions.en != null || ability.descriptions.ru != null))
      ) {
        throw new Error(`Venomous Abyss ability description state is inconsistent for spell ${ability.spellId}`);
      }
      return {
        spellId: ability.spellId,
        name: { en: ability.names.en, ru: ability.names.ru },
        description: descriptionIsVerified
          ? { en: ability.descriptions.en as string, ru: ability.descriptions.ru as string }
          : null,
        descriptionVerificationStatus: ability.descriptionVerificationStatus as "verified" | "withheld_unresolved_tokens",
        descriptionSourceKind: ability.descriptionSourceKind as "spell_description" | "spell_description_reference" | "spell_description_spell_names" | "spell_description_spell_names_duration" | "spell_description_static_modifier_duration" | "exact_build_unresolved",
        iconId: ability.iconId,
        iconName: ability.iconName,
        iconUrl: ability.iconUrl,
        iconSourceUrl: ability.iconSourceUrl,
        iconSourceKind: ability.iconSourceKind as "blizzard_api" | "wago_tools",
        iconVerifiedAt: ability.iconVerifiedAt,
      };
    });
  if (journalAbilities.length === 0) {
    throw new Error(`Verified Venomous Abyss overview ability set is empty for ${draft.slug}`);
  }
  const journalPhases = (contentManifest.phases as ManifestPhaseIdentity[])
    .filter((phase) => phase.parentId === identity.id)
    .sort((left, right) => left.order - right.order)
    .map((phase) => {
      if (
        !phase.names.en
        || !phase.names.ru
        || !phase.journalSectionId
        || !phase.sourceUrl
        || !phase.lastVerifiedAt
        || !["stage", "intermission"].includes(phase.phaseKind ?? "")
        || phase.verificationStatus !== "identity_only"
        || phase.descriptions.en != null
        || phase.descriptions.ru != null
        || phase.timeline != null
      ) {
        throw new Error(`Venomous Abyss Journal phase identity is inconsistent for section ${phase.journalSectionId}`);
      }
      return {
        order: phase.order,
        name: { en: phase.names.en, ru: phase.names.ru },
        journalSectionId: phase.journalSectionId,
        phaseKind: phase.phaseKind as "stage" | "intermission",
        sourceUrl: phase.sourceUrl,
        lastVerifiedAt: phase.lastVerifiedAt,
      };
    });
  if (
    journalPhases.length !== (identity.explicitJournalPhaseCount ?? 0)
    || identity.phaseCoverageStatus !== (journalPhases.length
      ? "explicit_journal_sections_only"
      : "no_explicit_journal_sections")
  ) {
    throw new Error(`Venomous Abyss Journal phase coverage diverges for ${draft.slug}`);
  }
  return {
    ...draft,
    name: { en: identity.names.en, ru: identity.names.ru },
    identityDescription: { en: identity.descriptions.en, ru: identity.descriptions.ru },
    encounterId: identity.refs.encounterId,
    journalId: identity.refs.journalId,
    build: identity.build,
    identitySourceUrl: identity.sourceUrl,
    identityLastVerifiedAt: identity.lastVerifiedAt,
    strategyVerificationStatus: "source_tracked",
    journalAbilities,
    journalPhases,
  };
});

export const bossBySlug = (slug: string) => venomousAbyss.find((boss) => boss.slug === slug);
export const lt = (value: LocalText, lang: Lang) => value[lang];
