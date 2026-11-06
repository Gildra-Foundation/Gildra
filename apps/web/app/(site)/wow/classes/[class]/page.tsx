// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { notFound } from "next/navigation";
import { ClassPage } from "@/components/wow/classes/ClassPage";
import { classMetadata } from "@/components/wow/classes/classMetadata";
import { getMidnightClass, midnightClasses } from "@/lib/data/wow";

export const dynamicParams = false;
export const revalidate = 900;
export const generateStaticParams = () => midnightClasses.map(({ slug }) => ({ class: slug }));

type Props = { params: Promise<{ class: string }> };

export async function generateMetadata({ params }: Props) {
  return classMetadata("en", (await params).class);
}

export default async function Page({ params }: Props) {
  const entry = getMidnightClass((await params).class);
  if (!entry) notFound();
  return <ClassPage locale="en" classSlug={entry.slug} />;
}
