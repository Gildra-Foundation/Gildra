// Generated from app/(site)/wow/professions/[slug]/region/[region]/page.tsx by npm run routes:mirror — edit the English page.
import { notFound } from "next/navigation";
import { ProfessionPage, professionMetadata } from "@/components/wow/professions/ProfessionPage";

// The US-price view of /wow/professions/<slug>?region=us (proxy.ts rewrites that URL here and
// answers 404 to this path when it is opened directly); canonical stays on the profession page.
export const dynamic = "force-static";
export const revalidate = 300;

type Props = { params: Promise<{ slug: string; region: string }> };
export async function generateMetadata({ params }: Props) { return professionMetadata("ru", (await params).slug); }
export default async function Page({ params }: Props) {
  const { slug, region } = await params;
  if (region !== "us") notFound();
  return <ProfessionPage lang="ru" slug={slug} region={region} />;
}
