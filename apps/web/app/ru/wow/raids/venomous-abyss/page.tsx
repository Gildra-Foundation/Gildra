import type { Metadata } from "next";
import { VenomousGuidePage } from "@/components/wow/raid/VenomousGuidePage";
import { withPageOpenGraph } from "@/lib/seo/metadata";

export const metadata: Metadata = withPageOpenGraph("ru", {
  title: "Отравленная бездна — рейдовый гайд Gildra",
  description: "Все восемь боссов Отравленной бездны: понятный порядок боя, задачи вашей специализации, прислужники и прерывания на обычной и героической сложности.",
  alternates: {
    canonical: "/ru/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
});

export default function Page() {
  return <VenomousGuidePage locale="ru" />;
}
