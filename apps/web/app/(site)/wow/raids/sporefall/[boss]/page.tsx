import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

const path = "/wow/raids/sporefall/rotmire";
export const metadata: Metadata = {
  title: "Rotmire — Sporefall — Gildra",
  description: "Verified identity page for Rotmire in Sporefall. Strategy, abilities, IDs, icons, and loot are pending verification.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export function generateStaticParams() { return [{ boss: "rotmire" }]; }
export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  if ((await params).boss !== "rotmire") notFound();
  return <SporefallPage locale="en" view="boss" />;
}
