import type { Metadata } from "next";
import { SeasonTwoHub } from "@/components/wow/season2/SeasonTwoHub";

export const metadata: Metadata = {
  title: "WoW Midnight Season 2 Guide — Gildra",
  description: "Midnight Season 2 source-tracked overview. Unverified item levels and rewards are not treated as authoritative.",
  alternates: { canonical: "/wow/midnight/season-2", languages: { en: "/wow/midnight/season-2", ru: "/ru/wow/midnight/season-2", "x-default": "/wow/midnight/season-2" } },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <SeasonTwoHub locale="en" />;
}
