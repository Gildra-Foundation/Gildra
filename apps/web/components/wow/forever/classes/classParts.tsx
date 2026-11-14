import { HeartPulse, Shield, Swords } from 'lucide-react';
import { classTrees, type ClassSlug } from '@/lib/data/wow/foreverClasses';
import { foreverTalents } from '@/lib/forever/talents/data';
import { foreverCalculatorPath, foreverTalentIcon } from '@/lib/forever/talents/links';
import { foreverTreeArt } from '@/lib/games/wow/assets';
import type { Lang } from '@/lib/i18n-paths';
import { classesCopy } from './classesCopy';
import styles from './classes.module.css';

export type TreeRole = 'tank' | 'healer' | 'damage';

/** What a talent tree is played as. Feral Combat is both a bear and a cat. */
const treeRoles: Record<ClassSlug, Record<string, TreeRole[]>> = {
  druid: { balance: ['damage'], 'feral-combat': ['tank', 'damage'], restoration: ['healer'] },
  hunter: { 'beast-mastery': ['damage'], marksmanship: ['damage'], survival: ['damage'] },
  mage: { arcane: ['damage'], fire: ['damage'], frost: ['damage'] },
  paladin: { holy: ['healer'], protection: ['tank'], retribution: ['damage'] },
  priest: { discipline: ['healer'], holy: ['healer'], shadow: ['damage'] },
  rogue: { assassination: ['damage'], combat: ['damage'], subtlety: ['damage'] },
  shaman: { elemental: ['damage'], enhancement: ['damage'], restoration: ['healer'] },
  warlock: { affliction: ['damage'], demonology: ['damage'], destruction: ['damage'] },
  warrior: { arms: ['damage'], fury: ['damage'], protection: ['tank'] },
};
const roleOrder: TreeRole[] = ['tank', 'healer', 'damage'];
const roleIcons = { tank: Shield, healer: HeartPulse, damage: Swords } as const;

export type ClassTree = { id: number; slug: string; name: string; icon: string; art: string; roles: TreeRole[]; href: string };

/** The three talent trees of a class: the tree's own icon, its classic painting and the way into the calculator. */
export function treesOf(slug: ClassSlug, lang: Lang): ClassTree[] {
  const talents = foreverTalents.classes.find(entry => entry.slug === slug);
  return classTrees[slug].map(tree => ({
    id: tree.id, slug: tree.slug, name: tree.name[lang],
    icon: foreverTalentIcon(talents!.trees.find(entry => entry.id === tree.id)!.iconFileId),
    art: foreverTreeArt(slug, tree.slug),
    roles: treeRoles[slug][tree.slug],
    href: `${foreverCalculatorPath(lang, slug)}#tree-${tree.slug}`,
  }));
}

/** The roles a class can fill, in the order tank, healer, damage. */
export const rolesOf = (slug: ClassSlug) => roleOrder.filter(role => Object.values(treeRoles[slug]).some(roles => roles.includes(role)));

export function RoleBadges({ roles, lang }: { roles: TreeRole[]; lang: Lang }) {
  return <span className={styles.roles}>{roles.map(role => {
    const Icon = roleIcons[role];
    return <span key={role} className={styles.role} data-role={role}><Icon aria-hidden="true" />{classesCopy[lang].roles[role]}</span>;
  })}</span>;
}

/** The licence line of the Classic comparison (CC BY 4.0 asks for it): one quiet line under the list. */
export function ComparisonCredit({ lang }: { lang: Lang }) {
  const t = classesCopy[lang];
  return <p className={styles.credit}>{t.credit}: <a href="https://talentsforever.com" rel="noopener">Talents Forever</a> · <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener license">CC BY 4.0</a> · {t.adapted}</p>;
}
