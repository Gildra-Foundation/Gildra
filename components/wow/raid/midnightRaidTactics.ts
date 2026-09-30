export type LocalizedText = { ru: string; en: string };

export type TacticalZone = {
  kind: "danger" | "safe" | "soak" | "wall";
  x: number;
  y: number;
  width: number;
  height: number;
  label: LocalizedText;
  rotate?: number;
};

export type TacticalMarker = {
  kind: "boss" | "add" | "objective";
  x: number;
  y: number;
  label: LocalizedText;
};

export type TacticalAssignment = {
  memberId: string;
  x: number;
  y: number;
  position: LocalizedText;
  ability: string;
  task: LocalizedText;
};

export type TacticalPhase = {
  id: string;
  name: LocalizedText;
  summary: LocalizedText;
  layout: "circle" | "grid" | "lane" | "split" | "ring";
  assignments: TacticalAssignment[];
  markers: TacticalMarker[];
  zones: TacticalZone[];
  priorities: LocalizedText[];
  dangers: LocalizedText[];
  steps: LocalizedText[];
};

export type RaidTactic = {
  source: string;
  phases: TacticalPhase[];
};

const l = (ru: string, en: string): LocalizedText => ({ ru, en });
const a = (memberId: string, x: number, y: number, position: LocalizedText, ability: string, task: LocalizedText): TacticalAssignment => ({ memberId, x, y, position, ability, task });
const m = (kind: TacticalMarker["kind"], x: number, y: number, label: LocalizedText): TacticalMarker => ({ kind, x, y, label });
const z = (kind: TacticalZone["kind"], x: number, y: number, width: number, height: number, label: LocalizedText, rotate = 0): TacticalZone => ({ kind, x, y, width, height, label, rotate });

