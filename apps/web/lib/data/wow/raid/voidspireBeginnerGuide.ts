import type { GuideText } from './voidspireVideoGuide';
import type { GuideRole } from './voidspireRoleTactics';

const l = (ru: string, en: string): GuideText => ({ ru, en });
type Priority = { title: GuideText; detail: GuideText; mechanicId: string };
export type BeginnerBossGuide = {
  goal: GuideText;
  priorities: [Priority, Priority, Priority];
  startingPosition: GuideText;
  diagram: { title: GuideText; caption: GuideText };
};

/** Short orientation; the detailed guide remains the authority for timing and difficulty. */
export const voidspireBeginnerGuides: Record<string, BeginnerBossGuide> = {
  'imperator-averzian': {
    goal: l('Не дайте трём разломам выстроиться в линию на клетчатом поле.', 'Prevent three rifts from lining up on the tiled floor.'),
    priorities: [
      { mechanicId: 'collapse', title: l('Большой круг — войдите вместе', 'Large circle — join the group'), detail: l('Встаньте в круг вокруг танка до взрыва. Вместе вы уменьшите урон, а взрыв уничтожит выбранного ваятеля.', 'Enter the circle around the tank before it explodes. More players reduce the damage, and the explosion destroys the chosen Voidshaper.') },
      { mechanicId: 'bulwark', title: l('Новые враги — сначала они', 'New enemies — kill them first'), detail: l('Переключитесь с босса на врагов из разлома. Если вам назначили прерывание, остановите их Непроницаемый оплот.', 'Switch from the boss to enemies emerging from the rift. If assigned an interrupt, stop their Pitch Bulwark cast.') },
      { mechanicId: 'phalanx', title: l('Солдаты — в свободную линию', 'Soldiers — take the empty lane'), detail: l('Две линии займут солдаты. Перейдите вместе в третью; не пробегайте сквозь строй.', 'Soldiers fill two lanes. Move together into the third; do not run through their formation.') },
    ],
    startingPosition: l('Держитесь рядом с группой на свободной клетке. Когда вокруг танка появится большой круг, подойдите к нему, даже если обычно атакуете издалека.', 'Stay with the group on a clear tile. When the large circle appears around the tank, move in even if you normally attack from range.'),
    diagram: { title: l('Во время большого круга', 'During the large circle'), caption: l('Танк и вся группа внутри одного круга; выбранный ваятель — в его центре. Это схема взаимного расположения, а не точная карта арены.', 'The tank and whole group share one circle, centred on the chosen Voidshaper. Relative positions are shown, not an exact arena map.') },
  },
  vorasius: {
    goal: l('Взорвите жуков у стены, чтобы открыть путь от смертельного луча.', 'Explode bugs at the wall to open an escape route from the lethal beam.'),
    priorities: [
      { mechanicId: 'tank', title: l('Круг танка — держитесь снаружи', 'Tank circle — stay outside'), detail: l('Эти удары принимают только танки. Остальные отходят от кругов и расходящихся после удара колец.', 'Only tanks take these hits. Everyone else avoids the circles and the rings that spread after each impact.') },
      { mechanicId: 'bugs', title: l('Жук за вами — ведите к стене', 'Bug chasing you — lead it to the wall'), detail: l('Доведите жука до выбранной группой стены. Убейте его там: взрыв разрушает препятствие. В центре зала он бесполезен.', 'Lead the bug to the wall chosen by the group. Kill it there: its explosion breaks the obstacle. Exploding it in the centre wastes it.') },
      { mechanicId: 'beam', title: l('Начался луч — в пролом', 'Beam starts — use the gap'), detail: l('Уходите от луча через готовый проход вместе с группой. После луча дайте танку первым вернуться к боссу.', 'Escape the beam through the prepared gap with the group. After the beam, let a tank return to the boss first.') },
    ],
    startingPosition: l('Заранее найдите выбранную стену и путь к ней. Не стойте между преследующим жуком и игроком, который ведёт его к стене.', 'Identify the chosen wall and the route to it. Keep clear of the path between a chasing bug and the player leading it to the wall.'),
    diagram: { title: l('Жук открывает проход', 'The bug opens a passage'), caption: l('Преследуемый игрок ведёт жука к стене; группа освобождает путь. Здесь показан момент подготовки пролома, а не точная карта арены.', 'The chased player leads the bug to the wall; the group leaves its path clear. This shows preparation of the gap, not an exact arena map.') },
  },
  'fallen-king-salhadaar': {
    goal: l('Уничтожайте сферы до встречи с боссом и сохраняйте свободное место для движения.', 'Destroy spheres before they reach the boss and preserve room to move.'),
    priorities: [
      { mechanicId: 'spheres', title: l('Сферы — смените цель', 'Spheres — switch targets'), detail: l('Бейте сферы, которые движутся к королю. Не касайтесь их персонажем; танк уводит босса от них.', 'Attack spheres moving toward the king. Do not touch them with your character; the tank moves the boss away.') },
      { mechanicId: 'images', title: l('Копия колдует — прервите', 'An image casts — interrupt it'), detail: l('Одно прерывание или оглушение убирает назначенную копию. Не тратьте на неё долгий бой обычными атаками.', 'One interrupt or stun removes your assigned image. You do not need to fight it with normal attacks.') },
      { mechanicId: 'marks', title: l('Личный круг — к краю', 'Your own circle — move to the edge'), detail: l('Отойдите от других игроков к свободному краю. Здесь останется опасная лужа, поэтому не оставляйте её на общем пути.', 'Move away from other players toward a clear edge. A dangerous pool remains there, so keep it off the group’s route.') },
    ],
    startingPosition: l('Стойте на свободном полу рядом с группой, не на пути сфер. С личным кругом отойдите к краю; при вращающихся лучах двигайтесь в безопасном промежутке.', 'Stand on clear ground with the group, outside the spheres’ paths. Take your personal circle to the edge; when beams rotate, move through the safe gap.'),
    diagram: { title: l('Не подпускайте сферы', 'Keep spheres away'), caption: l('Танк отводит босса от сфер. Игрок с личным кругом занимает отдельное свободное место у края. Схема показывает отношения, а не точную карту.', 'The tank moves the boss away from spheres. A player with a personal circle uses a separate clear spot at the edge. Relative positions, not an exact map.') },
  },
  'vaelgor-ezzorak': {
    goal: l('Держите обоих драконов примерно на одинаковом здоровье и оставляйте центр свободным.', 'Keep both dragons at similar health and leave the centre clear.'),
    priorities: [
      { mechanicId: 'breath', title: l('Дракон смотрит на вас — в сторону', 'Breath targets you — move aside'), detail: l('С меткой дыхания сразу отойдите от группы, направляя удар в пустое место. Остальные держатся сбоку от драконов.', 'With the breath mark, immediately move away from the group and aim at empty space. Everyone else stays beside the dragons.') },
      { mechanicId: 'adds', title: l('Личные круги — не пересекайте', 'Personal circles — keep them apart'), detail: l('Оставьте круги рядом с Ваэлгором, но отдельно друг от друга. Затем убивайте появившихся врагов и прерывайте их Стрелу Бездны.', 'Place circles near Vaelgor but apart from one another. Then kill the spawned enemies and interrupt their Voidbolt casts.') },
      { mechanicId: 'intermission', title: l('Драконы взлетели — в свет', 'Dragons take flight — enter the light'), detail: l('Вся группа идёт в светлую защитную зону в центре и убивает Воплощение ночи. За пределами зоны опасно.', 'The whole group enters the central light barrier and kills the manifestation. Remaining outside is dangerous.') },
    ],
    startingPosition: l('Группа сбоку от Ваэлгора. Перед головами находятся танки; за хвостами стоять опасно. Драконы разделены, но оба остаются доступны для атак.', 'The group stands beside Vaelgor. Tanks stand in front; standing behind the tails is dangerous. Keep the dragons apart but both within attack range.'),
    diagram: { title: l('Основная фаза: сбоку от драконов', 'Main phase: beside the dragons'), caption: l('Танк перед каждым драконом, группа сбоку от Ваэлгора. Между драконами — не менее 15 м. Схема не передаёт точный масштаб арены.', 'A tank stands in front of each dragon; the group stays beside Vaelgor. Keep the dragons at least 15 yd apart. The diagram is not to arena scale.') },
  },
  'lightblinded-vanguard': {
    goal: l('Разделяйте боссов во время больших аур и добейте всех троих почти одновременно.', 'Separate bosses during their large auras and finish all three at nearly the same time.'),
    priorities: [
      { mechanicId: 'auras', title: l('Большая аура — босса к краю', 'Large aura — move its boss out'), detail: l('Танк отделяет босса с аурой от двух остальных. Бойцы атакуют доступную цель и следят за здоровьем всех троих.', 'A tank separates the aura boss from the other two. Damage dealers attack an available target and watch all three health bars.') },
      { mechanicId: 'shield', title: l('Щит Сенн — разбейте, потом прервите', 'Senn’s shield — break, then interrupt'), detail: l('После её прыжка весь урон — в щит. Как только щит исчезнет, назначенный игрок прерывает Слепящий свет.', 'After her leap, focus damage on the shield. As soon as it breaks, the assigned player interrupts Blinding Light.') },
      { mechanicId: 'sentence', title: l('Приговор — разделите удар', 'Sentence — share the hit'), detail: l('Войдите в назначенный круг отмеченного игрока, чтобы разделить урон. В два круга одновременно не вставайте; обычные личные круги, наоборот, разносите.', 'Enter your assigned marked player’s circle to share damage. Never stand in both circles; ordinary personal circles must instead be kept apart.') },
    ],
    startingPosition: l('Держитесь с группой у доступной цели. Не заходите в Ауру мира Сенн: применение способностей внутри неё мешает вам продолжать бой.', 'Stay with the group near an available target. Keep outside Senn’s Aura of Peace: using abilities inside prevents you from continuing to fight normally.'),
    diagram: { title: l('Когда босс готовит ауру', 'When a boss prepares an aura'), caption: l('Босс с аурой — у края; два других — дальше 40 м от него. Показано разделение целей, а не постоянная расстановка на весь бой.', 'The aura boss is at the edge; the other two stay over 40 yd away. This shows the separation, not a fixed formation for the entire fight.') },
  },
  'crown-of-the-cosmos': {
    goal: l('Пройдите три этапа: часовые, Аллерия с копией, затем общие перелёты между платформами.', 'Complete three stages: sentinels, Alleria and her copy, then move between platforms together.'),
    priorities: [
      { mechanicId: 'arrow', title: l('Метка стрелы — направьте через врага', 'Arrow mark — aim through the enemy'), detail: l('В первой фазе стрела снимает щит часового. Направляйте её через назначенную цель, не через случайную часть группы.', 'In phase one the arrow removes a sentinel’s shield. Aim it through the called target, not through an arbitrary part of the group.') },
      { mechanicId: 'corona', title: l('Нуль-венец — нужен целитель', 'Null Corona — needs healing'), detail: l('Этот щит поглощает лечение. Целитель вылечивает поглощение; рассеивание только переносит остаток на другого игрока.', 'This shield absorbs healing. A healer heals through it; dispelling only transfers the remaining absorb to another player.') },
      { mechanicId: 'end', title: l('Финальные связи — рвите по очереди', 'Final tethers — break them in order'), detail: l('За синий круг выходят дальний боец, ближний, затем танк. Между выходами дождитесь лечения: каждый разрыв ранит всю группу.', 'Leave the blue circle in order: ranged player, melee player, then tank. Wait for healing between breaks because each damages the whole group.') },
    ],
    startingPosition: l('В начале группа атакует одного часового. У двух остальных остаются назначенные игроки в ближнем бою; не оставляйте живого часового без такой цели.', 'At the start, the group attacks one sentinel. Assigned players stay in melee of the other two; never leave a living sentinel without a nearby target.'),
    diagram: { title: l('Первая фаза: часовые', 'Phase one: sentinels'), caption: l('Группа сосредоточена у одного часового; у каждого другого остаётся назначенный игрок. Это только первая фаза героического боя.', 'The group focuses one sentinel; an assigned player remains at each other sentinel. This shows only the opening phase of the Heroic encounter.') },
  },
};

