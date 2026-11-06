// Generated from app/(site)/wow/professions/[slug]/page.tsx by npm run routes:mirror — edit the English page.
import { ProfessionPage, professionMetadata } from "@/components/wow/professions/ProfessionPage";

// Rendered once per slug on first visit, then again at most every 5 minutes with fresh prices (ISR)
// instead of a render per request. ?region=us is served by region/us (proxy.ts rewrites it).
export const dynamic = "force-static";
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { return professionMetadata("ru", (await params).slug); }
export default async function Page({ params }: Props) { return <ProfessionPage lang="ru" slug={(await params).slug} region="eu" />; }
