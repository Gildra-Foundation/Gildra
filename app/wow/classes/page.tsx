import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/wow/classes";
export const metadata: Metadata = {
  title: "WoW Classes and Specializations — Verification Status — Gildra",
  description: "Publication status for Midnight class and specialization data. Only source-backed talent trees are linked.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="en" eyebrow="World of Warcraft · Midnight" title="Classes and specializations" summary="The class catalog is being reconciled against the current game build. Fury Warrior is the only talent tree currently published from a provenance-marked community snapshot; other specialization pages remain explicitly unavailable." patch="12.1" season="Midnight Season 2" sourceUrl="https://www.raidbots.com/static/data/live/talents.json" sourceLabel="Raidbots live talent snapshot" lastVerifiedAt="2026-09-13" links={[{ href: "/talents/fury-warrior", label: "Fury Warrior talents" }]} />;
}
