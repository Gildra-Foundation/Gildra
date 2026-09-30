import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/wow/gear";
export const metadata: Metadata = {
  title: "WoW Gear Data Status — Gildra",
  description: "Gear tools are withheld until item entities, character ownership, item levels, tracks, and sources are verified.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="en" eyebrow="World of Warcraft · Gear" title="Gear data status" summary="The public optimizer no longer redirects to a synthetic character. Item recommendations, upgrade tracks, and character gear remain withheld until canonical item IDs and ownership data are verified." patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Official Blizzard season source" lastVerifiedAt="2026-09-13" />;
}
