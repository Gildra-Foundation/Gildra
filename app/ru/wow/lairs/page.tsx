import type { Metadata } from "next";
import { LairsHub } from "@/components/wow/lairs/LairsHub";

export const metadata: Metadata = {
  title: "Логова и мировые боссы Midnight Season 2 — Gildra",
  description: "Логово и мировые боссы Midnight Season 2: где найти, способности, сложность и добыча.",
  alternates: { canonical: "/ru/wow/lairs", languages: { en: "/wow/lairs", ru: "/ru/wow/lairs", "x-default": "/wow/lairs" } },
  robots: { index: false, follow: true },
};

export default function LairsPage() {
  return <LairsHub />;
}
