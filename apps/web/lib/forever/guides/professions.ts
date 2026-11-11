import 'server-only';
import snapshot from '@/data/wow/forever/professions/catalog.json';
export type LocaleText = { en: string; ru: string };
export type Recipe = {
  id: number; icon: number; name: LocaleText; requiredSkill: number | null; yellow: number | null; grey: number | null;
  reagents: { id: number; quantity: number }[];
  output: { id: number; quantity: number; quantityRange: number[] | null } | null;
  auto: boolean; trainers: string[]; sourceItems: number[]; tools: string[]; station: string | null; campTier: number | null; new: boolean;
};
export type Profession = {
  slug: string; icon: number; skillLineId: number; kind: 'crafting' | 'gathering' | 'secondary'; name: LocaleText; maxSkill: number;
  ranks: { name: string; maxSkill: number }[]; recipes: Recipe[];
  items: Record<string, { name: LocaleText; quality: number; icon: number }>;
  trainers: { id: number; name: string; faction: string; zone: string | null; x: number | null; y: number | null }[];
};
export const professions = snapshot.professions as unknown as Profession[];
export const professionBySlug = (slug: string) => professions.find(p => p.slug === slug);
export type RecipeFilters = { q?: string; source?: string; skill?: string; camp?: string; page?: string; fresh?: string };
export function filterRecipes(profession: Profession, filters: RecipeFilters) {
  const query = (filters.q ?? '').normalize('NFKC').trim().toLocaleLowerCase();
  const skill = /^\d{1,3}$/.test(filters.skill ?? '') ? Math.min(300, Number(filters.skill)) : null;
  return profession.recipes.filter(r => {
    const names = [r.name.en, r.name.ru, ...r.reagents.flatMap(x => Object.values(profession.items[x.id].name))].join(' ').normalize('NFKC').toLocaleLowerCase();
    return (!query || names.includes(query)) && (skill === null || (r.requiredSkill !== null && r.requiredSkill <= skill)) &&
      (filters.camp !== 'yes' || r.campTier !== null) && (filters.fresh !== 'yes' || r.new) &&
      (!filters.source || filters.source === 'all' || (filters.source === 'trainer' && r.trainers.length > 0) || (filters.source === 'recipe' && r.sourceItems.length > 0) || (filters.source === 'automatic' && r.auto));
  });
}
export function pageNumber(value: string | undefined, count: number, size = 50) {
  const number = value && /^\d+$/.test(value) ? Number(value) : 1;
  return Math.max(1, Math.min(Math.ceil(count / size) || 1, Number.isSafeInteger(number) ? number : 1));
}
export function craftingMaterials(recipe: Recipe, crafts: number) {
  const safe = Number.isSafeInteger(crafts) ? Math.max(1, Math.min(999, crafts)) : 1;
  return recipe.reagents.map(r => ({ ...r, quantity: r.quantity * safe }));
}
