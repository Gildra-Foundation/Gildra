import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";

export const metadata: Metadata = {
  title: "The Venomous Abyss Raid Guide — Gildra",
  description: "Midnight Season 2 raid index with eight encounter pages and the verified Raid Finder schedule. Detailed entity verification is still in progress.",
  alternates: {
    canonical: "/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousAbyssPage locale="en" />;
}
