import type { GuideText } from './voidspireVideoGuide';

const l = (ru: string, en: string): GuideText => ({ru, en});
export type InterruptTarget = {
  enemies: { name: GuideText; detail: GuideText; npcId?: number }[];
  spellId: number; cast: GuideText; consequence: GuideText; timing: GuideText;
};
// Spell identities/effects checked against nether.wowhead.com/tooltip/spell/{id} on 2026-11-02.
// Timing and assignments: supplied boss videos, linked in voidspireVideoGuide.
export const voidspireInterruptTargets: Record<string, Record<string, InterruptTarget>> = {
  'imperator-averzian': {
    bulwark: {
      enemies: [
        {npcId:251239, name:l('Стойкий защитник из Темной Стражи','Shadowguard Stalwart'), detail:l('Активное подкрепление из разлома. Выберите защитника, который сейчас читает Непроницаемый оплот; танк собирает подкрепления, рейд убивает их в приоритете.', 'An active rift reinforcement. Target the Stalwart currently casting Pitch Bulwark; the tank collects reinforcements and the raid kills them first.')},
        {npcId:256757, name:l('Скованный Бездной аннигилятор','Voidbound Annihilator'), detail:l('Крупное подкрепление. Прерывайте Непроницаемый оплот у текущего кастера. В героике танк держит крупных аддов вдали от босса.', 'A large reinforcement. Interrupt Pitch Bulwark on the current caster. On Heroic the tank keeps large adds away from the boss.')},
      ],
      spellId:1255702, cast:l('Непроницаемый оплот','Pitch Bulwark'),
      consequence:l('Даёт союзникам кастера щит, поглощающий урон.', 'Shields the caster’s allies, absorbing damage.'),
      timing:l('Сбивайте во время каста у назначенного адда. Запасной кик — только если основной пропущен.', 'Interrupt your assigned add during the cast. Use the backup kick only if the primary misses.'),
    },
  },
  'fallen-king-salhadaar': {
    images: {
      enemies:[{name:l('Расколотый образ','Fractured Image'),detail:l('Неподвижная копия Салхадаара. В обычном и героическом режиме одного прерывания или контроля достаточно, чтобы убрать её. Дальние копии распределяйте по реальному радиусу киков.', 'A stationary Salhadaar image. On Normal and Heroic one interrupt or control effect removes it. Assign distant images according to actual interrupt range.')}],
      spellId:1254088, cast:l('Раскол Тьмы','Shadow Fracture'),
      consequence:l('Пропущенный каст наносит урон рейду и оставляет лужу.', 'A completed cast damages the raid and leaves a pool.'),
      timing:l('Прервите назначенную копию до завершения каста. Не тратьте второй кик в уже остановленную цель.', 'Interrupt your assigned image before its cast finishes. Do not spend a second kick on an image already stopped.'),
    },
  },
  'vaelgor-ezzorak': {
    adds: {
      enemies:[{name:l('Сфера Бездны','Voidorb'),detail:l('Появляется на месте игрока после Воя Бездны. Кик направляйте в эту сферу: она повторно читает Стрелу Бездны. Сферы собирают, оглушают и убивают общим уроном.', 'Spawns at a player’s location after Void Howl. Interrupt this orb: it repeatedly casts Voidbolt. Group, stun and cleave the orbs.')}],
      spellId:1245175, cast:l('Стрела Бездны','Voidbolt'),
      consequence:l('Бьёт случайного игрока и накладывает накапливающийся периодический урон.', 'Hits a random player and applies stacking damage over time.'),
      timing:l('После появления сфер выберите кастующую сферу и сбейте Стрелу Бездны. Сам Вой Бездны киком не останавливают.', 'After the orbs spawn, target a casting orb and interrupt Voidbolt. An interrupt does not stop Void Howl itself.'),
    },
  },
  'lightblinded-vanguard': {
    shield: {
      enemies:[{npcId:240438,name:l('Боевой капеллан Сенн','War Chaplain Senn'),detail:l('Прыгает к дальнему игроку и закрывается Священным щитом. Пока поглощение активно, Сенн невосприимчива к прерыванию: сначала пробейте щит уроном.', 'Leaps to a distant player and gains Sacred Shield. While the absorb is active Senn is immune to interrupts: break the shield with damage first.')}],
      spellId:1258514, cast:l('Слепящий свет','Blinding Light'),
      consequence:l('Наносит урон всему рейду и дезориентирует игроков.', 'Damages the entire raid and disorients players.'),
      timing:l('Кик только после снятия Священного щита, до окончания Слепящего света. Оглушение босса не заменяет кик.', 'Interrupt only after Sacred Shield breaks, before Blinding Light completes. A boss stun is not a substitute for an interrupt.'),
    },
  },
};
