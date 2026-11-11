import { ProfessionPage, professionMetadata } from '@/components/wow/forever/professions/ProfessionPages';
import type { RecipeFilters } from '@/lib/forever/guides/professions';
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return professionMetadata('en', (await params).slug); }
export default async function Page({ params, searchParams }: Props) {
 const {slug} = await params; const query = await searchParams; const filters: RecipeFilters = {};
 for (const key of ['q','source','skill','camp','page','fresh'] as const) if (typeof query[key] === 'string') filters[key] = query[key];
 return <ProfessionPage lang="en" slug={slug} filters={filters} />;
}
