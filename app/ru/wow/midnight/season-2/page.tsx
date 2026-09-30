import type { Metadata } from "next";
import { SeasonTwoHub } from "@/components/wow/season2/SeasonTwoHub";

export const metadata: Metadata = {
  title: "WoW Midnight Season 2 — гайд Gildra",
  description: "Обзор Midnight Season 2 с отслеживаемыми источниками. Непроверенные item level и награды не считаются достоверными.",
  alternates: { canonical: "/ru/wow/midnight/season-2", languages: { en: "/wow/midnight/season-2", ru: "/ru/wow/midnight/season-2", "x-default": "/wow/midnight/season-2" } },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <SeasonTwoHub locale="ru" />;
}
