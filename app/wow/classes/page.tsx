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
  return <IdentityStatusPage locale="en" eyebrow="World of Warcraft · Midnight" title="Classes and specializations" summary="Classes and specializations of Midnight. Talent trees are available in the talent calculator; class guides will follow." patch="12.1" season="Midnight Season 2" sourceUrl="https://www.raidbots.com/static/data/live/talents.json" sourceLabel="Raidbots live talent snapshot" lastVerifiedAt="2026-09-13" links={[{ href: "/talents/fury-warrior", label: "Fury Warrior talents" }]} />;
}
