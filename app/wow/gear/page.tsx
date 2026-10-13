import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";

const path = "/wow/gear";
export const metadata: Metadata = {
  title: "WoW Gear — Gildra",
  description: "Gear recommendations for World of Warcraft Midnight Season 2 — coming once the item data is verified.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage art="/assets/wow/loading/tools.webp" artPosition="center 45%" locale="en" eyebrow="Midnight · Season 2" title="Gear" summary="Gear recommendations and upgrade tracks for the season will appear here once the item data is verified. Meanwhile, your hero's equipment is shown on the character profile." links={[{ href: "/wow/characters", label: "My characters" }]} patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Official Blizzard season source" lastVerifiedAt="2026-09-13" />;
}
