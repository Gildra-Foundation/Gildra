import type { GuideText } from './voidspireVideoGuide';

const l = (ru: string, en: string): GuideText => ({ru, en});
export type InterruptTarget = {
  enemies: { name: GuideText; detail: GuideText; npcId?: number; artwork?: string; artworkPosition?: string }[];
  spellId: number; cast: GuideText; consequence: GuideText; timing: GuideText;
};
// Spell identities/effects checked against nether.wowhead.com/tooltip/spell/{id} with dd=14/15 (Normal/Heroic) on 2026-11-03.
// Timing and assignments: supplied boss videos, linked in voidspireVideoGuide.
export const voidspireInterruptTargets: Record<string, Record<string, InterruptTarget>> = {
  'imperator-averzian': {
    bulwark: {
      enemies: [
        {npcId:251239, artwork:'/assets/wow/raids/midnight/enemies/251239.webp', name:l('Стойкий защитник из Темной Стражи','Shadowguard Stalwart'), detail:l('Подкрепление из разлома. Танк собирает этих врагов вместе, а рейд убивает их первыми.', 'A reinforcement from a rift. The tank gathers these enemies together; the raid kills them first.')},
        {npcId:256757, artwork:'/assets/wow/raids/midnight/enemies/256757.webp', name:l('Скованный Бездной аннигилятор','Voidbound Annihilator'), detail:l('Крупный враг из подкрепления. На героической сложности танк держит его подальше от босса.', 'A large reinforcement. On Heroic, the tank keeps it away from the boss.')},
      ],
      spellId:1255702, cast:l('Непроницаемый оплот','Pitch Bulwark'),
      consequence:l('Даёт союзникам этого врага щит, поглощающий урон.', 'Shields the caster’s allies, absorbing damage.'),
      timing:l('Прервите Непроницаемый оплот у назначенного вам врага, пока он колдует. Запасной игрок вмешивается, только если основной не успел.', 'Interrupt your assigned enemy while it casts Pitch Bulwark. The backup player interrupts only if the first player misses.'),
    },
  },
  'fallen-king-salhadaar': {
    images: {
      enemies:[{npcId:251791, artwork:'/assets/wow/raids/midnight/enemies/251791.webp',name:l('Расколотый образ','Fractured Image'),detail:l('Неподвижная копия Салхадаара. На обычной и героической сложности она исчезает после одного прерывания или контроля. Дальние копии поручайте игрокам с подходящей дальностью способности.', 'A stationary copy of Salhadaar. On Normal and Heroic, one interrupt or crowd-control effect removes it. Assign distant copies to players whose abilities can reach them.')}],
      spellId:1254088, cast:l('Раскол Тьмы','Shadow Fracture'),
      consequence:l('Если копия закончит заклинание, весь рейд получит урон, а на земле останется опасная лужа.', 'If the copy finishes its cast, it damages the raid and leaves a dangerous pool.'),
      timing:l('Остановите заклинание своей копии до конца применения. Если её уже остановил другой игрок, сохраните способность.', 'Stop your assigned copy before its cast finishes. If another player has already stopped it, save your interrupt.'),
    },
  },
  'vaelgor-ezzorak': {
    adds: {
      enemies:[{npcId:248143, artwork:'/assets/wow/raids/midnight/enemies/248143.png', artworkPosition:'-449px -179px',name:l('Сфера Бездны','Voidorb'),detail:l('Появляется на месте игрока после Воя Бездны и снова и снова выпускает Стрелу Бездны. Соберите сферы вместе, оглушите и убейте ударами по области.', 'Appears at a player’s position after Void Howl and repeatedly casts Voidbolt. Gather the orbs, stun them and use area attacks to kill them.')}],
      spellId:1245175, cast:l('Стрела Бездны','Voidbolt'),
      consequence:l('Наносит урон игроку сразу, затем продолжает ранить его в течение 5 секунд.', 'Hits a player and continues damaging them for 5 seconds.'),
      timing:l('Прервите Стрелу Бездны, пока сфера её применяет. Вой Бездны самого дракона прервать нельзя.', 'Interrupt Voidbolt while the orb is casting it. The dragon’s Void Howl cannot be interrupted.'),
    },
  },
  'lightblinded-vanguard': {
    shield: {
      enemies:[{npcId:240438, artwork:'/assets/wow/raids/midnight/enemies/240438.webp',name:l('Боевой капеллан Сенн','War Chaplain Senn'),detail:l('Прыгает к дальнему игроку и укрывается Священным щитом. Пока щит держится, Сенн нельзя прервать — сначала разбейте его уроном.', 'Leaps to a distant player and gains Sacred Shield. She cannot be interrupted while the shield holds: break it with damage first.')}],
      spellId:1258514, cast:l('Слепящий свет','Blinding Light'),
      consequence:l('Наносит урон всему рейду и дезориентирует игроков.', 'Damages the entire raid and disorients players.'),
      timing:l('Как только щит исчезнет, прервите Слепящий свет до конца применения. Оглушить Сенн нельзя.', 'As soon as the shield breaks, interrupt Blinding Light before it finishes. Senn cannot be stunned.'),
    },
  },
};
