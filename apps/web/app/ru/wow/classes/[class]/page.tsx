// Generated from app/(site)/wow/classes/[class]/page.tsx by npm run routes:mirror — edit the English page.
import { notFound } from "next/navigation";
import { ClassPage } from "@/components/wow/classes/ClassPage";
import { classMetadata } from "@/components/wow/classes/classMetadata";
import { getMidnightClass, midnightClasses } from "@/lib/data/wow";

export const dynamicParams = false;
export const revalidate = 900;
export const generateStaticParams = () => midnightClasses.map(({ slug }) => ({ class: slug }));

type Props = { params: Promise<{ class: string }> };

export async function generateMetadata({ params }: Props) {
  return classMetadata("ru", (await params).class);
}

export default async function Page({ params }: Props) {
  const entry = getMidnightClass((await params).class);
  if (!entry) notFound();
  return <ClassPage locale="ru" classSlug={entry.slug} />;
}
