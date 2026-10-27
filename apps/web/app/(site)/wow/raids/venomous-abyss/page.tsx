import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";

export const metadata: Metadata = {
  title: "The Venomous Abyss Raid Guide — Gildra",
  description: "The Venomous Abyss, Midnight Season 2 raid: pulls on the map, eight bosses, Raid Finder wings, loot and rewards.",
  alternates: {
    canonical: "/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousAbyssPage locale="en" />;
}
