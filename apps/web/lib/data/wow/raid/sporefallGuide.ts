/** N/H tactics paraphrased from the cited guides and current game tooltips. */
import type { GuideRole } from './voidspireRoleTactics';
import type { CounterKind, GuideText } from './voidspireVideoGuide';

export type SporefallStep = {
  id: string; title: GuideText; body: GuideText; heroicBody?: GuideText;
};
export type SporefallMechanic = {
  id: string; spellId: number; name: GuideText; spellIcon?: string;
  signal: GuideText; response: GuideText; heroic?: GuideText; heroicOnly?: boolean;
  counters: CounterKind[]; counterRoles: GuideRole[];
  roleActions?: Partial<Record<GuideRole, GuideText>>;
};
export type SporefallAdd = {
  id: string; npcId: number; name: GuideText; portrait?: string;
  description: GuideText; action: GuideText; death: GuideText; heroicOnly?: boolean;
  cast?: { spellId: number; name: GuideText; description: GuideText; action: GuideText };
};
export type SporefallGuide = {
  name: GuideText; raidName: GuideText; goal: GuideText;
  priorities: SporefallStep[]; flow: SporefallStep[];
  roles: Record<GuideRole, { position: GuideText; actions: GuideText[]; heroic?: GuideText }>;
  mechanics: SporefallMechanic[]; adds: SporefallAdd[];
  diagram: { caption: GuideText; heroicCaption: GuideText; steps: { title: GuideText; body: GuideText }[] };
  sources: { title: string; url: string }[]; reviewedAt: string;
};
const l = (ru: string, en: string): GuideText => ({ ru, en });
const icon = (id: number) => `/assets/wow/raids/reviewed-spells/${id}.jpg`;
const all: GuideRole[] = ['tank', 'healer', 'melee', 'ranged'];

