import type { Metadata } from "next";
import { LairsHub } from "@/components/wow/lairs/LairsHub";
export const metadata: Metadata = {
  title: "Midnight Season 2 Lairs and World Bosses — Gildra",
  description: "Source-tracked Midnight Season 2 Lair and world-boss identity roster.",
  alternates: { canonical: "/wow/lairs", languages: { en: "/wow/lairs", ru: "/ru/wow/lairs", "x-default": "/wow/lairs" } },
  robots: { index: false, follow: true },
};
export default function LairsPage() { return <LairsHub locale="en" />; }
