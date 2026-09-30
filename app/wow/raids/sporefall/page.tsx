import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall — Midnight Raid — Gildra",
  description: "Verified identity page for the one-encounter Sporefall raid and Rotmire. Strategy and entity details remain withheld.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="en" eyebrow="World of Warcraft · Midnight" title="Sporefall" summary="Sporefall and its Rotmire encounter are confirmed. Detailed strategy, abilities, encounter IDs, NPC IDs, icons, and loot remain withheld until verified." patch="12.0.7" season="Midnight Season 1" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24272110" sourceLabel="Official Blizzard source" lastVerifiedAt="2026-09-13" links={[{ href: "/wow/raids/sporefall/rotmire", label: "Rotmire" }]} />;
}
