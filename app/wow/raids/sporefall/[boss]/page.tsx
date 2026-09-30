import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

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
  return <IdentityStatusPage locale="en" eyebrow="Sporefall · Encounter" title="Rotmire" summary="The encounter identity is confirmed by Blizzard. No strategy, ability, game-ID, icon, or loot claim is published yet." patch="12.0.7" season="Midnight Season 1" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24272110" sourceLabel="Official Blizzard source" lastVerifiedAt="2026-09-13" />;
}
