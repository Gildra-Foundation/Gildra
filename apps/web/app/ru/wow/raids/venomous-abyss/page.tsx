import { isPublicationReady } from "@/lib/wow/publication";
import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";

export const metadata: Metadata = {
  title: "Отравленная бездна — рейдовый гайд Gildra",
  description: "Отравленная бездна: тактики восьми боссов для обычной и героической сложности, задачи ролей, вход и добыча.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: isPublicationReady("/wow/raids/venomous-abyss"), follow: true },
};

export default function Page() {
  return <VenomousAbyssPage locale="ru" />;
}