export const midnightRaidTactics: Record<string, RaidTactic> = {
  "imperator-averzian": {
    source: "https://www.icy-veins.com/wow/imperator-averzian-raid-guide",
    phases: [
      {
        id: "grid",
        name: l("Фаза 1 · Поле 3×3", "Phase 1 · 3×3 grid"),
        summary: l("Выберите две клетки под Umbral Collapse. Третья останется порталом — не допускайте трех порталов в ряд.", "Choose two cells for Umbral Collapse. The third becomes a portal—never allow three portals in a row."),
        layout: "grid",
        assignments: [
          a("vexis", 50, 45, l("Центр, лицом от рейда", "Centre, facing away"), "Shield Wall", l("Веди Аверзиана в выбранную клетку; меняйся примерно на 8 Blackening Wounds.", "Move Averzian into the called cell; swap near 8 Blackening Wounds.")),
          a("mystic", 39, 69, l("За группой замачивания", "Behind the soak group"), "Spirit Link Totem", l("Закрой второй Umbral Collapse и подготовь лечение к Dark Upheaval.", "Cover the second Umbral Collapse and prepare for Dark Upheaval.")),
          a("nova", 36, 50, l("Левая грань замачивания", "Left edge of soak"), "Arcane Surge", l("Вместе с рейдом замочи первого Voidshaper, затем переключись в уцелевшего адда.", "Soak the first Voidshaper with the raid, then swap to the surviving add.")),
          a("grave", 57, 53, l("Мили у выбранного адда", "Melee on the called add"), "Death Grip", l("Держись в замачивании и подтягивай появившихся аддов к боссу.", "Stay in the soak and grip spawned adds toward the boss.")),
          a("wind", 65, 68, l("Правая грань замачивания", "Right edge of soak"), "Primal Rage", l("Bloodlust на старте; затем приоритет Voidshaper и контроль края поля.", "Bloodlust on pull; then prioritize Voidshaper and watch the grid edge.")),
        ],
        markers: [m("boss", 50, 37, l("Аверзиан", "Averzian")), m("add", 29, 30, l("Voidshaper A", "Voidshaper A")), m("add", 50, 66, l("Voidshaper B", "Voidshaper B")), m("add", 71, 30, l("Voidshaper C", "Voidshaper C"))],
        zones: [z("soak", 38, 52, 24, 23, l("Umbral Collapse", "Umbral Collapse")), z("danger", 66, 16, 23, 22, l("Не оставлять 3 в ряд", "Never make 3 in a row"))],
        priorities: [l("Abyssal Voidshaper в объявленной клетке", "Called Abyssal Voidshaper"), l("После двух замачиваний — уцелевший адд", "Surviving add after two soaks"), l("Затем босс", "Then the boss")],
        dangers: [l("Три соседних портала запускают March of the Endless", "Three adjacent portals trigger March of the Endless"), l("Не держите босса на уже занятой клетке", "Do not tank the boss on a claimed cell")],
        steps: [l("РЛ отмечает две безопасные клетки.", "Raid lead calls two safe cells."), l("Рейд вместе переносит два Umbral Collapse на Voidshaper.", "Raid moves two Umbral Collapse soaks onto Voidshapers."), l("Добейте оставшуюся цель и запомните клетку портала.", "Finish the remaining target and remember its portal cell.")],
      },
      {
        id: "intermission",
        name: l("Переходка · Бесконечный марш", "Intermission · Endless march"),
        summary: l("Соберите аддов у танка, прерывайте Pitch Bulwark и не пересекайте лучи порталов.", "Stack adds on the tank, interrupt Pitch Bulwark, and avoid portal beams."),
        layout: "grid",
        assignments: [
          a("vexis", 50, 42, l("Центр пачки", "Centre of the pack"), "Disrupting Shout", l("Собери всех аддов не ближе 10 м к боссу.", "Collect all adds at least 10 yards from the boss.")),
          a("mystic", 50, 70, l("За пачкой", "Behind the pack"), "Ascendance", l("Подними рейд после Dark Upheaval; не стой на линии портала.", "Recover the raid after Dark Upheaval; stay off portal lines.")),
          a("nova", 31, 55, l("Слева от пачки", "Left of the pack"), "Counterspell", l("Первый Pitch Bulwark; бёрст в Endwalker.", "First Pitch Bulwark; burst the Endwalker.")),
          a("grave", 45, 50, l("Мили", "Melee"), "Mind Freeze", l("Второй Pitch Bulwark и Death Grip отставшего адда.", "Second Pitch Bulwark and grip any loose add.")),
          a("wind", 69, 55, l("Справа от пачки", "Right of the pack"), "Counter Shot", l("Третий Pitch Bulwark; добей бегущего к занятой клетке Voidmaw.", "Third Pitch Bulwark; finish any Voidmaw running to a claimed cell.")),
        ],
        markers: [m("boss", 50, 21, l("Аверзиан", "Averzian")), m("add", 50, 45, l("Адды", "Adds")), m("objective", 20, 20, l("Портал", "Portal")), m("objective", 80, 80, l("Портал", "Portal"))],
        zones: [z("danger", 10, 47, 80, 7, l("Луч портала", "Portal beam"), 24), z("safe", 35, 34, 30, 30, l("Зона боя", "Kill zone"))],
        priorities: [l("Endwalker / Voidshaper", "Endwalker / Voidshaper"), l("Voidmaw до рывка в портал", "Voidmaw before it reaches a portal"), l("Остальные адды", "Remaining adds")],
        dangers: [l("Луч портала и возвращающиеся копья Oblivion's Wrath", "Portal beam and returning Oblivion's Wrath lances"), l("Pitch Bulwark нельзя пропускать", "Pitch Bulwark must be interrupted")],
        steps: [l("Соберите аддов в центре свободной клетки.", "Stack adds in the centre of a free cell."), l("Распределите три прерывания по очереди.", "Rotate three assigned interrupts."), l("Разойдитесь с траекторий, затем добейте пачку.", "Clear the trajectories, then finish the pack.")],
      },
    ],
  },
  vorasius: {
    source: "https://www.icy-veins.com/wow/vorasius-raid-guide",
    phases: [
      {
        id: "boss",
        name: l("Фаза 1 · Центр арены", "Phase 1 · Arena centre"),
        summary: l("Вся группа играет плотной дугой перед боссом. Танк в одиночку принимает Shadowclaw Slam, затем все заходят в безопасное кольцо Aftershock.", "The raid plays in a tight arc in front. The tank solos Shadowclaw Slam, then everyone moves into the safe Aftershock ring."),
        layout: "lane",
        assignments: [
          a("vexis", 50, 38, l("Перед боссом", "In front of boss"), "Shield Wall", l("Прими первые два Slam; большой сейв на второй.", "Take the first two Slams; use a major defensive on the second.")),
          a("mystic", 50, 66, l("Центр рейда", "Raid centre"), "Spirit Link Totem", l("Стак группы под Primordial Roar; Link на поздний Roar.", "Keep the group stacked for Primordial Roar; Link a late Roar.")),
          a("nova", 36, 57, l("Левая часть стака", "Left of stack"), "Mass Barrier", l("Щиты перед Roar, после Slam шагни в безопасное кольцо.", "Shield before Roar, then step into the safe ring after Slam.")),
          a("grave", 45, 48, l("Мили сбоку", "Melee flank"), "Icebound Fortitude", l("Не стой в танковском круге до удара; после удара зайди в кольцо.", "Stay out of the tank circle until impact; then move into the ring.")),
          a("wind", 64, 57, l("Правая часть стака", "Right of stack"), "Aspect of the Turtle", l("Сохраняй мобильность и держись центра — стены сжимают арену.", "Keep mobility ready and remain central as walls close in.")),
        ],
        markers: [m("boss", 50, 20, l("Ненасытникус", "Vorasius")), m("objective", 50, 45, l("Танковский Slam", "Tank Slam"))],
        zones: [z("soak", 40, 34, 20, 21, l("Slam", "Slam")), z("safe", 27, 48, 46, 31, l("Стак рейда", "Raid stack")), z("wall", 3, 9, 13, 82, l("Стена", "Wall")), z("wall", 84, 9, 13, 82, l("Стена", "Wall"))],
        priorities: [l("Босс", "Boss"), l("На переходке — Blistercreep", "Blistercreep during intermission")],
        dangers: [l("Aftershock — ищите разрыв в расходящихся кольцах", "Aftershock—find the gap in the expanding rings"), l("Не стойте в Shadowclaw Slam вместе с танком", "Do not stand in Shadowclaw Slam with the tank")],
        steps: [l("Соберитесь в центре перед боссом.", "Stack in the centre in front of the boss."), l("Танк принимает Slam, рейд готовится к волнам.", "Tank takes Slam while the raid prepares for rings."), l("Все смещаются в разрыв Aftershock и возвращаются в стак.", "Everyone moves through the Aftershock gap and restacks.")],
      },
      {
        id: "walls",
        name: l("Переходка · Разрушение стен", "Intermission · Break the walls"),
        summary: l("Игроки с фиксацией ведут Blistercreep вплотную к левой и правой стене. Убейте их у стены и уходите на сторону, противоположную светящейся руке босса.", "Fixated players pin Blistercreeps to the left and right walls. Kill them on the wall, then move opposite the boss's glowing hand."),
        layout: "lane",
        assignments: [
          a("vexis", 24, 51, l("Левая стена / флоат", "Left wall / flex"), "Shockwave", l("Отведи свою фиксацию в левую стену и помоги собрать аддов.", "Pin your fixate to the left wall and help group adds.")),
          a("mystic", 50, 72, l("Центр между группами", "Centre between groups"), "Ascendance", l("Прожми лечение на одновременные взрывы Blistercreep.", "Use throughput for simultaneous Blistercreep explosions.")),
          a("nova", 20, 41, l("Группа слева", "Left team"), "Arcane Surge", l("Бёрст аддов только когда они вплотную к стене.", "Burst adds only when they are flush against the wall.")),
          a("grave", 80, 41, l("Группа справа", "Right team"), "Death Grip", l("Подтяни правого Blistercreep к стене.", "Grip the right Blistercreep into the wall.")),
          a("wind", 80, 61, l("Группа справа", "Right team"), "Binding Shot", l("Зафиксируй правую группу и добей адда у стены.", "Root the right group and finish the add at the wall.")),
        ],
        markers: [m("boss", 50, 20, l("Ненасытникус", "Vorasius")), m("add", 14, 49, l("Blistercreep", "Blistercreep")), m("add", 86, 49, l("Blistercreep", "Blistercreep"))],
        zones: [z("wall", 3, 8, 12, 84, l("Левая стена", "Left wall")), z("wall", 85, 8, 12, 84, l("Правая стена", "Right wall")), z("danger", 48, 10, 44, 80, l("Void Breath", "Void Breath"))],
        priorities: [l("Blistercreep у стены", "Blistercreep on the wall"), l("Сохранение прохода от Void Breath", "Open a lane for Void Breath")],
        dangers: [l("Адд, взорванный не у стены, оставит проход закрытым", "An add killed away from the wall leaves the path closed"), l("Void Breath: светится правая рука — бегите влево, и наоборот", "Void Breath: right hand glows—run left, and vice versa")],
        steps: [l("Разделитесь на левую и правую группы.", "Split into left and right teams."), l("Прижмите аддов к стенам и только потом убивайте.", "Pin adds against the walls before killing them."), l("Считайте руку босса и уходите на противоположный край.", "Read the boss's hand and move to the opposite edge.")],
      },
    ],
  },
  "fallen-king-salhadaar": {
    source: "https://www.icy-veins.com/wow/fallen-king-salhadaar-raid-guide",
    phases: [
      {
        id: "control",
        name: l("Фаза 1 · Контроль пространства", "Phase 1 · Space control"),
        summary: l("Орбы — абсолютный приоритет. Убивайте их поочередно, контролируйте Fractured Projection и выносите Shattering Twilight к краю.", "Orbs are the absolute priority. Kill them one at a time, control Fractured Projections, and drop Shattering Twilight at the edge."),
        layout: "circle",
        assignments: [
          a("vexis", 50, 38, l("Босс у края", "Boss near the edge"), "Shield Wall", l("Разворачивай босса от центра и веди его от орб; меняйся около 8 стаков.", "Face the boss away from centre and kite from orbs; swap near 8 stacks.")),
          a("mystic", 50, 68, l("Дальний центр", "Ranged centre"), "Purify Spirit", l("Сними Despotic Command только после выхода игрока; вылечи поглощение.", "Dispel Despotic Command only after the player moves out; heal the absorb.")),
          a("nova", 29, 51, l("Сектор слева", "Left sector"), "Counterspell", l("Контроль левого Projection и бёрст ближайшей орбы.", "Control the left Projection and burst the nearest orb.")),
          a("grave", 44, 47, l("Мили за боссом", "Melee behind boss"), "Blinding Sleet", l("Сбивай Shadow Fracture и помогай на орбах без одновременного добивания.", "Stop Shadow Fracture and help on orbs without killing them together.")),
          a("wind", 71, 51, l("Сектор справа", "Right sector"), "Counter Shot", l("Контроль правого Projection; немедленно меняй цель на орбу.", "Control the right Projection; immediately swap to each orb.")),
        ],
        markers: [m("boss", 50, 27, l("Салхадаар", "Salhadaar")), m("add", 18, 40, l("Орба", "Orb")), m("add", 82, 40, l("Орба", "Orb")), m("add", 26, 74, l("Projection", "Projection")), m("add", 74, 74, l("Projection", "Projection"))],
        zones: [z("danger", 6, 72, 20, 18, l("Twilight", "Twilight")), z("safe", 31, 39, 38, 37, l("Рабочая зона", "Working area"))],
        priorities: [l("Concentrated Void, по одной", "Concentrated Void, one at a time"), l("Fractured Projection: interrupt / CC", "Fractured Projection: interrupt / CC"), l("Босс", "Boss")],
        dangers: [l("Не убивайте крупные орбы одновременно — Dark Radiation складывается", "Do not kill large orbs together—Dark Radiation stacks"), l("Shattering Twilight и Despotic Command выносить из группы", "Move Shattering Twilight and Despotic Command out")],
        steps: [l("Танк держит босса сбоку и уводит от траектории орб.", "Tank holds the boss near an edge and away from orb paths."), l("ДПС по команде последовательно убивает орбы.", "DPS kills orbs sequentially on the call."), l("Каждый сектор останавливает свой Projection.", "Each sector stops its assigned Projection.")],
      },
      {
        id: "burn",
        name: l("100 энергии · Бёрст", "100 energy · Burn"),
        summary: l("Салхадаар получает повышенный урон. Стакнитесь сбоку, прожмите Bloodlust и двигайтесь вместе между вращающимися лучами.", "Salhadaar takes increased damage. Stack near an edge, use Bloodlust, and move together between rotating beams."),
        layout: "ring",
        assignments: [
          a("vexis", 50, 34, l("Перед боссом", "In front of boss"), "Rallying Cry", l("Держи босса на краю и дай групповой сейв на входе в фазу.", "Hold the boss at the edge and use raid defensive on phase entry.")),
          a("mystic", 50, 67, l("В центре стака", "Centre of stack"), "Spirit Link Totem", l("Link на пик Entropic Unraveling.", "Link the peak of Entropic Unraveling.")),
          a("nova", 40, 57, l("Левая часть стака", "Left of stack"), "Time Warp", l("Bloodlust и полный Arcane Surge в окно повышенного урона.", "Bloodlust and full Arcane Surge in the damage amp.")),
          a("grave", 45, 44, l("Мили", "Melee"), "Anti-Magic Zone", l("AMZ под группой, не отставай от вращения.", "AMZ under the group; keep pace with rotation.")),
          a("wind", 60, 57, l("Правая часть стака", "Right of stack"), "Call of the Wild", l("Полный бёрст, двигайся вместе с рейдом.", "Full burst while moving with the raid.")),
        ],
        markers: [m("boss", 50, 23, l("Салхадаар", "Salhadaar")), m("objective", 50, 52, l("Стак", "Stack"))],
        zones: [z("danger", 47, 3, 7, 94, l("Вращающийся луч", "Rotating beam"), 38), z("safe", 34, 42, 32, 32, l("Двигаться вместе", "Move together"))],
        priorities: [l("Салхадаар — все атакующие кулдауны", "Salhadaar—all damage cooldowns")],
        dangers: [l("Не пересекайте вращающийся луч", "Do not cross the rotating beam"), l("Высокий периодический урон по всему рейду", "Heavy periodic raid damage")],
        steps: [l("Соберитесь на отмеченной стороне до 100 энергии.", "Stack on the marked side before 100 energy."), l("Bloodlust, групповые сейвы и бурст одновременно.", "Bloodlust, raid defensives, and burst together."), l("Вращайтесь одной группой вслед за безопасным сектором.", "Rotate as one group with the safe sector.")],
      },
    ],
  },
  "vaelgor-ezzorak": {
    source: "https://www.icy-veins.com/wow/vaelgor-and-ezzorak-raid-guide",
    phases: [
      {
        id: "dragons",
        name: l("Фаза 1 · Два дракона", "Phase 1 · Twin dragons"),
        summary: l("Держите боссов дальше 15 м. Gloom направляйте к краю и замачивайте группой; Nullbeam делите с танком; орбы — приоритет.", "Keep bosses over 15 yards apart. Aim Gloom at the edge and group-soak it; share Nullbeam with the tank; kill orbs first."),
        layout: "split",
        assignments: [
          a("vexis", 29, 38, l("Танк Ваэлгора", "Vaelgor tank"), "Spell Reflection", l("Держи дракона слева, дыхание — наружу; после Gloom переходи к другому боссу.", "Hold the dragon left, breath outward; swap bosses after Gloom.")),
          a("mystic", 50, 70, l("Между группами", "Between groups"), "Tremor Totem", l("Снимай Dread Breath и готовь лечение на выход из Nullzone.", "Clear Dread Breath fear and prepare for the Nullzone exit.")),
          a("nova", 24, 60, l("Группа Nullbeam", "Nullbeam team"), "Arcane Surge", l("Помоги танку замочить Nullbeam, затем уничтожай Void Orbs.", "Help the tank soak Nullbeam, then destroy Void Orbs.")),
          a("grave", 69, 48, l("Группа Gloom", "Gloom team"), "Anti-Magic Shell", l("Стой на траектории Gloom; AMS на Dread Breath.", "Stand in the Gloom path; AMS Dread Breath.")),
          a("wind", 77, 62, l("Дальний справа", "Ranged right"), "Aspect of the Turtle", l("Четвертый замачивающий Gloom и приоритет появившихся орб.", "Fourth Gloom soaker and priority on spawned orbs.")),
        ],
        markers: [m("boss", 28, 24, l("Ваэлгор", "Vaelgor")), m("boss", 72, 24, l("Эззорак", "Ezzorak")), m("add", 50, 48, l("Void Orb", "Void Orb"))],
        zones: [z("soak", 64, 26, 31, 12, l("Gloom к краю", "Gloom to edge"), 27), z("danger", 5, 9, 18, 27, l("Dread Breath", "Dread Breath"), -20), z("safe", 18, 42, 64, 36, l("Раздельные группы", "Split groups"))],
        priorities: [l("Void Orbs из Void Howl", "Void Orbs from Void Howl"), l("Босс своей стороны", "Assigned boss")],
        dangers: [l("Боссы ближе 15 м усиливают друг друга", "Bosses within 15 yards empower each other"), l("Gloom в центр оставит большую постоянную лужу", "Gloom aimed inward leaves a large permanent pool")],
        steps: [l("Разделите рейд между двумя боссами.", "Split the raid between both bosses."), l("Четыре игрока уменьшают Gloom по пути к краю.", "Four players shrink Gloom as it travels to the edge."), l("После Gloom танки меняются боссами; орбы убиваются сразу.", "After Gloom, tanks swap bosses; kill orbs immediately.")],
      },
      {
        id: "barrier",
        name: l("Переходка · Radiant Barrier", "Intermission · Radiant Barrier"),
        summary: l("Вся группа входит в барьер и убивает Manifestation of Midnight. Игроки с Shadowmark уходят на внешний край барьера.", "Everyone enters the barrier and kills the Manifestation of Midnight. Shadowmarked players move to its outer edge."),
        layout: "circle",
        assignments: [
          a("vexis", 50, 42, l("Адд в центре", "Add in centre"), "Shield Wall", l("Затанкуй Manifestation в центре барьера.", "Tank the Manifestation in the barrier centre.")),
          a("mystic", 50, 63, l("Центр барьера", "Barrier centre"), "Spirit Link Totem", l("Сохраняй группу плотной; точечно лечи Shadowmark.", "Keep the group tight; spot-heal Shadowmark targets.")),
          a("nova", 37, 53, l("Внутри барьера", "Inside barrier"), "Arcane Surge", l("Полный урон в Manifestation.", "Full damage into the Manifestation.")),
          a("grave", 45, 47, l("Мили", "Melee"), "Anti-Magic Zone", l("AMZ на взрыв Shadowmark.", "AMZ for Shadowmark detonation.")),
          a("wind", 75, 50, l("Край при Shadowmark", "Edge with Shadowmark"), "Aspect of the Turtle", l("Если отмечен — вынеси круг на самый край барьера.", "If marked, place the circle at the barrier edge.")),
        ],
        markers: [m("add", 50, 36, l("Manifestation", "Manifestation")), m("objective", 50, 50, l("Барьер", "Barrier"))],
        zones: [z("safe", 22, 16, 56, 68, l("Radiant Barrier", "Radiant Barrier")), z("danger", 68, 39, 18, 24, l("Shadowmark", "Shadowmark"))],
        priorities: [l("Manifestation of Midnight", "Manifestation of Midnight")],
        dangers: [l("За пределами барьера — смертельный урон", "Outside the barrier is lethal"), l("Shadowmark нельзя взрывать в центре группы", "Never detonate Shadowmark in the group centre")],
        steps: [l("Сразу войдите в Radiant Barrier.", "Enter Radiant Barrier immediately."), l("Соберите Manifestation в центре и прожмите урон.", "Stack the Manifestation in the centre and burn it."), l("Только отмеченные Shadowmark выходят на край.", "Only Shadowmarked players move to the edge.")],
      },
    ],
  },
  "lightblinded-vanguard": {
    source: "https://www.icy-veins.com/wow/lightblinded-vanguard-raid-guide",
    phases: [
      {
        id: "council",
        name: l("Основная фаза · Совет", "Main phase · Council"),
        summary: l("На старте фокус Венел под Avenging Wrath. Разводите троих боссов на 100 энергии, выходите из линий зарядов Сенн и снимайте Sacred Shield.", "Open on Venel during Avenging Wrath. Separate the bosses at 100 energy, avoid Senn's charge line, and break Sacred Shield."),
        layout: "circle",
        assignments: [
          a("vexis", 50, 37, l("Текущая цель", "Current target"), "Shield Wall", l("Свап после Judgment; на 100 энергии уведи активного босса к краю.", "Swap after Judgment; move the active boss to the edge at 100 energy.")),
          a("mystic", 50, 69, l("Центр рейда", "Raid centre"), "Purify Spirit", l("Снимай Avenger's Shield с разошедшихся игроков; сейв на Tyr's Wrath.", "Dispel Avenger's Shield after players spread; cooldown for Tyr's Wrath.")),
          a("nova", 31, 55, l("Дальний слева", "Ranged left"), "Spellsteal", l("Сними щит после Bloodlust и бёрсти Sacred Shield Сенн.", "Remove the shield after Bloodlust and burst Senn's Sacred Shield.")),
          a("grave", 45, 47, l("Мили за целью", "Melee behind target"), "Mind Freeze", l("Первый interrupt Blinding Light после заряда Сенн.", "First interrupt on Blinding Light after Senn's charge.")),
          a("wind", 69, 55, l("Самый дальний", "Farthest player"), "Counter Shot", l("Примани заряд Сенн к внешнему краю; не проводи линию через рейд.", "Bait Senn's charge to the outer edge; keep the line away from raid.")),
        ],
        markers: [m("boss", 50, 27, l("Венел · фокус", "Venel · focus")), m("boss", 25, 33, l("Беллами", "Bellamy")), m("boss", 75, 33, l("Сенн", "Senn"))],
        zones: [z("danger", 70, 30, 24, 8, l("Заряд Сенн", "Senn charge"), 45), z("safe", 27, 43, 46, 35, l("Рейд", "Raid"))],
        priorities: [l("Венел под Avenging Wrath", "Venel during Avenging Wrath"), l("Sacred Shield Сенн", "Senn's Sacred Shield"), l("Затем объявленная цель", "Then the called target")],
        dangers: [l("Разойдитесь с кругами Avenger's Shield до диспела", "Spread Avenger's Shield circles before dispels"), l("Не стойте на линии заряда Сенн", "Stay clear of Senn's charge line")],
        steps: [l("Bloodlust и фокус Венел; щиты боссов снять.", "Bloodlust and focus Venel; remove boss shields."), l("Дальний игрок приманивает Сенн на край.", "Farthest player baits Senn to the edge."), l("Сломайте Sacred Shield и прервите Blinding Light.", "Break Sacred Shield and interrupt Blinding Light.")],
      },
      {
        id: "energy",
        name: l("100 энергии · Развод", "100 energy · Separate"),
        summary: l("Активного босса уводят от остальных. Уклоняйтесь от волн щитов Беллами и готовьте групповые сейвы под сильные рейдовые способности.", "Move the active boss away from the others. Dodge Bellamy's shield waves and prepare raid defensives for heavy raid abilities."),
        layout: "split",
        assignments: [
          a("vexis", 22, 36, l("Активный босс у края", "Active boss at edge"), "Shield Wall", l("Разорви 40-метровую связь с остальными боссами.", "Break the 40-yard link to the other bosses.")),
          a("mystic", 47, 69, l("Средняя дистанция", "Mid range"), "Ascendance", l("Закрой рейдовый урон и держи танка у края.", "Cover raid damage and keep the edge tank alive.")),
          a("nova", 38, 55, l("Свободная полоса", "Open lane"), "Greater Invisibility", l("Пройди между волнами Divine Toll и продолжай фокус.", "Move between Divine Toll waves and maintain focus.")),
          a("grave", 28, 46, l("Мили активной цели", "Melee active target"), "Icebound Fortitude", l("Останься на активной цели, избегая щитов.", "Stay on the active target while avoiding shields.")),
          a("wind", 68, 58, l("Дальний фланг", "Ranged flank"), "Aspect of the Turtle", l("Стреляй с открытой полосы, не пересекай волны щитов.", "Attack from an open lane; do not cross shield waves.")),
        ],
        markers: [m("boss", 19, 25, l("Активный босс", "Active boss")), m("boss", 78, 27, l("Остальные", "Others"))],
        zones: [z("danger", 4, 45, 92, 8, l("Divine Toll", "Divine Toll"), -10), z("danger", 4, 61, 92, 8, l("Divine Toll", "Divine Toll"), 10), z("safe", 15, 20, 27, 38, l("Зона фокуса", "Focus zone"))],
        priorities: [l("Босс на 100 энергии, отдельно от совета", "The 100-energy boss, separated from council")],
        dangers: [l("Aura of Devotion снижает урон по близким боссам", "Aura of Devotion reduces damage to nearby bosses"), l("Divine Toll наносит высокий урон и накладывает немоту", "Divine Toll deals heavy damage and silences")],
        steps: [l("Танк заранее ведет активного босса на маркер.", "Tank pre-positions the active boss on the marker."), l("Рейд сохраняет свободные дорожки между волнами.", "Raid preserves open lanes between waves."), l("После способности вернитесь к общей схеме.", "Return to the default formation afterward.")],
      },
    ],
  },
  "crown-of-the-cosmos": {
    source: "https://www.icy-veins.com/wow/crown-of-the-cosmos-raid-guide",
    phases: [
      {
        id: "demibosses",
        name: l("Фаза 1 · Три полубосса", "Phase 1 · Three demibosses"),
        summary: l("Порядок: Demiar → Vroelus → Morium. Ведите Void Droplets под текущую цель, лужи оставляйте у края, стрелы направляйте от рейда.", "Order: Demiar → Vroelus → Morium. Bring Void Droplets under the active target, drop pools at the edge, and aim arrows away."),
        layout: "circle",
        assignments: [
          a("vexis", 50, 36, l("Текущий полубосс", "Active demiboss"), "Shield Wall", l("Держи Demiar на маркере; собирай Droplets под ним.", "Hold Demiar on the marker; stack Droplets underneath.")),
          a("mystic", 50, 68, l("Позади рейда", "Behind raid"), "Purify Spirit", l("Выкачай Null Corona; диспел только при угрозе смерти.", "Heal through Null Corona; dispel only in an emergency.")),
          a("nova", 32, 55, l("Дальний слева", "Ranged left"), "Arcane Surge", l("Фокус Demiar; с Grasp of Emptiness отойди к краю и направь стрелы мимо рейда.", "Focus Demiar; take Grasp of Emptiness to the edge and aim away.")),
          a("grave", 43, 47, l("Мили", "Melee"), "Death Grip", l("Подтяни Void Droplets прямо под босса для Corrupting Essence.", "Grip Void Droplets directly under the boss for Corrupting Essence.")),
          a("wind", 72, 62, l("Дальний справа", "Ranged right"), "Disengage", l("Void Expulsion вынеси на внешний край.", "Drop Void Expulsion at the outer edge.")),
        ],
        markers: [m("boss", 50, 26, l("Demiar · 1", "Demiar · 1")), m("boss", 22, 27, l("Vroelus · 2", "Vroelus · 2")), m("boss", 78, 27, l("Morium · 3", "Morium · 3")), m("add", 50, 47, l("Droplets", "Droplets"))],
        zones: [z("danger", 76, 65, 18, 22, l("Void Expulsion", "Void Expulsion")), z("danger", 5, 28, 30, 9, l("Grasp of Emptiness", "Grasp of Emptiness"), -28), z("safe", 31, 38, 38, 35, l("Рабочая зона", "Working area"))],
        priorities: [l("Demiar", "Demiar"), l("Vroelus", "Vroelus"), l("Morium", "Morium"), l("Void Droplets под целью", "Void Droplets under target")],
        dangers: [l("Void Expulsion оставляет растущие постоянные лужи", "Void Expulsion leaves growing permanent pools"), l("Не ловите Corrupting Essence больше нужного", "Avoid unnecessary Corrupting Essence stacks")],
        steps: [l("Соберите мелких аддов под текущей целью.", "Bring small adds under the active target."), l("Убейте их так, чтобы взрыв усилил урон по полубоссу.", "Kill them so the explosion debuffs the demiboss."), l("Личные метки выносите наружу, не ломая центр.", "Drop personal mechanics outside and preserve the centre.")],
      },
      {
        id: "xalatath",
        name: l("Фаза 2 · Ксал'атат", "Phase 2 · Xal'atath"),
        summary: l("Стягивайте аддов к Аллерии и уничтожайте Silverstrike Ricochet. Лужи оставляйте позади рейда, Cosmic Barrier ломайте на Rift Simulacrum.", "Pull adds onto Alleria and destroy them with Silverstrike Ricochet. Drop pools behind the raid and break Cosmic Barrier on the Rift Simulacrum."),
        layout: "lane",
        assignments: [
          a("vexis", 50, 36, l("Перед Ксал'атат", "In front of Xal'atath"), "Shield Wall", l("Свап после уничтожения аддов и пробития щита; таунть босса к себе.", "Swap after adds die and the shield breaks; taunt the boss to your position.")),
          a("mystic", 50, 69, l("Центр группы", "Group centre"), "Spirit Link Totem", l("Закрой Call of the Void; не отставай от движения платформы.", "Cover Call of the Void; keep pace with platform movement.")),
          a("nova", 33, 56, l("Левая сторона", "Left side"), "Arcane Surge", l("Фокус Rift Simulacrum при Cosmic Barrier.", "Focus the Rift Simulacrum during Cosmic Barrier.")),
          a("grave", 45, 47, l("У Аллерии", "On Alleria"), "Death Grip", l("Стяни аддов под Silverstrike Ricochet.", "Grip adds into Silverstrike Ricochet.")),
          a("wind", 71, 60, l("Правый фланг", "Right flank"), "Binding Shot", l("Зафиксируй аддов у Аллерии; лужу вынеси назад.", "Root adds on Alleria; drop your pool behind.")),
        ],
        markers: [m("boss", 50, 23, l("Ксал'атат", "Xal'atath")), m("objective", 50, 52, l("Аллерия", "Alleria")), m("add", 31, 48, l("Simulacrum", "Simulacrum"))],
        zones: [z("soak", 36, 42, 28, 27, l("Silverstrike", "Silverstrike")), z("danger", 13, 71, 22, 17, l("Void Expulsion", "Void Expulsion"))],
        priorities: [l("Rift Simulacrum с Cosmic Barrier", "Rift Simulacrum with Cosmic Barrier"), l("Адды в Silverstrike Ricochet", "Adds in Silverstrike Ricochet"), l("Ксал'атат", "Xal'atath")],
        dangers: [l("Лужи всегда оставляйте позади направления движения", "Always drop pools behind the movement direction"), l("Не меняйтесь местами танками — таунтьте босса к позиции", "Tanks should taunt the boss across, not swap positions")],
        steps: [l("Соберите аддов на Аллерии.", "Stack adds on Alleria."), l("Проведите Silverstrike через пачку и добейте ее.", "Pass Silverstrike through the pack and finish it."), l("Пробейте щит Simulacrum и только затем вернитесь в босса.", "Break the Simulacrum shield before returning to boss.")],
      },
      {
        id: "platforms",
        name: l("Фаза 3 · Платформы", "Phase 3 · Platforms"),
        summary: l("Держитесь плотной группой. Разрывайте Aspect of the End в порядке мили → танк → дальние и переходите на следующую платформу пером.", "Stay tightly stacked. Break Aspect of the End in the order melee → tank → ranged, then feather to the next platform."),
        layout: "split",
        assignments: [
          a("vexis", 52, 39, l("Впереди стака", "Front of stack"), "Rallying Cry", l("Разрыв вторым, после мили; веди группу к перу.", "Break second after melee; lead the group to the feather.")),
          a("mystic", 50, 64, l("Центр стака", "Stack centre"), "Ascendance", l("Подготовь мощное лечение на разрывы связей.", "Prepare heavy healing for tether breaks.")),
          a("nova", 42, 56, l("Дальний стак", "Ranged stack"), "Greater Invisibility", l("Разрыв после танка; двигайся вперед с рейдом.", "Break after the tank; move forward with raid.")),
          a("grave", 46, 47, l("Мили впереди", "Melee front"), "Anti-Magic Zone", l("Первым разорви Aspect of the End и поставь AMZ.", "Break Aspect of the End first and place AMZ.")),
          a("wind", 60, 56, l("Дальний стак", "Ranged stack"), "Aspect of the Turtle", l("Последний разрыв; после команды используй перо.", "Break last; use the feather on call.")),
        ],
        markers: [m("boss", 50, 23, l("Ксал'атат", "Xal'atath")), m("objective", 84, 50, l("Перо", "Feather")), m("objective", 50, 51, l("Стак", "Stack"))],
        zones: [z("safe", 27, 23, 46, 57, l("Текущая платформа", "Current platform")), z("danger", 74, 5, 8, 90, l("Разлом", "Platform crack"))],
        priorities: [l("Ксал'атат", "Xal'atath"), l("Безопасный переход на следующую платформу", "Safe transition to the next platform")],
        dangers: [l("Не завершайте переходку на трещине между секциями", "Do not end an intermission on a platform crack"), l("Связи разрываются строго по назначенному порядку", "Break tethers only in the assigned order")],
        steps: [l("Сложитесь в одну плотную группу.", "Stack as one tight group."), l("Разорвите мили, затем танк, затем дальние.", "Break melee, then tank, then ranged."), l("По команде прыгните пером на следующую платформу.", "Use the feather to jump to the next platform on call.")],
      },
    ],
  },
  chimaerus: {
    source: "https://www.icy-veins.com/wow/chimaerus-raid-guide",
    phases: [
      {
        id: "split-realms",
        name: l("Фаза 1 · Два слоя", "Phase 1 · Two realms"),
        summary: l("Рейд делится пополам. Нижняя группа ломает щиты аддов, верхняя немедленно добивает вышедших целей до того, как они дойдут до Химерия.", "Split the raid in half. The lower team breaks add shields; the upper team immediately kills anything sent up before it reaches Chimaerus."),
        layout: "split",
        assignments: [
          a("vexis", 25, 42, l("Нижний слой · танк", "Lower realm · tank"), "Shield Wall", l("Забери Colossal Horror подальше от босса и переживи Colossal Strikes.", "Hold the Colossal Horror away from the boss and survive Colossal Strikes.")),
          a("mystic", 26, 66, l("Нижний слой · лекарь", "Lower realm · healer"), "Ascendance", l("Поддержи нижнюю группу и диспель Consuming Miasma только у лужи.", "Support the lower team and dispel Consuming Miasma only near a pool.")),
          a("nova", 74, 57, l("Верхний слой · дальний", "Upper realm · ranged"), "Arcane Surge", l("Главный бёрст в аддов, пришедших наверх.", "Main burst into adds arriving upstairs.")),
          a("grave", 33, 49, l("Нижний слой · мили", "Lower realm · melee"), "Mind Freeze", l("Первый interrupt Fearsome Cry; ломай щиты аддов.", "First interrupt on Fearsome Cry; break add shields.")),
          a("wind", 67, 58, l("Верхний слой · дальний", "Upper realm · ranged"), "Binding Shot", l("Замедли вышедших аддов и добей до контакта с боссом.", "Root incoming adds and kill them before they reach the boss.")),
        ],
        markers: [m("add", 25, 28, l("Colossal Horror", "Colossal Horror")), m("boss", 75, 28, l("Химерий", "Chimaerus")), m("add", 64, 45, l("Адды наверху", "Upper adds"))],
        zones: [z("safe", 6, 11, 40, 78, l("Нижняя группа", "Lower team")), z("safe", 54, 11, 40, 78, l("Верхняя группа", "Upper team")), z("wall", 48, 6, 4, 88, l("Граница слоев", "Realm divide"))],
        priorities: [l("Colossal Horror внизу", "Colossal Horror below"), l("Haunting Essence: Fearsome Cry", "Haunting Essence: Fearsome Cry"), l("Любой адд, вышедший наверх", "Any add arriving upstairs")],
        dangers: [l("Адд у босса дает ему +100% урона", "An add reaching the boss grants +100% damage"), l("На Mythic не стойте рядом с отражением игрока в другом слое", "On Mythic, avoid your counterpart in the other realm")],
        steps: [l("Назначенная половина замачивает Alndust Upheaval.", "Assigned half soaks Alndust Upheaval."), l("Внизу ломают щиты, начиная с Colossal Horror.", "Below, break shields starting with Colossal Horror."), l("Наверху все мгновенно переключаются в пришедших аддов.", "Upstairs, everyone instantly swaps to incoming adds.")],
      },
      {
        id: "devastation",
        name: l("Переходка · Corrupted Devastation", "Intermission · Corrupted Devastation"),
        summary: l("Смотрите на линии полета, проходите в свободный сектор и продолжайте убивать аддов. Consuming Miasma диспелится возле существующей лужи.", "Read the flight lines, move into a free lane, and keep killing adds. Dispel Consuming Miasma next to an existing pool."),
        layout: "lane",
        assignments: [
          a("vexis", 50, 42, l("Перед пачкой", "In front of pack"), "Rallying Cry", l("Собери оставшихся аддов, не стой на линии полета.", "Gather remaining adds and stay off flight lines.")),
          a("mystic", 50, 72, l("За рейдом", "Behind raid"), "Spirit Link Totem", l("Link на общий урон переходки; диспель у лужи.", "Link the intermission raid damage; dispel at a pool.")),
          a("nova", 33, 56, l("Свободная левая полоса", "Open left lane"), "Mass Barrier", l("Щиты перед Corrupted Devastation и бёрст аддов.", "Shield before Corrupted Devastation and burst adds.")),
          a("grave", 46, 49, l("Мили", "Melee"), "Anti-Magic Zone", l("AMZ в безопасной полосе.", "Place AMZ in the safe lane.")),
          a("wind", 68, 56, l("Свободная правая полоса", "Open right lane"), "Aspect of the Turtle", l("Сохраняй движение и добивай приоритетную цель.", "Keep moving and finish the priority target.")),
        ],
        markers: [m("boss", 50, 22, l("Химерий", "Chimaerus")), m("add", 50, 46, l("Оставшиеся адды", "Remaining adds"))],
        zones: [z("danger", 12, 5, 13, 90, l("Линия полета", "Flight line"), -8), z("danger", 70, 5, 13, 90, l("Линия полета", "Flight line"), 8), z("safe", 32, 15, 36, 72, l("Свободный сектор", "Open lane"))],
        priorities: [l("Все оставшиеся адды", "All remaining adds"), l("Затем босс", "Then boss")],
        dangers: [l("Corrupted Devastation заранее показывает линии", "Corrupted Devastation telegraphs its lines"), l("Не диспельте Consuming Miasma в чистой зоне", "Do not dispel Consuming Miasma in clean space")],
        steps: [l("Найдите промежуток между линиями полета.", "Find the gap between flight lines."), l("Перенесите туда общий стак и защитные зоны.", "Move the raid stack and defensives into it."), l("Убейте аддов до окончания переходки.", "Kill adds before the intermission ends.")],
      },
    ],
  },
  beloren: {
    source: "https://www.icy-veins.com/wow/beloren-raid-guide",
    phases: [
      {
        id: "polarities",
        name: l("Фаза 1 · Свет и Бездна", "Phase 1 · Light and Void"),
        summary: l("Каждый работает только с механикой своего цвета. Танки меняются под Guardian's Edict, Dive ставится наружу, Ember и появившееся яйцо — приоритет.", "Handle only mechanics matching your colour. Tanks swap for Guardian's Edict, place Dive outward, and prioritize Embers and the spawned egg."),
        layout: "split",
        assignments: [
          a("vexis", 50, 37, l("Перед боссом", "In front of boss"), "Shield Wall", l("Следи за цветом Guardian's Edict: таунтит танк совпадающей полярности.", "Match Guardian's Edict: the tank with the matching polarity taunts.")),
          a("mystic", 50, 70, l("Между цветами", "Between colours"), "Spirit Link Totem", l("Стабилизируй рейд после стен орб; Link на совпадение механик.", "Recover after orb walls; Link overlapping mechanics.")),
          a("nova", 27, 56, l("Сторона Бездны", "Void side"), "Counterspell", l("Interrupt Void Eruption и впитывай только фиолетовые механики.", "Interrupt Void Eruption and soak only purple mechanics.")),
          a("grave", 43, 48, l("Мили · Свет", "Melee · Light"), "Mind Freeze", l("Interrupt Light Eruption, не заходи в механику другого цвета.", "Interrupt Light Eruption; avoid opposite-colour mechanics.")),
          a("wind", 73, 57, l("Сторона Света", "Light side"), "Counter Shot", l("Dive вынеси к внешнему краю, затем помоги замочить совпадающий цвет.", "Drop Dive at the outer edge, then help soak the matching colour.")),
        ],
        markers: [m("boss", 50, 24, l("Бело'рен", "Belo'ren")), m("add", 27, 42, l("Void Ember", "Void Ember")), m("add", 73, 42, l("Light Ember", "Light Ember"))],
        zones: [z("soak", 5, 10, 41, 80, l("Бездна", "Void")), z("soak", 54, 10, 41, 80, l("Свет", "Light")), z("danger", 42, 8, 16, 84, l("Не смешивать", "Do not cross"))],
        priorities: [l("Ember своего цвета", "Matching-colour Ember"), l("Яйцо после Ember", "Egg spawned by Ember"), l("Бело'рен", "Belo'ren")],
        dangers: [l("Неверный цвет Edict усиливает босса на 20%", "Wrong-colour Edict grants the boss 20% damage"), l("Radiant Echoes: проходите через орбы своего цвета", "Radiant Echoes: pass through matching-colour orbs")],
        steps: [l("После Voidlight Convergence разойдитесь по цветам.", "Split by colour after Voidlight Convergence."), l("Перехватывайте только совпадающие орбы и Dive.", "Intercept only matching orbs and Dives."), l("Сначала Ember, затем яйцо, затем босс.", "Kill Ember, then egg, then boss.")],
      },
      {
        id: "egg",
        name: l("Фаза 2 · Rebirth", "Phase 2 · Rebirth"),
        summary: l("После Death Drop встаньте в сектор своего цвета и прожмите весь урон в яйцо. Здесь используются Bloodlust и зелья.", "After Death Drop, stand in your matching sector and use every damage cooldown on the egg. This is the Bloodlust and potion window."),
        layout: "ring",
        assignments: [
          a("vexis", 50, 41, l("Перед яйцом", "In front of egg"), "Rallying Cry", l("Собери группу после подброса и дай Rallying Cry.", "Regroup after the knock-up and use Rallying Cry.")),
          a("mystic", 50, 67, l("Центр группы", "Group centre"), "Ascendance", l("Ascendance после Death Drop, затем держи группу в цветной зоне.", "Ascendance after Death Drop, then keep the group stable in its colour zone.")),
          a("nova", 34, 55, l("Сектор Бездны", "Void sector"), "Time Warp", l("Bloodlust и полный Arcane Surge в яйцо.", "Bloodlust and full Arcane Surge into the egg.")),
          a("grave", 45, 49, l("У яйца", "On the egg"), "Breath of Sindragosa", l("Полный бёрст; не выходи из совпадающего сектора.", "Full burst; remain in your matching sector.")),
          a("wind", 66, 55, l("Сектор Света", "Light sector"), "Call of the Wild", l("Полный бёрст в яйцо с безопасной стороны.", "Full burst into the egg from the safe side.")),
        ],
        markers: [m("objective", 50, 29, l("Яйцо Бело'рена", "Belo'ren's egg"))],
        zones: [z("soak", 10, 15, 38, 70, l("Бездна", "Void")), z("soak", 52, 15, 38, 70, l("Свет", "Light")), z("danger", 45, 5, 10, 90, l("Граница", "Divide"))],
        priorities: [l("Яйцо Бело'рена", "Belo'ren's egg")],
        dangers: [l("Стоять можно только в секторе своей полярности", "Stand only in your matching-polarity sector"), l("Не тратьте атакующие кулдауны прямо перед Rebirth", "Do not spend damage cooldowns just before Rebirth")],
        steps: [l("Переживите Death Drop и быстро соберитесь.", "Survive Death Drop and regroup quickly."), l("Займите сектор своего цвета.", "Enter your matching-colour sector."), l("Bloodlust, зелья и все кулдауны в яйцо.", "Bloodlust, potions, and every cooldown into the egg.")],
      },
    ],
  },
  "midnight-falls": {
    source: "https://www.icy-veins.com/wow/midnight-falls-raid-guide",
    phases: [
      {
        id: "memory",
        name: l("Фаза 1 · Death's Dirge", "Phase 1 · Death's Dirge"),
        summary: l("Запомните порядок символов и встаньте по часовой стрелке от активного танка. Останавливайте вращающиеся призмы и двигайтесь вместе с Dark Quasar.", "Memorize the rune order and line up clockwise from the active tank. Stop the rotating prisms and move with Dark Quasar."),
        layout: "ring",
        assignments: [
          a("vexis", 50, 35, l("Точка начала луча", "Beam start point"), "Shield Wall", l("Держи Л'уру так, чтобы Death's Dirge начинался с твоей позиции; свап после Heaven's Lance.", "Position L'ura so Death's Dirge starts from you; swap after Heaven's Lance.")),
          a("mystic", 50, 72, l("Снаружи круга", "Outer ring"), "Spirit Link Totem", l("Собирай Dawn Crystals и закрой Dimming; не заходи в Darkwell.", "Heal Dawn Crystals and cover Dimming; never enter the Darkwell.")),
          a("nova", 28, 51, l("Руна 1", "Rune 1"), "Counterspell", l("Первый stop Termination Prism; займи первый символ по команде.", "First stop on Termination Prism; take the first called rune.")),
          a("grave", 40, 46, l("Мили · руна 2", "Melee · rune 2"), "Blinding Sleet", l("Второй stop призмы; не стой на траектории Heaven's Glaives.", "Second prism stop; avoid Heaven's Glaives lines.")),
          a("wind", 72, 52, l("Руна 3", "Rune 3"), "Intimidation", l("Третий stop призмы; займи последнюю руну.", "Third prism stop; take the final rune.")),
        ],
        markers: [m("boss", 50, 24, l("Л'ура", "L'ura")), m("objective", 30, 49, l("① X", "① X")), m("objective", 50, 69, l("② ○", "② ○")), m("objective", 70, 49, l("③ ◇", "③ ◇"))],
        zones: [z("danger", 43, 37, 14, 26, l("The Darkwell", "The Darkwell")), z("danger", 47, 5, 6, 90, l("Dark Quasar", "Dark Quasar"), 42), z("safe", 17, 15, 66, 73, l("Движение по кольцу", "Rotate around ring"))],
        priorities: [l("Termination Prism: interrupt / CC", "Termination Prism: interrupt / CC"), l("Dawn Crystals для следующей фазы", "Dawn Crystals for later phases"), l("Л'ура", "L'ura")],
        dangers: [l("The Darkwell в центре смертелен", "The Darkwell in the centre is lethal"), l("Heaven's Glaives рикошетят до переходки", "Heaven's Glaives keep bouncing until intermission")],
        steps: [l("Запомните показанный порядок символов.", "Memorize the displayed rune order."), l("От активного танка расставьтесь по часовой стрелке.", "Line up clockwise starting from the active tank."), l("После проверки продолжайте вращаться с Dark Quasar.", "After the check, continue rotating with Dark Quasar.")],
      },
      {
        id: "cores",
        name: l("Фаза 2 · Void Cores", "Phase 2 · Void Cores"),
        summary: l("Игроки с Galvanize ведут разные лучи в разные Void Cores и вращаются вместе с ними. Закончите фазу плотной группой на одной стороне.", "Galvanized players aim separate beams into separate Void Cores and rotate with them. End the phase stacked on one side."),
        layout: "circle",
        assignments: [
          a("vexis", 50, 38, l("Перед боссом", "In front of boss"), "Rallying Cry", l("Держи Л'уру на месте и подготовь общий сейв к Core Harvest.", "Hold L'ura steady and prepare a raid defensive for Core Harvest.")),
          a("mystic", 50, 69, l("За группой", "Behind group"), "Ascendance", l("Лечи общий урон после втягивания ядер.", "Heal raid damage after the cores are pulled in.")),
          a("nova", 25, 48, l("Galvanize · левое ядро", "Galvanize · left core"), "Greater Invisibility", l("Веди свой луч в левое ядро, не пересекай другой луч.", "Aim your beam at the left core without crossing another beam.")),
          a("grave", 44, 47, l("Мили", "Melee"), "Anti-Magic Zone", l("AMZ на Core Harvest и следуй за общим движением.", "AMZ for Core Harvest and follow group movement.")),
          a("wind", 75, 48, l("Galvanize · правое ядро", "Galvanize · right core"), "Aspect of the Turtle", l("Веди отдельный луч в правое ядро.", "Aim a separate beam into the right core.")),
        ],
        markers: [m("boss", 50, 25, l("Л'ура", "L'ura")), m("objective", 13, 50, l("Void Core A", "Void Core A")), m("objective", 87, 50, l("Void Core B", "Void Core B"))],
        zones: [z("soak", 18, 45, 27, 9, l("Galvanize A", "Galvanize A")), z("soak", 55, 45, 27, 9, l("Galvanize B", "Galvanize B")), z("danger", 43, 37, 14, 25, l("Darkwell", "Darkwell"))],
        priorities: [l("Разные Void Cores разными Galvanize", "Separate Void Cores with separate Galvanize beams"), l("Л'ура между механиками", "L'ura between mechanics")],
        dangers: [l("Два Galvanize не направлять в одно ядро", "Never aim two Galvanize beams at one core"), l("После попаданий Core Harvest втягивает ядра и наносит урон рейду", "Core Harvest pulls hit cores inward and damages the raid")],
        steps: [l("Назначенные игроки расходятся на противоположные стороны.", "Assigned players move to opposite sides."), l("Каждый держит свой луч на отдельном вращающемся ядре.", "Each player tracks a separate rotating core."), l("Перед концом фазы весь рейд собирается с одной стороны.", "Before the phase ends, the raid stacks on one side.")],
      },
      {
        id: "archangel",
        name: l("Фаза 3 · Dark Archangel", "Phase 3 · Dark Archangel"),
        summary: l("Найдите разрывы между Dark Constellation, замочите Light Siphon и переживите конус внутри щита Dawn Crystal. После удара вся группа идет по часовой стрелке.", "Find gaps between Dark Constellations, soak Light Siphon, and survive the cone inside a Dawn Crystal shield. After impact, the whole raid moves clockwise."),
        layout: "ring",
        assignments: [
          a("vexis", 50, 37, l("Перед Л'урой", "In front of L'ura"), "Shield Wall", l("Держи направление конуса стабильным и веди группу по часовой стрелке.", "Keep the cone direction stable and lead the clockwise move.")),
          a("mystic", 50, 68, l("Центр щита", "Shield centre"), "Spirit Link Totem", l("Link внутри защитного щита; подними рейд после выхода.", "Link inside the protective shield; recover the raid after moving out.")),
          a("nova", 37, 55, l("Группа замачивания", "Soak group"), "Mass Barrier", l("Замочи Light Siphon и используй Mass Barrier перед конусом.", "Soak Light Siphon and use Mass Barrier before the cone.")),
          a("grave", 45, 47, l("Носитель кристалла 1", "Crystal carrier 1"), "Extra Action Button", l("Первым активируй Dawn Crystal на Dark Archangel.", "Use the first Dawn Crystal for Dark Archangel.")),
          a("wind", 64, 56, l("Носитель кристалла 2", "Crystal carrier 2"), "Extra Action Button", l("Второй кристалл — только по команде; затем двигайся с рейдом.", "Second crystal only on call; then move with the raid.")),
        ],
        markers: [m("boss", 50, 23, l("Л'ура", "L'ura")), m("objective", 50, 53, l("Щит Dawn Crystal", "Dawn Crystal shield"))],
        zones: [z("safe", 34, 40, 32, 31, l("Защитный щит", "Protective shield")), z("danger", 10, 9, 80, 24, l("Dark Archangel", "Dark Archangel")), z("danger", 70, 60, 18, 23, l("Dark Constellation", "Dark Constellation"))],
        priorities: [l("Light Siphon: полностью замочить", "Light Siphon: fully soak"), l("Сохранить Dawn Crystals по ротации", "Preserve Dawn Crystals by rotation"), l("Л'ура", "L'ura")],
        dangers: [l("Без щита Dawn Crystal Dark Archangel смертелен", "Dark Archangel is lethal without a Dawn Crystal shield"), l("После конуса темная зона остается — выходите вместе", "The dark zone remains after the cone—move out together")],
        steps: [l("Разберите безопасные разрывы между созвездиями.", "Find safe gaps between constellations."), l("Замочите три Light Siphon по назначенным группам.", "Soak the three Light Siphons with assigned groups."), l("Кристалл №1 ставит щит; после удара весь рейд идет по часовой стрелке.", "Crystal carrier 1 shields the raid; after impact everyone moves clockwise.")],
      },
    ],
  },
};

export function getRaidTactic(bossSlug: string) {
  return midnightRaidTactics[bossSlug];
}
