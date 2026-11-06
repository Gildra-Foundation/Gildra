// Generated from app/(site)/wow/professions/[slug]/page.tsx by npm run routes:mirror — edit the English page.
import { ProfessionPage, professionMetadata } from "@/components/wow/professions/ProfessionPage";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return professionMetadata("ru", (await params).slug); }
export default async function Page({ params, searchParams }: Props) { return <ProfessionPage lang="ru" slug={(await params).slug} searchParams={searchParams} />; }
