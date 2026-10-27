import { notFound, permanentRedirect } from "next/navigation";
import { getMidnightClass, midnightClasses } from "@/lib/data/wow";

// A class has no page of its own: its card on the class list carries the specializations.
export const dynamicParams = false;
export const generateStaticParams = () => midnightClasses.map(({ slug }) => ({ class: slug }));

export default async function Page({ params }: { params: Promise<{ class: string }> }) {
  const entry = getMidnightClass((await params).class);
  if (!entry) notFound();
  permanentRedirect(`/ru/wow/classes#${entry.slug}`);
}
