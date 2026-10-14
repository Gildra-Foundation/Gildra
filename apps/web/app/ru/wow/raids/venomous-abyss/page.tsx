import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";

export const metadata: Metadata = {
  title: "Отравленная бездна — рейдовый гайд Gildra",
  description: "Индекс рейда Midnight · Сезон 2 с восемью страницами встреч и проверенным календарём поиска рейда. Детальная проверка сущностей продолжается.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousAbyssPage locale="ru" />;
}
