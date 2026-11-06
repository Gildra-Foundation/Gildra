// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { ProfessionPage, professionMetadata } from "@/components/wow/professions/ProfessionPage";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return professionMetadata("en", (await params).slug); }
export default async function Page({ params, searchParams }: Props) { return <ProfessionPage lang="en" slug={(await params).slug} searchParams={searchParams} />; }
