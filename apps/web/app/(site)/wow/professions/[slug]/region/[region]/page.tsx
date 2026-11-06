// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { notFound } from "next/navigation";
import { ProfessionPage, professionMetadata } from "@/components/wow/professions/ProfessionPage";

// The US-price view of /wow/professions/<slug>?region=us (proxy.ts rewrites that URL here and
// answers 404 to this path when it is opened directly); canonical stays on the profession page.
export const dynamic = "force-static";
export const revalidate = 300;

type Props = { params: Promise<{ slug: string; region: string }> };
export async function generateMetadata({ params }: Props) { return professionMetadata("en", (await params).slug); }
export default async function Page({ params }: Props) {
  const { slug, region } = await params;
  if (region !== "us") notFound();
  return <ProfessionPage lang="en" slug={slug} region={region} />;
}
