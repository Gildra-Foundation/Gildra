// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { notFound } from "next/navigation";
import { SpecPage } from "@/components/wow/classes/SpecPage";
import { specMetadata } from "@/components/wow/classes/classMetadata";
import { getMidnightClassSpec, midnightSpecializations } from "@/lib/data/wow";

export const dynamicParams = false;
export const revalidate = 900;
export const generateStaticParams = () => midnightSpecializations.map((spec) => ({ class: spec.classSlug, spec: spec.slug }));

type Props = { params: Promise<{ class: string; spec: string }> };

export async function generateMetadata({ params }: Props) {
  const values = await params;
  return specMetadata("en", values.class, values.spec);
}

export default async function Page({ params }: Props) {
  const values = await params;
  const spec = getMidnightClassSpec(values.class, values.spec);
  if (!spec) notFound();
  return <SpecPage locale="en" spec={spec} />;
}
