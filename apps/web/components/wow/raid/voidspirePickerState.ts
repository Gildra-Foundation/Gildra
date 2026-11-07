import { talentSpecThemes } from '@/lib/talentSpecThemes';
import { guideRole, guideSpecs } from './voidspireGuideCounters';

export const voidspireClasses = [...new Map(guideSpecs.map(spec => [spec.classId, {
  id: spec.classId,
  name: spec.className,
  icon: talentSpecThemes.find(theme => theme.classId === spec.classId)!.classIconUrl,
}])).values()];

/** The external specialization is the only state: links, history and pull selection stay in sync. */
export function guideClassForSpec(specId: number): number {
  return guideSpecs.find(spec => spec.id === specId)?.classId ?? 0;
}
export function guideSpecForClass(classId: number, previousSpecId: number): number {
  const specs = guideSpecs.filter(spec => spec.classId === classId);
  if (specs.some(spec => spec.id === previousSpecId)) return previousSpecId;
  const role = guideRole(previousSpecId);
  return specs.find(spec => role && guideRole(spec.id) === role)?.id ?? specs[0]?.id ?? 0;
}

export const voidspirePickerCopy = {
  ru: { classLabel: 'Класс', specLabel: 'Специализация', chooseClass: 'Сначала класс' },
  en: { classLabel: 'Class', specLabel: 'Specialization', chooseClass: 'Class first' },
};
