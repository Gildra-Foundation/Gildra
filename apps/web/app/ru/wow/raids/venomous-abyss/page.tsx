import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";

export const metadata: Metadata = {
  title: "Отравленная бездна — рейдовый гайд Gildra",
  description: "Отравленная бездна, рейд Midnight · Сезон 2: пулы на карте, восемь боссов, крылья поиска рейда, добыча и награды.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousAbyssPage locale="ru" />;
}
