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
      { mechanicId: 'collapse', title: l("Войдите в круг танка", "Join the tank’s circle"), detail: l("До взрыва войдите в круг танка у выбранного ваятеля. Группа разделит урон, а взрыв уничтожит ваятеля.", "Before the explosion, enter the tank’s circle at the chosen Voidshaper. The group shares the damage, and the explosion destroys the Voidshaper.") },
      { mechanicId: 'bulwark', title: l("Сначала убейте подкрепления", "Kill reinforcements first"), detail: l("Атакуйте врагов из разлома вместо босса. Если вам назначено прерывание, остановите заклинание Непроницаемый оплот.", "Switch from the boss to enemies coming from the rift. If assigned to interrupt, stop their Pitch Bulwark cast.") },
      { mechanicId: 'phalanx', title: l("Перейдите в свободную линию", "Move into the empty lane"), detail: l('Две линии займут солдаты. Перейдите вместе в третью; не пробегайте сквозь строй.', 'Soldiers fill two lanes. Move together into the third; do not run through their formation.') },
    ],
    startingPosition: l('Держитесь рядом с группой на свободной клетке. Когда вокруг танка появится большой круг, подойдите к нему, даже если обычно атакуете издалека.', 'Stay with the group on a clear tile. When the large circle appears around the tank, move in even if you normally attack from range.'),
    diagram: { title: l('Во время большого круга', 'During the large circle'), caption: l("Танк ставит центр круга на выбранного ваятеля. Вся группа входит внутрь до взрыва.", "The tank centres the circle on the chosen Voidshaper. Everyone enters before it explodes.") },
  },
  vorasius: {
    goal: l("Убейте жуков у стены: их взрывы откроют проход, через который группа спасётся от луча.", "Kill the bugs at the wall. Their explosions open a gap for the group to escape the lethal beam."),
    priorities: [
      { mechanicId: 'tank', title: l("Не входите в круги танков", "Stay out of tank circles"), detail: l('Эти удары принимают только танки. Остальные отходят от кругов и расходящихся после удара колец.', 'Only tanks take these hits. Everyone else avoids the circles and the rings that spread after each impact.') },
      { mechanicId: 'bugs', title: l("Приведите жука к стене", "Lead your bug to the wall"), detail: l("Если жук преследует вас, доведите его до выбранной стены. Убейте его у самой стены, чтобы взрыв открыл проход.", "If a bug chases you, lead it to the chosen wall. Kill it right beside the wall so the explosion opens a gap.") },
      { mechanicId: 'beam', title: l("Уходите от луча через пролом", "Escape the beam through the gap"), detail: l('Уходите от луча через готовый проход вместе с группой. После луча дайте танку первым вернуться к боссу.', 'Escape the beam through the prepared gap with the group. After the beam, let a tank return to the boss first.') },
    ],
    startingPosition: l('Заранее найдите выбранную стену и путь к ней. Не стойте между преследующим жуком и игроком, который ведёт его к стене.', 'Identify the chosen wall and the route to it. Keep clear of the path between a chasing bug and the player leading it to the wall.'),
    diagram: { title: l('Жук открывает проход', 'The bug opens a passage'), caption: l("Игрок, которого преследует жук, ведёт его к стене. Остальные освобождают путь.", "The chased player leads the bug to the wall. Everyone else keeps its path clear.") },
  },
  'fallen-king-salhadaar': {
    goal: l('Уничтожайте сферы до встречи с боссом и сохраняйте свободное место для движения.', 'Destroy spheres before they reach the boss and preserve room to move.'),
    priorities: [
      { mechanicId: 'spheres', title: l("Уничтожьте приближающиеся сферы", "Kill the spheres before they reach the boss"), detail: l('Бейте сферы, которые движутся к королю. Не касайтесь их персонажем; танк уводит босса от них.', 'Attack spheres moving toward the king. Do not touch them with your character; the tank moves the boss away.') },
      { mechanicId: 'images', title: l("Прервите заклинание копии", "Interrupt the image’s spell"), detail: l("Прервите заклинание назначенной копии или оглушите её. Одного применения достаточно, чтобы копия исчезла.", "Interrupt your assigned image’s spell or stun it. One successful use removes the image.") },
      { mechanicId: 'marks', title: l("Отнесите свой круг к краю", "Take your circle to the edge"), detail: l('Отойдите от других игроков к свободному краю. Здесь останется опасная лужа, поэтому не оставляйте её на общем пути.', 'Move away from other players toward a clear edge. A dangerous pool remains there, so keep it off the group’s route.') },
    ],
    startingPosition: l('Стойте на свободном полу рядом с группой, не на пути сфер. С личным кругом отойдите к краю; при вращающихся лучах двигайтесь в безопасном промежутке.', 'Stand on clear ground with the group, outside the spheres’ paths. Take your personal circle to the edge; when beams rotate, move through the safe gap.'),
    diagram: { title: l('Не подпускайте сферы', 'Keep spheres away'), caption: l("Танк уводит босса от сфер. Игрок с личным кругом отходит к свободному краю, подальше от группы.", "The tank moves the boss away from spheres. A player with a personal circle moves to a clear edge, away from the group.") },
  },
  'vaelgor-ezzorak': {
    goal: l('Держите обоих драконов примерно на одинаковом здоровье и оставляйте центр свободным.', 'Keep both dragons at similar health and leave the centre clear.'),
    priorities: [
      { mechanicId: 'breath', title: l("Направьте дыхание от группы", "Aim the breath away from the group"), detail: l("Если выбраны целью дыхания, сразу отойдите от группы и направьте удар в пустое место. Остальные стоят сбоку от драконов.", "If targeted by the breath, move away from the group immediately and aim it at empty ground. Everyone else stands beside the dragons.") },
      { mechanicId: 'adds', title: l("Не накладывайте круги друг на друга", "Keep personal circles apart"), detail: l("Оставьте круги рядом с Ваэлгором, не накладывая их друг на друга. Убейте появившихся врагов и прерывайте их заклинание Стрела Бездны.", "Place the circles near Vaelgor without overlapping them. Kill the enemies that appear and interrupt their Voidbolt casts.") },
      { mechanicId: 'intermission', title: l("При взлёте войдите в барьер", "Enter the barrier when the dragons take flight"), detail: l("Когда драконы взлетят, войдите всей группой в светлый барьер в центре. Оставаясь внутри, убейте Воплощение ночи.", "When the dragons take flight, enter the central light barrier together. Stay inside and kill the manifestation.") },
    ],
    startingPosition: l("Стойте сбоку от Ваэлгора. Перед головами находятся танки; за хвостами опасно. Драконы стоят отдельно друг от друга, но оба остаются в пределах атак группы.", "Stand beside Vaelgor. Tanks stand in front of the dragons; their tails are dangerous. Keep the dragons apart but within the group’s attack range."),
    diagram: { title: l('Основная фаза: сбоку от драконов', 'Main phase: beside the dragons'), caption: l("Перед каждым драконом стоит танк, группа — сбоку от Ваэлгора. Между драконами должно быть не менее 15 м.", "A tank stands in front of each dragon; the group stands beside Vaelgor. Keep the dragons at least 15 yd apart.") },
  },
  'lightblinded-vanguard': {
    goal: l("Отводите босса с активной аурой от двух других. Снижайте их здоровье равномерно, чтобы добить всех троих почти одновременно.", "Separate the boss with an active aura from the other two. Keep their health even so all three die at nearly the same time."),
    priorities: [
      { mechanicId: 'auras', title: l("Отведите босса с аурой к краю", "Move the aura boss to the edge"), detail: l("Танк уводит босса с аурой от двух остальных. Бойцы атакуют доступного босса и выравнивают здоровье всех троих.", "The tank moves the boss with an aura away from the other two. Damage dealers attack an available boss and keep all three health bars even.") },
      { mechanicId: 'shield', title: l("Разбейте щит Сенн и прервите заклинание", "Break Senn’s shield, then interrupt"), detail: l("После прыжка Сенн сразу атакуйте её щит. Когда он разрушится, назначенный игрок прерывает Слепящий свет.", "Attack Senn’s shield as soon as she lands. When it breaks, the assigned player interrupts Blinding Light.") },
      { mechanicId: 'sentence', title: l("Разделите урон Приговора", "Share the damage from Sentence"), detail: l("Войдите в круг, назначенный вашей группе, и разделите удар. Не стойте в двух кругах Приговора сразу. Другие личные круги держите подальше от игроков.", "Enter your group’s assigned circle to share the hit. Do not stand in two Sentence circles at once. Keep other personal circles away from players.") },
    ],
    startingPosition: l("Держитесь с группой у босса, которого можете атаковать. Применяйте способности за пределами Ауры мира Сенн.", "Stay with the group near a boss you can attack. Use abilities outside Senn’s Aura of Peace."),
    diagram: { title: l('Когда босс готовит ауру', 'When a boss prepares an aura'), caption: l("Босса с активной аурой отводят к краю. Два других остаются дальше 40 м от него.", "Move the boss with an active aura to the edge. Keep the other two over 40 yd away.") },
  },
  'crown-of-the-cosmos': {
    goal: l("Сначала убейте часовых, затем сражайтесь с Аллерией и её копией. В финале разрывайте связи по очереди и перелетайте между платформами вместе.", "Defeat the sentinels, then fight Alleria and her copy. In the final phase, break tethers in order and fly between platforms together."),
    priorities: [
      { mechanicId: 'arrow', title: l("Направьте стрелу через цель со щитом", "Aim the arrow through the shielded enemy"), detail: l("В первой фазе направьте стрелу через выбранного часового, чтобы снять его щит. Не направляйте её на случайных игроков.", "In phase one, aim the arrow through the chosen sentinel to remove its shield. Do not aim it at random players.") },
      { mechanicId: 'corona', title: l("Снимите Нуль-венец лечением", "Heal through Null Corona"), detail: l("Целитель лечит игрока, пока поглощение не исчезнет. Рассеивание переносит оставшееся поглощение на другого игрока.", "Heal the affected player until the absorb is gone. Dispelling transfers the remaining absorb to another player.") },
      { mechanicId: 'end', title: l("Разрывайте связи по очереди", "Break tethers in order"), detail: l("За синий круг первым выходит дальний боец, затем ближний, последним танк. После каждого разрыва целители восстанавливают здоровье группы.", "Leave the blue circle in order: ranged player, melee player, then tank. Each break damages the group; healers restore health before the next player leaves.") },
    ],
    startingPosition: l('В начале группа атакует одного часового. У двух остальных остаются назначенные игроки в ближнем бою; не оставляйте живого часового без такой цели.', 'At the start, the group attacks one sentinel. Assigned players stay in melee of the other two; never leave a living sentinel without a nearby target.'),
    diagram: { title: l('Первая фаза: часовые', 'Phase one: sentinels'), caption: l("В первой фазе героического боя группа атакует одного часового. У каждого другого остаётся назначенный игрок.", "In phase one of the Heroic encounter, the group attacks one sentinel. An assigned player stays at each other sentinel.") },
  },
};

