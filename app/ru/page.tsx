import type { Metadata } from "next";
import { PlatformHome } from "@/components/platform/home/PlatformHome";

export const metadata: Metadata = {
  title: "Gildra — Хроники Азерота",
  description: "Ваша книга World of Warcraft: персонажи, маршруты подземелий и рейдовые тактики. Откройте новую главу приключения.",
  alternates: { canonical: "/ru", languages: { en: "/", ru: "/ru", "x-default": "/" } },
};

export default function HomePageRu() {
  return <PlatformHome lang="ru" />;
}
