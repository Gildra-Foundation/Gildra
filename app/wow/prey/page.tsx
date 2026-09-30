import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/wow/prey";
export const metadata: Metadata = {
  title: "Prey Season 2 — Gildra",
  description: "Verified identity page for the Midnight Season 2 Prey activity. Detailed objectives and rewards are withheld pending source verification.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="en" eyebrow="World of Warcraft · Midnight" title="Prey Season 2" summary="Prey is confirmed as a Season 2 activity on the Coiled Isle. Objectives, modes, rewards, IDs, and media remain withheld until entity-level verification." patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Official Blizzard source" lastVerifiedAt="2026-09-13" />;
}
