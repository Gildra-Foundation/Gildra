import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DelveIdentityPage } from "@/components/wow/delves/DelveIdentityPage";
import { getMidnightDelve, midnightDelves } from "@/data/wow/midnight-delves";

export const dynamicParams = false;
export function generateStaticParams() { return midnightDelves.map(({ slug }) => ({ delve: slug })); }
export async function generateMetadata({ params }: { params: Promise<{ delve: string }> }): Promise<Metadata> {
  const delve = getMidnightDelve((await params).delve);
  return delve ? { title: `${delve.name} — вылазка Midnight | Gildra`, robots: { index: false, follow: true } } : {};
}
export default async function Page({ params }: { params: Promise<{ delve: string }> }) {
  const delve = getMidnightDelve((await params).delve);
  if (!delve) notFound();
  return <DelveIdentityPage delve={delve} locale="ru" />;
}
