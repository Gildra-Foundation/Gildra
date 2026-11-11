import { RecipePage, professionMetadata } from '@/components/wow/forever/professions/ProfessionPages';
type Props = { params: Promise<{ slug: string; recipeId: string }> };
export async function generateMetadata({ params }: Props) { const {slug,recipeId} = await params; return professionMetadata('en',slug,recipeId); }
export default async function Page({ params }: Props) { return <RecipePage lang="en" {...await params} />; }
