import { voidspireVideoGuides } from '@/lib/data/wow/raid/voidspireVideoGuide';
import catalogue from '@/lib/data/wow/mythicPlayerTools';

export type GuideSelection = { boss: string; difficulty: 'normal' | 'heroic'; specId: number };
export function readGuideSelection(hash: string): GuideSelection {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const candidate = params.get('boss');
  const guide = voidspireVideoGuides.find(item => item.slug === candidate) ?? voidspireVideoGuides[0];
  return {
    boss: candidate === 'trash' || params.has('raid-pull') ? 'trash' : guide.slug,
    difficulty: guide.heroicOnly || params.get('difficulty') === 'heroic' ? 'heroic' : 'normal',
    specId: catalogue.specs.some(spec => spec.id === Number(params.get('spec'))) ? Number(params.get('spec')) : 0,
  };
}
export function guideHash(selection: GuideSelection): string {
  const params = new URLSearchParams({ boss: selection.boss, difficulty: selection.difficulty });
  if (selection.specId) params.set('spec', String(selection.specId));
  return `#${params}`;
}