export const roleBasics: Record<GuideRole, GuideText> = {
  tank: l('Танк принимает основные удары и перемещает босса; второй танк сменяет его в нужный момент.', 'A tank takes the main hits and positions the boss; the second tank takes over at the required moment.'),
  healer: l('Целитель восстанавливает здоровье группы и снимает подходящие вредные эффекты.', 'A healer restores the group’s health and removes harmful effects that can safely be dispelled.'),
  melee: l("Боец ближнего боя атакует рядом с врагом и отходит, когда под ним появляется опасная зона.", "A melee damage dealer attacks close to the enemy and moves away when dangerous ground appears beneath them."),
  ranged: l('Боец дальнего боя атакует издалека, но подходит к группе, когда нужно вместе принять удар.', 'A ranged damage dealer attacks from a distance but joins the group when a hit must be shared.'),
};

export const voidspireBeginnerTerms: Record<string, { label: GuideText; detail: GuideText }> = {
  interrupt: { label: l('Прерывание / «кик»', 'Interrupt / “kick”'), detail: l("Прерывание останавливает заклинание врага во время его применения. Выберите врага и используйте способность прерывания своей специализации.", "An interrupt stops an enemy spell while it is being cast. Target the enemy and use your specialization’s interrupt ability.") },
  defensive: { label: l('Личная защита', 'Personal defensive'), detail: l("Способность, которая помогает пережить сильный урон. Применяйте её до удара.", "An ability that helps you survive heavy damage. Use it before the hit.") },
  circles: { label: l('Войти в круг или выйти?', 'Enter a circle or leave it?'), detail: l("В одни круги группа входит вместе, чтобы разделить урон. Другие нужно унести от игроков. Это зависит от механики, а не только от цвета круга.", "Some circles require the group to gather and share damage. Others must be taken away from players. The mechanic determines what to do, not just the circle’s colour.") },
  absorb: { label: l('Поглощение исцеления', 'Healing absorb'), detail: l("Этот эффект поглощает лечение. Пока он не исчезнет, лечение не восстанавливает здоровье.", "This effect absorbs healing. Healing cannot restore health until the effect is gone.") },
};

/** Checked on 2026-11-03; dd selects raid difficulty (14 Normal, 15 Heroic). */
export const voidspireFactSources = [
  { label: l('Изменения Blizzard', 'Blizzard changes'), href: 'https://worldofwarcraft.blizzard.com/en-us/news/24266320' },
  { label: l('Мрак: обычный режим', 'Gloom: Normal'), href: 'https://www.wowhead.com/spell=1245391/gloom?dd=14' },
  { label: l('Мрак: героический режим', 'Gloom: Heroic'), href: 'https://www.wowhead.com/spell=1245391/gloom?dd=15' },
  { label: l('Нуль-венец', 'Null Corona'), href: 'https://www.wowhead.com/spell=1233865/null-corona?dd=15' },
];