export const roleBasics: Record<GuideRole, GuideText> = {
  tank: l('Танк принимает основные удары и перемещает босса; второй танк сменяет его в нужный момент.', 'A tank takes the main hits and positions the boss; the second tank takes over at the required moment.'),
  healer: l('Целитель восстанавливает здоровье группы и снимает подходящие вредные эффекты.', 'A healer restores the group’s health and removes harmful effects that can safely be dispelled.'),
  melee: l('Боец ближнего боя атакует рядом с врагом, но выходит из опасных зон даже ценой урона.', 'A melee damage dealer attacks close to enemies but leaves dangerous ground even when it costs damage.'),
  ranged: l('Боец дальнего боя атакует издалека, но подходит к группе, когда нужно вместе принять удар.', 'A ranged damage dealer attacks from a distance but joins the group when a hit must be shared.'),
};

export const voidspireBeginnerTerms: Record<string, { label: GuideText; detail: GuideText }> = {
  interrupt: { label: l('Прерывание / «кик»', 'Interrupt / “kick”'), detail: l('Выберите указанного врага и нажмите способность прерывания, пока он применяет опасное заклинание. Способность зависит от вашей специализации.', 'Target the named enemy and use your interrupt while it is casting the dangerous spell. Your specialization determines which ability you have.') },
  defensive: { label: l('Личная защита', 'Personal defensive'), detail: l('Способность, которая помогает пережить урон. Используйте её перед ударом, а не после потери всего здоровья.', 'An ability that helps you survive damage. Use it before the hit, not after losing all your health.') },
  circles: { label: l('Войти в круг или выйти?', 'Enter a circle or leave it?'), detail: l('Одни круги нужно делить с группой, другие — держать подальше от людей. Смотрите название механики: цвет сам по себе не определяет действие.', 'Some circles must be shared with the group; others must be kept away from people. Follow the mechanic’s name: colour alone does not determine the right action.') },
  absorb: { label: l('Поглощение исцеления', 'Healing absorb'), detail: l('Сначала лечение тратится на снятие этого эффекта; только затем снова восстанавливает здоровье.', 'Healing first removes this effect; only then does it restore health again.') },
};

/** Checked on 2026-11-03; dd selects raid difficulty (14 Normal, 15 Heroic). */
export const voidspireFactSources = [
  { label: l('Изменения Blizzard', 'Blizzard changes'), href: 'https://worldofwarcraft.blizzard.com/en-us/news/24266320' },
  { label: l('Мрак: обычный режим', 'Gloom: Normal'), href: 'https://www.wowhead.com/spell=1245391/gloom?dd=14' },
  { label: l('Мрак: героический режим', 'Gloom: Heroic'), href: 'https://www.wowhead.com/spell=1245391/gloom?dd=15' },
  { label: l('Нуль-венец', 'Null Corona'), href: 'https://www.wowhead.com/spell=1233865/null-corona?dd=15' },
];
