import contentManifest from "./wow/content-manifest.json";

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
    type: tx("Two phases · priority adds", "Две фазы · приоритетные адды"),
    summary: tx(
      "Break the Restless Amani shields, keep them out of the Soulcoil Well, then burn Nek’zali before her final energy cycle ends.",
      "Сбивайте щиты Restless Amani, не пускайте их к Soulcoil Well, а затем добейте Nek’zali до конца финального цикла энергии.",
    ),
    pull: tx("Bloodlust: start of Phase 2", "Героизм: начало второй фазы"),
    layout: "edge",
    positioning: tx(
      "Walk the boss toward the largest coffin cluster. Drop Essence Rend on the outer wall and build one corpse pile for Hungering Pyre.",
      "Ведите босса к самому большому скоплению саркофагов. Essence Rend выносите к стене, тела складывайте одной кучей под Hungering Pyre.",
    ),
    roles: {
      tank: [
        tx("Swap at 5–6 Hollowing Strikes stacks.", "Меняйтесь на 5–6 стаках Hollowing Strikes."),
        tx("Point Possession Barrage away and place Hungering Pyre on corpses.", "Отворачивайте Possession Barrage и ставьте Hungering Pyre на тела."),
      ],
      healer: [
        tx("Dispel Essence Rend only after its target reaches the wall.", "Снимайте Essence Rend только после того, как цель дошла до стены."),
        tx("Commit raid cooldowns to Soulcoil Ignition and late Invoke stacks.", "Отдавайте рейдовые сейвы на Soulcoil Ignition и поздние стаки Invoke."),
      ],
      dps: [
        tx("Magic damage breaks Restless Amani shields; cleave them into the active Echo.", "Магическим уроном ломайте щиты Restless Amani и кливуйте их в активное Echo."),
        tx("Phase 2 is a hard energy race—save damage for it.", "Вторая фаза — жёсткая гонка энергии: сохраните урон на неё."),
      ],
    },
    timeline: [
      { marker: "P1", title: tx("Coffins awaken", "Пробуждение саркофагов"), detail: tx("Shields, Essence Rend and tank combo.", "Щиты, Essence Rend и танковая серия.") },
      { marker: "100", title: tx("Soulcoil Ignition", "Soulcoil Ignition"), detail: tx("Heavy raid damage; dodge Anguished Echoes.", "Сильный урон по рейду; уклоняйтесь от Anguished Echoes.") },
      { marker: "INT", title: tx("Two Echoes of Jawae", "Два Echo of Jawae"), detail: tx("Kill one at a time and burn corpse piles.", "Убивайте по одному и сжигайте кучи тел.") },
      { marker: "P2", title: tx("Uncoiled race", "Финальная гонка"), detail: tx("Bloodlust, permanent Rite stacks, kill before 100 energy.", "Героизм, постоянные стаки Rite, убийство до 100 энергии.") },
    ],
    difficulty: {
      normal: { headline: tx("Learn the corpse-and-Well loop", "Освойте цикл тел и колодца"), changes: [tx("One main Hungering Pyre group clears corpse piles.", "Одна основная группа Hungering Pyre чистит тела."), tx("Essence Rend is safe when dispelled at the wall.", "Essence Rend безопасно снимать у стены.")] },
      heroic: { headline: tx("Ritual Burn raises the healing check", "Ritual Burn усиливает проверку хила"), changes: [tx("Soulcoil Ignition also applies Ritual Burn.", "Soulcoil Ignition также накладывает Ritual Burn."), tx("Mobile ranged players use Slithering Flame on stray corpses.", "Мобильные рдд сжигают отдельные тела через Slithering Flame.")] },
      mythic: { headline: tx("Three teams rotate through the Well", "Три группы по очереди уходят в колодец"), changes: [tx("Grasping Depths pulls the raid; rotate three teams of four DPS and one healer into Immortal Coil.", "Grasping Depths стягивает рейд; три группы из четырёх бойцов и хила по очереди заходят в Immortal Coil."), tx("Invoke interrupts casts and silences interrupted players.", "Invoke прерывает касты и немит прерванных игроков.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Flexible; bring reliable magic burst.", "Гибко; нужен надёжный магический бурст.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Mobile ranged make corpse cleanup safer.", "Мобильные рдд упрощают зачистку тел.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Pre-assign three 5-player Well teams.", "Заранее назначьте три группы по 5 человек для колодца.") },
    },
    source: "https://www.icy-veins.com/wow/nekzali-raid-guide/",
  },
  {
    slug: "entombed-sentinels",
    number: 2,
    name: "Entombed Sentinels",
    type: tx("Two bosses · split raid", "Два босса · разделение рейда"),
    summary: tx("Keep Blood and Breath more than 40 yards apart, balance their health, and solve toxin pairings during each Stasis.", "Держите Blood и Breath дальше 40 метров друг от друга, выравнивайте здоровье и собирайте пары токсинов во время Stasis."),
    pull: tx("Bloodlust: final synchronized burn", "Героизм: финальный синхронный добив"),
    layout: "split",
    positioning: tx("Two fixed camps on opposite sides. Each tank owns one Sentinel until the intermission, then swaps bosses while the groups stay put.", "Два постоянных лагеря на противоположных сторонах. Каждый танк держит своего Sentinel до переходки, затем танки меняют боссов, а группы остаются на местах."),
    roles: {
      tank: [tx("Keep the bosses 40+ yards apart.", "Держите боссов дальше 40 метров."), tx("Swap Sentinels after each intermission; plan cooldowns for late Empowering Slams.", "Меняйте Sentinel после каждой переходки; берегите сейвы на поздние Empowering Slam.")],
      healer: [tx("Dispel Blighted Blood immediately.", "Снимайте Blighted Blood сразу."), tx("Cover the end of each marks cycle and stagger pool drops.", "Закрывайте конец каждого цикла меток и разводите сброс луж.")],
      dps: [tx("Balance both health bars before Vitriolic Stasis.", "Выравнивайте здоровье перед Vitriolic Stasis."), tx("Step on Toxic Droplets and hard-swap to Venom Coagulation.", "Наступайте на Toxic Droplets и сразу переключайтесь в Venom Coagulation.")],
    },
    timeline: [
      { marker: "A", title: tx("Split pressure", "Раздельное давление"), detail: tx("Marks ramp while each half handles its Sentinel.", "Стаки меток растут, пока каждая половина работает со своим боссом.") },
      { marker: "ADD", title: tx("Coagulation", "Coagulation"), detail: tx("Kill the large add; clear droplets around Breath.", "Убейте большого адда; зачистите капли вокруг Breath.") },
      { marker: "100", title: tx("Vitriolic Stasis", "Vitriolic Stasis"), detail: tx("Stop damage and pair toxin values to exactly four.", "Остановите урон и сложите значения токсинов ровно до четырёх.") },
      { marker: "SWAP", title: tx("Tank crossover", "Смена танков"), detail: tx("Groups stay; tanks exchange bosses and reset marks.", "Группы стоят; танки меняют боссов и сбрасывают метки.") },
    ],
    difficulty: {
      normal: { headline: tx("Two clean, independent camps", "Два чистых независимых лагеря"), changes: [tx("Match 1+3 or 2+2 during Helical Toxins.", "Собирайте 1+3 или 2+2 во время Helical Toxins."), tx("The lower-health boss heals during Stasis.", "Босс с меньшим здоровьем лечится во время Stasis.")] },
      heroic: { headline: tx("Returning venom punishes messy space", "Возвратный яд наказывает за грязное пространство"), changes: [tx("Destroyed droplets send Living Venom back to Breath.", "Уничтоженные капли отправляют Living Venom обратно к Breath."), tx("Blood mechanics leave pools; toxin totals above four are lethal.", "Кровавые механики оставляют лужи; сумма токсинов выше четырёх смертельна.")] },
      mythic: { headline: tx("Prototype-venom partners", "Пары прототипного яда"), changes: [tx("Shifting Protovenom targets must collide with each other.", "Цели Shifting Protovenom должны столкнуться друг с другом."), tx("Touching an unmarked player erupts in a 10-yard knockback.", "Касание игрока без метки вызывает взрыв и отбрасывание в радиусе 10 метров.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 4, dps: 14, note: tx("Split healing evenly between camps.", "Разделите хилов поровну между лагерями.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Even ranged coverage on both sides.", "Равномерно распределите рдд по сторонам.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Use fixed toxin and Protovenom meeting points.", "Назначьте точки встречи для Toxins и Protovenom.") },
    },
    source: "https://www.icy-veins.com/wow/entombed-sentinels-raid-guide",
  },
  {
    slug: "the-lost-explorers",
    number: 3,
    name: "The Lost Explorers",
    type: tx("Three-target council", "Совет из трёх целей"),
    summary: tx("Cleave two explorers, balance all three health bars, and use Gebbo’s fish to choose a safe ultimate order.", "Кливуйте двух исследователей, выравнивайте три полосы здоровья и рыбой Gebbo выбирайте безопасный порядок ультимейтов."),
    pull: tx("Bloodlust: on pull", "Героизм: на пулле"),
    layout: "triangle",
    positioning: tx("Keep Nama with only one other boss; never stack all three. Melee bait Shell Spin outward while ranged reserve edge space for bombs and Frostfire pools.", "Держите Nama только с одним боссом; не стакайте всех троих. Мили уводят Shell Spin наружу, рдд оставляют край под бомбы и Frostfire-лужи."),
    roles: {
      tank: [tx("Swap after Shredding Shards and rotate Nama between Gebbo and Iku.", "Меняйтесь после Shredding Shards и водите Nama между Gebbo и Iku."), tx("Never bring all three within United Defense range.", "Никогда не сводите всех троих в радиус United Defense.")],
      healer: [tx("Plan cooldowns for Frostfire pool clears.", "Планируйте сейвы на очистку Frostfire-луж."), tx("Top Mighty Thud targets before the leap sequence.", "Поднимайте цели Mighty Thud до серии прыжков.")],
      dps: [tx("Interrupt Icebound Flames and break junk crates on schedule.", "Прерывайте Icebound Flames и ломайте ящики по плану."), tx("Feed at 90–95 energy: Gebbo → Nama → Iku.", "Кормите на 90–95 энергии: Gebbo → Nama → Iku.")],
    },
    timeline: [
      { marker: "PULL", title: tx("Two-target cleave", "Клив двух целей"), detail: tx("Balance all three bosses; control Shell Spin.", "Выравнивайте всех троих; контролируйте Shell Spin.") },
      { marker: "90", title: tx("Grab Fish", "Grab Fish"), detail: tx("Break a crate and feed the planned explorer.", "Сломайте ящик и накормите выбранного исследователя.") },
      { marker: "G", title: tx("Gebbo ultimate", "Ультимейт Gebbo"), detail: tx("Edge bombs; enter mushrooms after Blast Wave.", "Бомбы на край; входите в грибы после Blast Wave.") },
      { marker: "N/I", title: tx("Nama then Iku", "Nama, затем Iku"), detail: tx("Alternate leap soaks, then clear opposite Frostfire pools.", "Чередуйте прыжковые соки, затем чистите противоположные Frostfire-лужи.") },
    ],
    difficulty: {
      normal: { headline: tx("Control the ultimate order", "Контролируйте порядок ультимейтов"), changes: [tx("Use Gebbo → Nama → Iku for predictable space.", "Используйте Gebbo → Nama → Iku ради предсказуемого пространства."), tx("Balance three separate health bars.", "Выравнивайте три отдельные полосы здоровья.")] },
      heroic: { headline: tx("Soak teams and pool discipline", "Группы соков и дисциплина луж"), changes: [tx("Alternate two teams for Mighty Thud sets.", "Чередуйте две группы для серий Mighty Thud."), tx("Clearing opposite Frostfire pools deals raid damage.", "Очистка противоположных Frostfire-луж наносит урон рейду.")] },
      mythic: { headline: tx("Every crate becomes a raid decision", "Каждый ящик становится решением рейда"), changes: [tx("Breaking a crate applies Splinters raid-wide.", "Разрушение ящика накладывает Splinters на весь рейд."), tx("An unopened crate ruptures after 25 seconds.", "Неоткрытый ящик взрывается через 25 секунд.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Favor cleave without losing priority damage.", "Нужен клив без потери приоритетного урона.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Two balanced Mighty Thud teams.", "Две равные группы Mighty Thud.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign crate breaks and healing CDs by wave.", "Назначьте открытие ящиков и хил-сейвы по волнам.") },
    },
    source: "https://www.icy-veins.com/wow/lost-explorers-raid-guide",
  },
  {
    slug: "vashnik-the-malignant",
    number: 4,
    name: "Vashnik the Malignant",
    type: tx("Add control · rotating arena", "Контроль аддов · ротация по арене"),
    summary: tx("Steer which two fountains Vashnik imbibes, then kill every venom add before it reaches the Malignant Cavity.", "Управляйте двумя фонтанами для Imbibe и убивайте всех ядовитых аддов до их входа в Malignant Cavity."),
    pull: tx("Bloodlust: on pull", "Героизм: на пулле"),
    layout: "center",
    positioning: tx("Tank Vashnik between the next two fountains and rotate around the central cavity. Keep ranged spread for Catalytic Bile while preserving add-control lanes.", "Танкуйте Vashnik между следующими двумя фонтанами и вращайтесь вокруг центральной впадины. Рдд стоят рассредоточенно под Catalytic Bile, сохраняя коридоры контроля аддов."),
    roles: {
      tank: [tx("Swap after every Dripping Fangs.", "Меняйтесь после каждого Dripping Fangs."), tx("Move the boss far enough to lock the intended fountain pair.", "Уводите босса достаточно далеко, чтобы зафиксировать нужную пару фонтанов.")],
      healer: [tx("Top Exploding Infection before the target leaves; clear Stygian absorbs.", "Поднимайте цель Exploding Infection до выхода; снимайте абсорб Stygian."), tx("For Siphoning Infection, allies inside the circle supply health.", "При Siphoning Infection союзники внутри круга отдают здоровье.")],
      dps: [tx("Priority: Burning → Clotting → Shrouded Venoms.", "Приоритет: Burning → Clotting → Shrouded Venoms."), tx("Grip, root and knock adds away from the central cavity.", "Притягивайте, рутайте и отбрасывайте аддов от центра.")],
    },
    timeline: [
      { marker: "PULL", title: tx("Fire + Shadow", "Огонь + Тьма"), detail: tx("Stack Burning Venoms onto rooted Shrouded adds.", "Сводите Burning Venoms к зафиксированным Shrouded-аддам.") },
      { marker: "~1:30", title: tx("Fire + Blood", "Огонь + Кровь"), detail: tx("Move burning adds to Clotting Venom and control splits.", "Ведите огненных аддов к Clotting Venom и контролируйте деления.") },
      { marker: "~3:00", title: tx("Blood + Shadow", "Кровь + Тьма"), detail: tx("Kill Blood first while Shadow adds remain rooted.", "Сначала убейте Blood, пока Shadow-адды стоят в контроле.") },
      { marker: "LOOP", title: tx("Repeat empowered cycle", "Повтор усиленного цикла"), detail: tx("Never let an add touch the cavity.", "Не позволяйте ни одному адду войти в центр.") },
    ],
    difficulty: {
      normal: { headline: tx("Learn the three fountain pairs", "Освойте три пары фонтанов"), changes: [tx("Rotate Fire+Shadow → Fire+Blood → Blood+Shadow.", "Чередуйте Огонь+Тьма → Огонь+Кровь → Кровь+Тьма."), tx("Aim Plague Wave away from the group.", "Направляйте Plague Wave от группы.")] },
      heroic: { headline: tx("Every player helps cover Bile", "Каждый игрок помогает закрывать Bile"), changes: [tx("Catalytic Bile creates individual soak zones.", "Catalytic Bile создаёт персональные зоны для сока."), tx("Killing both Burning Venoms together can make Caustic Surge lethal.", "Одновременное убийство Burning Venoms может сделать Caustic Surge смертельным.")] },
      mythic: { headline: tx("Use Plague Wave to unlock Tumors", "Снимайте защиту Tumors через Plague Wave"), changes: [tx("Imbibe also spawns Malignant Tumors with 99% damage reduction.", "Imbibe также создаёт Malignant Tumors со снижением урона на 99%."), tx("Hit each Tumor with Plague Wave before killing it; a leak applies a stacking one-minute DoT.", "Попадите Plague Wave по каждому Tumor до его убийства; пропущенный адд оставляет минутный стакующийся DoT.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Knockbacks and roots are especially valuable.", "Особенно ценны отбрасывания и руты.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Spread ranged for full soak coverage.", "Рассредоточьте рдд для покрытия соков.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign Plague Wave aimers to each Tumor.", "Назначьте направляющих Plague Wave на каждый Tumor.") },
    },
    source: "https://www.icy-veins.com/wow/vashnik-raid-guide/",
  },
  {
    slug: "sszorak",
    number: 5,
    name: "Sszorak",
    type: tx("Knockback puzzle · burn windows", "Головоломка с отбрасыванием · окна бурста"),
    summary: tx("Place cysts opposite the active wind tunnels, survive the five-hit Apex Predator combo, then chain knockbacks through the intermission.", "Ставьте кисты напротив активных аэротруб, переживайте пятиударную серию Apex Predator и цепочкой проходите отбрасывания на переходке."),
    pull: tx("Bloodlust: on pull or first Dig In", "Героизм: на пулле или первом Dig In"),
    layout: "lanes",
    positioning: tx("Mark spots opposite the lit wind tunnels before the pull. Drop one Viscous Cyst per marker and keep the boss away from that reserve lane.", "До пулла отметьте точки напротив горящих аэротруб. Ставьте по одной Viscous Cyst на метку и держите босса в стороне от этого коридора."),
    roles: {
      tank: [tx("Split each Apex Predator combo so each tank takes one Ravage and one Mutilate.", "Делите Apex Predator так, чтобы каждый танк получил по одному Ravage и Mutilate."), tx("Face Ravage away; place Mutilate into the assigned soak team.", "Отворачивайте Ravage; направляйте Mutilate в назначенную группу сока.")],
      healer: [tx("Prepare externals for unpredictable combo order.", "Готовьте внешние сейвы под случайный порядок серии."), tx("Stabilize the raid before each cyst knockback.", "Поднимайте рейд перед каждым отбрасыванием от кисты.")],
      dps: [tx("Drop Venomous Surge on assigned markers only.", "Ставьте Venomous Surge только на назначенные метки."), tx("During Dig In, the boss takes 30% extra damage.", "Во время Dig In босс получает на 30% больше урона.")],
    },
    timeline: [
      { marker: "READ", title: tx("Read wind tunnels", "Считайте аэротрубы"), detail: tx("The active pattern defines cyst placement.", "Активный рисунок определяет расстановку кист.") },
      { marker: "x5", title: tx("Apex Predator", "Apex Predator"), detail: tx("Two Ravages, two Mutilates, one Tempest in random order.", "Два Ravage, два Mutilate и один Tempest в случайном порядке.") },
      { marker: "DROP", title: tx("Venomous Surge", "Venomous Surge"), detail: tx("Create one cyst at each safe marker.", "Создайте по одной кисте на каждой безопасной метке.") },
      { marker: "INT", title: tx("Howling Maelstrom", "Howling Maelstrom"), detail: tx("Chain cyst knockbacks toward center; burn during Dig In.", "Цепочкой летите от кист к центру; бейте во время Dig In.") },
    ],
    difficulty: {
      normal: { headline: tx("Build a clean knockback route", "Постройте чистый маршрут отбрасываний"), changes: [tx("One shared Mutilate group is enough.", "Достаточно одной общей группы Mutilate."), tx("Pair opposite Raging Crosswinds directions.", "Соединяйте пары с противоположными направлениями Raging Crosswinds.")] },
      heroic: { headline: tx("Two alternating Mutilate groups", "Две чередующиеся группы Mutilate"), changes: [tx("Mutilate soakers take 500% more from the next hit.", "Участники сока Mutilate получают на 500% больше урона от следующего удара."), tx("Caustic Claws leaves residue that should be pushed off.", "Caustic Claws оставляет лужи, которые нужно сдуть с платформы.")] },
      mythic: { headline: tx("Stack fourteen, then spread beams", "Соберите четырнадцать, затем разведите лучи"), changes: [tx("Fourteen players stack on the Serpent’s Fury target to trigger the charge.", "Четырнадцать игроков стакаются на цели Serpent’s Fury, чтобы вызвать рывок."), tx("After To the Slaughter, spread Virulence beams; Crosswinds uses four directions.", "После To the Slaughter разведите лучи Virulence; Crosswinds работает в четырёх направлениях.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Mobile classes recover from knockbacks easily.", "Мобильные классы проще исправляют отбрасывания.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Create two equal Mutilate teams.", "Соберите две равные группы Mutilate.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Fourteen-player Fury stack is mandatory.", "Стак из 14 игроков на Fury обязателен.") },
    },
    source: "https://www.icy-veins.com/wow/sszorak-raid-guide/",
  },
  {
    slug: "the-twin-fangs",
    number: 6,
    name: "The Twin Fangs",
    type: tx("Dual boss · venom stacks", "Два босса · стаки яда"),
    summary: tx("Balance Vexhul and Ithraz, manage permanent Eternal Venom stacks, and spend those stacks safely in Ravenous Feast soaks.", "Выравнивайте здоровье Vexhul и Ithraz, контролируйте постоянные стаки Eternal Venom и безопасно снимайте их в соках Ravenous Feast."),
    pull: tx("Bloodlust: on pull", "Героизм: на пулле"),
    layout: "edge",
    positioning: tx("Keep bosses close enough for cleave while preserving the middle for adds. Drop Coiling Ichor tightly along the edge and circle with Vile Flood during intermissions.", "Держите боссов достаточно близко для клива, оставляя центр под аддов. Компактно ставьте Coiling Ichor по краю и двигайтесь вместе с Vile Flood на переходках."),
    roles: {
      tank: [tx("Always maintain melee range; swap after every Stone Breaker set.", "Всегда оставайтесь в мили; меняйтесь после каждой серии Stone Breaker."), tx("Soak all three Stone Breaker impacts in their spawn order.", "Сокните все три удара Stone Breaker в порядке появления.")],
      healer: [tx("Track Eternal Venom and Feasted before assigning soaks.", "Следите за Eternal Venom и Feasted перед назначением соков."), tx("Cover Venomous Emergence and intermission overlaps.", "Закрывайте Venomous Emergence и наложения на переходке.")],
      dps: [tx("Hard-swap to the three Spawn of Vexhul in the center.", "Сразу переключайтесь в трёх Spawn of Vexhul в центре."), tx("Keep both bosses even; low-stack players soak Caustic Globules.", "Держите боссов ровно; игроки с малыми стаками сокают Caustic Globule.")],
    },
    timeline: [
      { marker: "MAIN", title: tx("Build and spend venom", "Набор и снятие яда"), detail: tx("Soak globules, kill center adds, drop edge pools.", "Сокайте сферы, убивайте аддов в центре, ставьте лужи на край.") },
      { marker: "x3", title: tx("Ravenous Feast", "Ravenous Feast"), detail: tx("Three split hits remove one venom stack each.", "Три распределённых удара снимают по одному стаку яда.") },
      { marker: "INT", title: tx("Submerge", "Submerge"), detail: tx("Follow the rotating Vile Flood beam and dodge Sanguine Storm.", "Двигайтесь с вращающимся Vile Flood и уклоняйтесь от Sanguine Storm.") },
      { marker: "~8:00", title: tx("Room enrage", "Энрейдж арены"), detail: tx("Third main phase exhausts the available floor space.", "К третьей основной фазе свободное место заканчивается.") },
    ],
    difficulty: {
      normal: { headline: tx("Use Feast to reset venom stacks", "Снимайте яд через Feast"), changes: [tx("The same players may soak multiple Feast hits.", "Одни и те же игроки могут сокать несколько ударов Feast."), tx("Low-stack players collect Caustic Globules.", "Игроки с малыми стаками собирают Caustic Globule.")] },
      heroic: { headline: tx("Three exclusive Feast teams", "Три отдельные группы Feast"), changes: [tx("Feasted prevents a player from taking another hit in the sequence.", "Feasted не позволяет игроку принять следующий удар серии."), tx("Ten Eternal Venom stacks are lethal; gore slows movement by 60%.", "Десять стаков Eternal Venom смертельны; gore замедляет на 60%.")] },
      mythic: { headline: tx("Interrupt shields and post-soaks", "Прерывайте щиты и досоки"), changes: [tx("Interrupt Barbed Bulwark before anyone collects a globule.", "Прервите Barbed Bulwark до того, как кто-либо заберёт сферу."), tx("Rouse the Brood adds need assigned kicks; each Feast group immediately soaks Tainted Blood.", "Аддам Rouse the Brood нужны назначенные прерывания; каждая Feast-группа сразу сокает Tainted Blood.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 3, dps: 15, note: tx("Strong two-target cleave is ideal.", "Идеален сильный клив двух целей.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Pre-build three Feast soak teams.", "Заранее соберите три группы Feast.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign an interrupt to every Brood spawn.", "Назначьте прерывание на каждый Brood-адд.") },
    },
    source: "https://www.icy-veins.com/wow/twin-fangs-raid-guide",
  },
  {
    slug: "the-coiled-altar",
    number: 7,
    name: "The Coiled Altar",
    type: tx("Three phases · two bosses", "Три фазы · два босса"),
    summary: tx("Consolidate venom for Zul’jan’s Sever, break Malacrass’s mind controls, then stack both bosses and kill them together.", "Собирайте яд под Sever Зул’джана, ломайте контроль Малакрасса, затем сведите обоих боссов и убейте одновременно."),
    pull: tx("Bloodlust: empowered Zul’jan intermission", "Героизм: усиленная переходка Зул’джана"),
    layout: "center",
    positioning: tx("Stack loosely near the middle. Assign a venom depot clear of Axegrinder paths; in Phase 2 stack on one side of Malacrass and gather manifestations in the center.", "Держитесь рыхлым стаком у центра. Назначьте склад яда вне путей Axegrinder; во второй фазе стойте с одной стороны Малакрасса и собирайте проявления в центре."),
    roles: {
      tank: [tx("Aim Sever and Soul Sever through every prepared target, then swap.", "Направляйте Sever и Soul Sever через все подготовленные цели, затем меняйтесь."), tx("Stack both bosses in Phase 3 and balance health.", "В третьей фазе сведите боссов и выравнивайте здоровье.")],
      healer: [tx("Dispel Venomfang and cover grouped orb detonations.", "Снимайте Venomfang и закрывайте групповые взрывы сфер."), tx("Watch raid health before Fragment of Malacrass soaks.", "Проверяйте здоровье рейда перед соками Fragment of Malacrass.")],
      dps: [tx("Assigned mobile players collect and stack Coalesced Venom.", "Назначенные мобильные игроки собирают Coalesced Venom в одну точку."), tx("Break mind-control shields; interrupt Soulcoilers and Eternal Nightfall.", "Ломайте щиты контроля; прерывайте Soulcoiler и Eternal Nightfall.")],
    },
    timeline: [
      { marker: "P1", title: tx("Zul’jan", "Зул’джан"), detail: tx("Collect venom, clear with Sever, alternate Guillotine soaks.", "Собирайте яд, чистите Sever, чередуйте соки Guillotine.") },
      { marker: "P2", title: tx("Malacrass", "Малакрасс"), detail: tx("Break mind control and line manifestations for Soul Sever.", "Ломайте контроль и выстраивайте проявления под Soul Sever.") },
      { marker: "INT", title: tx("Fragment bargain", "Сделка с фрагментами"), detail: tx("Bloodlust into 100% damage taken; soak only while stable.", "Героизм под +100% входящего урона; сокайте только при полном здоровье.") },
      { marker: "P3", title: tx("Coiled together", "Вместе у алтаря"), detail: tx("Both bosses repeat mechanics and must die together.", "Оба босса повторяют механики и должны умереть вместе.") },
    ],
    difficulty: {
      normal: { headline: tx("Build one controlled venom depot", "Создайте один контролируемый склад яда"), changes: [tx("Sever destroys every orb in its cone.", "Sever уничтожает все сферы в конусе."), tx("At least five players soak Guillotine.", "Guillotine сокают минимум пять игроков.")] },
      heroic: { headline: tx("Alternate Guillotine teams", "Чередуйте группы Guillotine"), changes: [tx("Guillotined increases damage from another Guillotine by 500%.", "Guillotined увеличивает урон следующего Guillotine на 500%."), tx("Venom Rupture becomes a stacking DoT—do not clear too many orbs together.", "Venom Rupture становится стакующимся DoT — не взрывайте слишком много сфер одновременно.")] },
      mythic: { headline: tx("Mutated venom changes collection", "Мутировавший яд меняет сбор"), changes: [tx("Kill Virulent Cysts before they spawn more orbs every six seconds.", "Убивайте Virulent Cyst до новых сфер каждые шесть секунд."), tx("Mutation carriers stay 8 yards from allies and other venom; Tainted Blood prevents rapid repeat drops.", "Носители Mutation держатся в 8 метрах от союзников и яда; Tainted Blood запрещает быстрые повторные сбросы.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 4, dps: 14, note: tx("Mobile collectors and frequent interrupts help.", "Полезны мобильные сборщики и частые прерывания.") },
      heroic: { tanks: 2, healers: 4, dps: 14, note: tx("Two Guillotine groups of at least five.", "Две группы Guillotine минимум по пять человек.") },
      mythic: { tanks: 2, healers: 4, dps: 14, note: tx("Assign Cyst swaps and Mutation lanes.", "Назначьте переключения в Cyst и коридоры Mutation.") },
    },
    source: "https://www.icy-veins.com/wow/coiled-altar-raid-guide",
  },
  {
    slug: "ulatek",
    number: 8,
    name: "Ula’tek",
    type: tx("Three phases · eggs · collapsing platforms", "Три фазы · яйца · разрушающиеся платформы"),
    summary: tx("Carry eggs safely through venom waves, split for the outer corridors, then rotate across collapsing platforms for the final Heart burn.", "Защищайте яйца от волн яда, разделитесь по внешним коридорам, затем вращайтесь по разрушающимся платформам к финальному бурсту в Heart."),
    pull: tx("Bloodlust: first exposed Heart", "Героизм: первое открытие Heart"),
    layout: "platforms",
    positioning: tx("Pre-split into two equal teams. In Phase 3, melee stay on Ula’tek while ranged and healers take the platform immediately counter-clockwise; all groups rotate left before each break.", "Заранее разделитесь на две равные команды. В третьей фазе мили остаются на Ula’tek, а рдд и хилы занимают платформу сразу против часовой стрелки; перед каждым разрушением все смещаются влево."),
    roles: {
      tank: [tx("One tank must remain in melee range of Ula’tek and one in range of her tail.", "Один танк всегда в мили у Ula’tek, второй — в радиусе хвоста."), tx("After Mother’s Wrath, return to the red pool; swap during Caustic Waves.", "После Mother’s Wrath вернитесь в красную лужу; меняйтесь во время Caustic Waves.")],
      healer: [tx("Cover paired tether breaks and every Spectral Coils soak.", "Закрывайте разрывы тросов парами и каждый сок Spectral Coils."), tx("In Phase 3, anchor the healer Serpent’s Bite group in the middle.", "В третьей фазе держите группу Healer Serpent’s Bite по центру.")],
      dps: [tx("Carry every egg into Spectral Coils; never let a wave touch it.", "Несите каждое яйцо в Spectral Coils; не позволяйте волне коснуться его."), tx("Prioritize Wardens, Weakened Doomscales and Shriekers; interrupt Anguished Cry and Vicious Echoes.", "Приоритет — Warden, Weakened Doomscale и Shrieker; прерывайте Anguished Cry и Vicious Echoes.")],
    },
    timeline: [
      { marker: "P1", title: tx("Eggs and waves", "Яйца и волны"), detail: tx("Carry eggs into Coils; dodge alternating Caustic Waves.", "Несите яйца в Coils; уклоняйтесь от чередующихся Caustic Waves.") },
      { marker: "HEART", title: tx("Rage of the Shackled", "Rage of the Shackled"), detail: tx("Bloodlust before the 20-second double-damage Heart window.", "Героизм перед 20-секундным окном двойного урона в Heart.") },
      { marker: "P2", title: tx("Two outer corridors", "Два внешних коридора"), detail: tx("Kill Wardens, break tethers in pairs, deliver small eggs then the large egg.", "Убейте Warden, рвите тросы парами, сдайте малые яйца, затем большое.") },
      { marker: "INT", title: tx("Six alternating slams", "Шесть чередующихся ударов"), detail: tx("Teams soak 1/3/5 and 2/4/6; leave the center before shatter.", "Команды сокают 1/3/5 и 2/4/6; уйдите из центра до раскола.") },
      { marker: "P3", title: tx("Four-platform rotation", "Ротация четырёх платформ"), detail: tx("Soak three Bite groups, spread Purge, move left before Circling Prey.", "Сокните три группы Bite, разведите Purge и уйдите влево до Circling Prey.") },
    ],
    difficulty: {
      normal: { headline: tx("Protect every egg from venom", "Защитите каждое яйцо от яда"), changes: [tx("Both Spectral Coils can be soaked by the full raid.", "Оба Spectral Coils может сокать весь рейд."), tx("Use mobility to reach both outer corridors.", "Используйте мобильность для выхода в оба внешних коридора.")] },
      heroic: { headline: tx("Two teams own the entire fight", "Две группы ведут весь бой"), changes: [tx("Each Phase 1 Coil belongs to one assigned team.", "Каждый Coil в первой фазе принадлежит одной назначенной группе."), tx("Alternate intermission slams 1/3/5 and 2/4/6; Phase 3 uses melee, ranged and healer Bite groups.", "Чередуйте удары 1/3/5 и 2/4/6; в третьей фазе нужны группы Bite для мили, рдд и хилов.")] },
      mythic: { headline: tx("Strategy still being verified", "Стратегия ещё проверяется"), changes: [tx("Reliable public Mythic strategy was not available at the last review.", "На момент последней проверки надёжной публичной Mythic-стратегии ещё не было."), tx("Use the Heroic structure as preparation; expect assignments and tuning to change after verified kills.", "Готовьтесь по структуре Heroic; назначения и числа изменятся после подтверждённых убийств.")] },
    },
    composition: {
      normal: { tanks: 2, healers: 4, dps: 14, note: tx("Two balanced corridor teams.", "Две равные группы для коридоров.") },
      heroic: { tanks: 2, healers: 5, dps: 13, note: tx("Safer for progression; split healing 2/3 across corridors.", "Безопаснее для прогресса; распределите хилов 2/3 по коридорам.") },
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
