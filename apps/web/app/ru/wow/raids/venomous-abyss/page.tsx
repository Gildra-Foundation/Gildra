import type { Metadata } from "next";
import { VenomousGuidePage } from "@/components/wow/raid/VenomousGuidePage";

export const metadata: Metadata = {
  title: "Отравленная бездна — рейдовый гайд Gildra",
  description: "Все восемь боссов Отравленной бездны: понятный порядок боя, задачи вашей специализации, прислужники и прерывания на обычной и героической сложности.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <VenomousGuidePage locale="ru" />;
}
