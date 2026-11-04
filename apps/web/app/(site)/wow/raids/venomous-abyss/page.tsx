import type { Metadata } from "next";
import { VenomousGuidePage } from "@/components/wow/raid/VenomousGuidePage";

export const metadata: Metadata = {
  title: "The Venomous Abyss Raid Guide — Gildra",
  description: "All eight Venomous Abyss bosses: encounter flow, positioning, adds and responses for your specialization on Normal and Heroic.",
  alternates: {
    canonical: "/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousGuidePage locale="en" />;
}
