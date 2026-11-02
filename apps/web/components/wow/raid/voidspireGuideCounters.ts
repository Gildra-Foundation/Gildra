import data from '@/lib/data/wow/mythicPlayerTools';
import type { GuideRole } from '@/lib/data/wow/raid/voidspireRoleTactics';
import type { CounterKind } from '@/lib/data/wow/raid/voidspireVideoGuide';

type Spell = { id: number; name: { ru: string; en: string }; iconUrl: string; source: string };
type Option = { spellId: number; talentSpellId?: number; effects?: string[]; note?: { ru: string; en: string } };
type Spec = { role: 'tank' | 'healer' | 'dps'; id: number; classId: number; className: { ru: string; en: string }; name: { ru: string; en: string } } & Record<'interrupt' | 'stop' | 'dispel' | 'defend', Option[]>;
export const guideSpecs = data.specs as Spec[];
const spells = data.spells as Record<string, Spell>;
// Stuns only, and only on rows explicitly describing controllable adds. No blanket boss CC.
const stuns = new Set([408, 853, 5211, 19577, 30283, 107570, 119381, 179057, 192058, 221562, 474421, 1234195]);
const examples: Record<CounterKind, number[]> = {
  interrupt: [2139, 57994, 1766], stun: [119381, 30283, 192058],
  magic: [527, 77130, 88423], defend: [22812, 108271, 104773], aoe: [1966, 22812, 108271],
};
export function guideCounters(kind: CounterKind, specId: number) {
  const spec = guideSpecs.find(item => item.id === specId);
  if (!spec) return examples[kind].flatMap(id => spells[id] ? [{ spell: spells[id], talent: false, note: undefined }] : []);
  const key = kind === 'stun' ? 'stop' : kind === 'magic' ? 'dispel' : kind === 'aoe' ? 'defend' : kind;
  return spec[key].filter(option => {
    if (kind === 'magic') return option.effects?.includes('magic');
    if (kind === 'stun') return stuns.has(option.spellId);
    // Feint is AoE-only without Elusiveness. Never suggest it for an arbitrary tank hit or DoT.
    if (kind === 'defend' && option.spellId === 1966) return false;
    return true;
  }).flatMap(option => spells[option.spellId] ? [{ spell: spells[option.spellId], talent: Boolean(option.talentSpellId), note: option.note }] : []);
}

const rangedSpecs = new Set([62, 63, 64, 102, 253, 254, 258, 262, 265, 266, 267, 1467, 1473, 1480]);
export function guideRole(specId: number): GuideRole | undefined {
  const spec = guideSpecs.find(item => item.id === specId);
  if (!spec) return undefined;
  if (spec.role !== 'dps') return spec.role;
  return rangedSpecs.has(specId) ? 'ranged' : 'melee';
}
