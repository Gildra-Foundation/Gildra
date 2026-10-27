import { notFound, permanentRedirect } from "next/navigation";
import { getMidnightClassSpec, midnightSpecializations } from "@/lib/data/wow";

// A specialization lives in its talent calculator.
export const dynamicParams = false;
export const generateStaticParams = () => midnightSpecializations.map((spec) => ({ class: spec.classSlug, spec: spec.slug }));

export default async function Page({ params }: { params: Promise<{ class: string; spec: string }> }) {
  const values = await params;
  const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) notFound();
  permanentRedirect(`/talents/${entry.slug}`);
}
