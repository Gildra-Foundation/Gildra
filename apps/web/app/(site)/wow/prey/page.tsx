import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";

const path = "/wow/prey";
export const metadata: Metadata = {
  title: "Prey Season 2 — Gildra",
  description: "Verified identity page for the Midnight Season 2 Prey activity. Detailed objectives and rewards are withheld pending source verification.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage art="/assets/wow/loading/pvp.webp" artPosition="center 40%" locale="en" eyebrow="Midnight" title="Prey Season 2" summary="Prey is a Season 2 activity on the Coiled Isle. Objectives, modes and rewards will appear here once they are verified." patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Official Blizzard source" lastVerifiedAt="2026-09-13" />;
}
