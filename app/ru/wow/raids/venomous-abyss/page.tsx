import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";

export const metadata: Metadata = {
  title: "The Venomous Abyss — рейдовый гайд Gildra",
  description: "Индекс рейда Midnight Season 2 с восемью страницами встреч и проверенным календарём LFR. Детальная проверка сущностей продолжается.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousAbyssPage locale="ru" />;
}
