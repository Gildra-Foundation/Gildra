import { notFound, permanentRedirect } from "next/navigation";
import { midnightSpecializations } from "@/lib/data/wow";

// Legacy spec addresses: every specialization opens its talent calculator.
export const dynamicParams = false;
export const generateStaticParams = () => midnightSpecializations.map(({ slug }) => ({ slug }));

export default async function LegacySpecRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!midnightSpecializations.some((spec) => spec.slug === slug)) notFound();
  permanentRedirect(`/ru/talents/${slug}`);
}