export const sporefallGuide: SporefallGuide = {
  name: l('Гнилотоп', 'Rotmire'), raidName: l('Споропад', 'Sporefall'),
  reviewedAt: '2026-11-04',
  goal: l('Убивайте грибных прислужников рядом друг с другом. На 100 энергии из их тел вырастут новые грибы — уничтожьте их до взрыва.', 'Kill the fungal minions close together. At 100 energy, new mushrooms grow from their bodies: destroy them before they explode.'),
  priorities: [
    { id: 'awaken', title: l('Соберите прислужников вместе', 'Bring the minions together'), body: l('Если гриботварь преследует вас, приведите её к боссу.', 'If a Shroomling chases you, lead it to the boss.'), heroicBody: l('Ведите гриботварей к Спорошляпнику. Прерывайте его Выброс яда.', 'Lead Shroomlings to the Sporecap. Interrupt its Poison Burst.') },
    { id: 'bloom', title: l('Убейте грибы до взрыва', 'Kill mushrooms before they explode'), body: l('Добейте живых прислужников до Плеснецвета. Затем убейте выросшие на их телах грибы.', 'Finish living minions before Fungal Bloom. Then kill the mushrooms growing from their bodies.') },
    { id: 'vines', title: l('Унесите лианы к краю', 'Take vines to the edge'), body: l('С кругом лиан отойдите от союзников: под вами останется опасная область.', 'With a vine circle, move away from others: dangerous ground will remain beneath you.') },
  ],
  flow: [
    { id: 'pull', title: l('Начало боя', 'Start the fight'), body: l('Группа собирается рядом с боссом. Танки меняются после каждого Гнилостного кулака.', 'Gather near the boss. Tanks swap after every Putrid Fist.') },
    { id: 'waves', title: l('Появляются прислужники', 'Minions appear'), body: l('Выйдите из кругов появления. Приведите преследующих вас гриботварей к боссу и убейте их вместе.', 'Leave the spawn circles. Bring the Shroomlings chasing you to the boss and kill them together.'), heroicBody: l('Дождитесь взрыва кругов. Танк подводит босса к неподвижному Спорошляпнику; преследуемые игроки приводят туда гриботварей. Прерывайте Выброс яда.', 'Wait for the spawn circles to burst. The tank moves the boss to the stationary Sporecap; chased players bring their Shroomlings there. Interrupt Poison Burst.') },
    { id: 'energy', title: l('Босс набирает 100 энергии', 'The boss reaches 100 energy'), body: l('До конца применения Плеснецвета убейте всех живых прислужников. Готовьтесь к общему урону и отбрасыванию.', 'Kill every living minion before Fungal Bloom finishes casting. Prepare for group damage and a knockback.') },
    { id: 'mushrooms', title: l('Из тел вырастают грибы', 'Mushrooms grow from the bodies'), body: l('Переключитесь на разрывающиеся грибы: их заклинание длится 16 секунд. Убейте их до взрыва, затем вернитесь к боссу. Цикл повторится.', 'Switch to Bursting Shrooms: their cast lasts 16 seconds. Kill them before the explosion, then return to the boss. The cycle repeats.') },
  ],
  roles: {
    tank: {
      position: l('Держите босса рядом с местом, где группа убивает прислужников.', 'Keep the boss near the group’s minion kill spot.'),
      actions: [l('Перед Гнилостным кулаком уменьшите получаемый урон. Сразу после удара второй танк забирает босса провокацией.', 'Use damage reduction before Putrid Fist. Immediately after the hit, the other tank taunts the boss.'), l('Гриботварь идёт за выбранным игроком: место её гибели зависит от того, куда он её приведёт.', 'A Shroomling follows its chosen player: that player determines where it can be killed.')],
      heroic: l('После взрыва круга появления подведите босса к Спорошляпнику: сам прислужник не двигается.', 'Once its spawn circle bursts, move the boss to the Sporecap: the minion cannot move.'),
    },
    healer: {
      position: l('Стойте рядом с группой, чтобы доставать лечением до танков и игроков, уходящих с лианами.', 'Stay near the group, within healing range of the tanks and players moving out with vines.'),
      actions: [l('На Плеснецвет приготовьте сильное лечение: после первого удара урон продолжается 16 секунд.', 'Prepare strong healing for Fungal Bloom: damage continues for 16 seconds after the initial hit.'), l('Поддерживайте игроков с лианами. К концу боя Гнойные пустулы усиливают постоянный урон по группе.', 'Support players with vines. Later in the fight, Rotting Pustules increases the group’s ongoing damage.')],
      heroic: l('Пропущенный Выброс яда наносит урон всей группе и оставляет суммирующийся эффект на 16 секунд.', 'A missed Poison Burst damages the whole group and leaves a stacking effect for 16 seconds.'),
    },
    melee: {
      position: l('Стойте у босса рядом с местом гибели прислужников; выходите из кругов их появления.', 'Stay by the boss near the minion kill spot; leave their spawn circles.'),
      actions: [l('Убивайте собранных прислужников атаками по области. После Плеснецвета сразу переходите на грибы.', 'Use area attacks on grouped minions. Switch to mushrooms as soon as Fungal Bloom ends.'), l('Если получили лианы, отойдите от группы до окончания эффекта.', 'If you get vines, move away from the group before the effect expires.')],
      heroic: l('Подойдите к Спорошляпнику и прервите Выброс яда в свою очередь. Не тратьте прерывание одновременно с другим игроком.', 'Reach the Sporecap and interrupt Poison Burst on your turn. Avoid interrupting at the same time as another player.'),
    },
    ranged: {
      position: l('Стойте на расстоянии, с которого достаёте до босса и собранных прислужников. Оставьте свободный путь к краю для лиан.', 'Stand where you can reach both the boss and grouped minions. Keep a clear route to the edge for vines.'),
      actions: [l('Приведите преследующую вас гриботварь к общему месту убийства, прежде чем добивать её.', 'Bring a Shroomling chasing you to the shared kill spot before finishing it.'), l('После Плеснецвета добивайте грибы, до которых не достают ближние бойцы.', 'After Fungal Bloom, finish mushrooms that melee players cannot reach.')],
      heroic: l('Если вам назначено прерывание, заранее подойдите на дальность своей способности к Спорошляпнику.', 'If assigned an interrupt, move within your ability’s range of the Sporecap before the cast.'),
    },
  },
  mechanics: [
    {
      id: 'awaken', spellId: 1221622, name: l('Грибное пробуждение', 'Awaken Fungi'), spellIcon: icon(1221622),
      signal: l('На земле появляются круги, затем из них выходят прислужники.', 'Circles appear on the ground, followed by minions.'),
      response: l('Отойдите от мест появления: взрыв задевает игроков в радиусе 6 м. Если гриботварь побежала за вами, приведите её к боссу. Убивайте прислужников вместе, чтобы их тела лежали рядом.', 'Leave the spawn locations: the explosion hits within 6 yd. If a Shroomling chases you, lead it to the boss. Kill minions together to keep their bodies close.'),
      heroic: l('Появляется и неподвижный Спорошляпник. После взрыва его круга перенесите место боя к нему и убивайте гриботварей рядом.', 'A stationary Sporecap also appears. After its spawn circle bursts, move the fight to it and kill Shroomlings nearby.'),
      counters: [], counterRoles: [],
    },
    {
      id: 'poison', spellId: 1221714, name: l('Выброс яда', 'Poison Burst'), spellIcon: icon(1221714), heroicOnly: true,
      signal: l('Спорошляпник начинает применять Выброс яда.', 'The Sporecap starts casting Poison Burst.'),
      response: l('Выберите Спорошляпника и прервите заклинание до конца 6-секундного применения. Заранее назначьте основного и запасного игрока. Пропущенное заклинание поражает всю группу и оставляет суммирующийся яд.', 'Target the Sporecap and interrupt before its 6-second cast finishes. Assign a primary player and a backup beforehand. A completed cast hits the whole group and leaves stacking poison.'),
      counters: ['interrupt'], counterRoles: all,
      roleActions: { ranged: l('Дальность прерывания может быть меньше дальности ваших атак — подойдите заранее.', 'Your interrupt may have a shorter range than your attacks: move closer beforehand.') },
    },
    {
      id: 'bloom', spellId: 1221637, name: l('Плеснецвет', 'Fungal Bloom'), spellIcon: icon(1221637),
      signal: l('На 100 энергии босс начинает Плеснецвет.', 'At 100 energy, the boss begins Fungal Bloom.'),
      response: l('Добейте живых прислужников до завершения заклинания: иначе они полностью исцелятся, усилятся и станут невосприимчивы к контролю и прерыванию. Удар отбрасывает всю группу и оставляет урон на 16 секунд. На телах вырастают грибы.', 'Finish living minions before the cast ends: otherwise they heal to full, grow stronger and become immune to control and interrupts. The hit knocks the group back and leaves 16 seconds of damage. Mushrooms grow from the bodies.'),
      counters: ['defend'], counterRoles: all,
      roleActions: { healer: l('Лечите группу и после первого удара: периодический урон продолжается.', 'Keep healing after the initial hit: periodic damage continues.') },
    },
    {
      id: 'shrooms', spellId: 1221965, name: l('Разрывающийся гриб', 'Bursting Shroom'), spellIcon: icon(1221965),
      signal: l('После Плеснецвета на месте погибших прислужников появляются грибы.', 'After Fungal Bloom, mushrooms appear where minions died.'),
      response: l('Сразу атакуйте грибы. Убейте каждый до конца его 16-секундного заклинания — взрыв наносит урон всем, даже если стоять далеко. Здесь нужно убить врага, а не прервать заклинание.', 'Attack the mushrooms immediately. Kill each before its 16-second cast ends: the explosion damages everyone, even far away. Kill the enemy rather than relying on an interrupt.'),
      counters: [], counterRoles: [],
    },
    {
      id: 'vines', spellId: 1222088, name: l('Гнойные лианы', 'Festering Vines'), spellIcon: icon(1222088),
      signal: l('Вокруг вас появляется круг лиан, движение замедляется.', 'A vine circle surrounds you and your movement slows.'),
      response: l('Отойдите к свободному краю, дальше 7 м от других игроков. Дождитесь окончания эффекта и выйдите из оставшейся области. Не оставляйте её там, где группа убивает прислужников.', 'Move to a clear edge, more than 7 yd from other players. Wait for the effect to expire, then leave the remaining ground effect. Keep it away from the minion kill spot.'),
      counters: [], counterRoles: [],
      roleActions: { healer: l('Поддержите отмеченных игроков лечением, пока они отходят.', 'Heal marked players as they move out.') },
    },
    {
      id: 'fist', spellId: 1221781, name: l('Гнилостный кулак', 'Putrid Fist'), spellIcon: icon(1221781),
      signal: l('Босс применяет Гнилостный кулак к текущему танку.', 'The boss casts Putrid Fist on the current tank.'),
      response: l('Танк уменьшает получаемый урон перед ударом. После попадания второй танк сразу забирает босса провокацией: пострадавший получает на 75% больше физического урона в течение 14 секунд.', 'The tank uses damage reduction before the hit. The other tank taunts immediately afterwards: the struck tank takes 75% more physical damage for 14 seconds.'),
      counters: ['defend'], counterRoles: ['tank'],
    },
    {
      id: 'pustules', spellId: 1222176, name: l('Гнойные пустулы', 'Rotting Pustules'), spellIcon: icon(1222176),
      signal: l('После Лопающихся пустул постоянный урон по группе возрастает.', 'After Bursting Pustules, ongoing group damage increases.'),
      response: l('Целители распределяют сильные способности лечения между Плеснецветами и сохраняют запас на конец боя. Остальные избегают лишнего урона и быстро убивают прислужников, чтобы не затягивать бой.', 'Healers spread strong healing abilities across Fungal Blooms and keep some ready for later in the fight. Everyone else avoids extra damage and kills minions promptly to keep the fight short.'),
      counters: [], counterRoles: [],
    },
  ],
  adds: [
    { id: 'shroomling', npcId: 238696, portrait: '/assets/wow/raids/sporefall/enemies/238696.webp', name: l('Гриботварь', 'Shroomling'), description: l('Выбирает игрока и преследует его.', 'Chooses a player and chases them.'), action: l('Приведите её к общему месту убийства, затем добейте.', 'Bring it to the shared kill spot, then finish it.'), death: l('Оставляет тело, из которого на Плеснецвете вырастет гриб.', 'Leaves a body that grows a mushroom during Fungal Bloom.') },
    { id: 'sporecap', npcId: 238699, portrait: '/assets/wow/raids/sporefall/enemies/238699.webp', name: l('Спорошляпник', 'Sporecap'), heroicOnly: true, description: l('Неподвижный прислужник героической сложности. Применяет Выброс яда и Чумной выстрел.', 'A stationary Heroic minion. Casts Poison Burst and Blightshot.'), action: l('Прерывайте Выброс яда и убивайте в первую очередь. Приведите гриботварей к нему.', 'Interrupt Poison Burst and kill it first. Bring Shroomlings to it.'), death: l('Его тело тоже превращается в разрывающийся гриб.', 'Its body also becomes a Bursting Shroom.'), cast: { spellId: 1221714, name: l('Выброс яда', 'Poison Burst'), description: l('6 секунд применения; урон по всей группе и суммирующийся яд на 16 секунд.', 'A 6-second cast; group-wide damage and stacking poison for 16 seconds.'), action: l('Прервите заклинание в назначенную вам очередь.', 'Interrupt the spell on your assigned turn.') } },
    { id: 'bursting-shroom', npcId: 238853, name: l('Разрывающийся гриб', 'Bursting Shroom'), description: l('Вырастает из тела прислужника после Плеснецвета.', 'Grows from a minion’s body after Fungal Bloom.'), action: l('Убейте до конца 16-секундного применения, иначе взрыв заденет всю группу.', 'Kill it before its 16-second cast ends, or the explosion hits the entire group.'), death: l('Убитый вовремя гриб не завершит взрыв.', 'A mushroom killed in time cannot finish its explosion.') },
  ],
  diagram: {
    caption: l('Приводите гриботварей к боссу. Лианы оставляйте у свободного края.', 'Bring Shroomlings to the boss. Leave vines at a clear edge.'),
    heroicCaption: l('Перемещайте босса и гриботварей к появившемуся Спорошляпнику. Лианы оставляйте в стороне.', 'Move the boss and Shroomlings to the new Sporecap. Leave vines away from them.'),
    steps: [
      { title: l('Прислужники рядом', 'Minions together'), body: l('Убивайте их в одном месте, чтобы затем достать атаками до всех грибов.', 'Kill them in one spot so you can reach all the mushrooms afterwards.') },
      { title: l('Лианы у края', 'Vines at the edge'), body: l('Отмеченный игрок уходит дальше 7 м от союзников и освобождает путь группе.', 'The marked player moves over 7 yd from allies and keeps the group’s path clear.') },
    ],
  },
  sources: [
    { title: 'Blizzard — Sporefall', url: 'https://news.blizzard.com/en-us/article/24272110/prepare-to-face-rotmire-in-the-sporefall-raid' },
    { title: 'Method — Rotmire Heroic (15 Jun 2026)', url: 'https://www.method.gg/guides/sporefall/rotmire-heroic' },
    { title: 'Panthea — Normal / Heroic (8 Jun 2026)', url: 'https://www.icy-veins.com/wow/rotmire-raid-guide/' },
    { title: 'Wowhead — Adventure Guide', url: 'https://www.wowhead.com/guide/midnight/raids/sporefall-rotmire-boss-strategy-abilities-cheat-sheet-rewards' },
    { title: 'Game spell data — Fungal Bloom', url: 'https://www.wowhead.com/spell=1221637' },
    { title: 'Game spell data — Poison Burst', url: 'https://www.wowhead.com/spell=1221714' },
    { title: 'Game spell data — Putrid Fist', url: 'https://www.wowhead.com/spell=1221781' },
    { title: 'Game spell data — Festering Vines', url: 'https://www.wowhead.com/spell=1222088' },
  ],
};
