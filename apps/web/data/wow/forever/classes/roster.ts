import type { ClassSlug, Localized } from './model';
export type ForeverClass = { slug: ClassSlug; id: number; icon: string; name: Localized; description: Localized };
export const foreverClasses: ForeverClass[] = [
  { slug: 'druid', id: 11, icon: 'druid', name: { en: 'Druid', ru: 'Друид' }, description: { en: 'Shapeshifting, healing over time and the magic of nature.', ru: 'Смена облика, периодическое исцеление и магия природы.' } },
  { slug: 'hunter', id: 3, icon: 'hunter', name: { en: 'Hunter', ru: 'Охотник' }, description: { en: 'Ranged weapons, traps and a companion at your side.', ru: 'Стрелковое оружие, ловушки и верный питомец.' } },
  { slug: 'mage', id: 8, icon: 'mage', name: { en: 'Mage', ru: 'Маг' }, description: { en: 'Arcane, fire and frost spells with control over the battlefield.', ru: 'Тайная магия, огонь и лёд для урона и контроля противников.' } },
  { slug: 'paladin', id: 2, icon: 'pal', name: { en: 'Paladin', ru: 'Паладин' }, description: { en: 'Seals and judgements alongside healing and shield combat.', ru: 'Печати и правосудие, исцеление и бой со щитом.' } },
  { slug: 'priest', id: 5, icon: 'priest', name: { en: 'Priest', ru: 'Жрец' }, description: { en: 'Holy healing, protective shields and shadow magic.', ru: 'Свет для исцеления и защиты, Тьма для нанесения урона.' } },
  { slug: 'rogue', id: 4, icon: 'rogue', name: { en: 'Rogue', ru: 'Разбойник' }, description: { en: 'Stealth, poisons and finishing moves powered by combo points.', ru: 'Незаметность, яды и завершающие приёмы за очки серии.' } },
  { slug: 'shaman', id: 7, icon: 'shaman', name: { en: 'Shaman', ru: 'Шаман' }, description: { en: 'Totems, elemental spells and healing for your allies.', ru: 'Тотемы, заклинания стихий и исцеление союзников.' } },
  { slug: 'warlock', id: 9, icon: 'lock', name: { en: 'Warlock', ru: 'Чернокнижник' }, description: { en: 'Demons, draining spells and lasting curses.', ru: 'Демоны, вытягивание жизненных сил и длительные проклятия.' } },
  { slug: 'warrior', id: 1, icon: 'war', name: { en: 'Warrior', ru: 'Воин' }, description: { en: 'Stances, weapon attacks and rage earned in combat.', ru: 'Стойки, оружие и ярость, накопленная в бою.' } },
];
export function foreverClass(slug: string): ForeverClass | undefined { return foreverClasses.find(c => c.slug === slug); }
