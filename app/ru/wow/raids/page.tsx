import type { Metadata } from "next";
import { RaidAtlasPage } from "@/components/wow/raid/RaidAtlasPage";

export const metadata: Metadata = {
  title: "Рейдовый журнал World of Warcraft — Gildra",
  description: "Маршруты рейдов Midnight с источниками и инвентаризация архива. Полнота покрытия не заявляется.",
  alternates: { canonical: "/ru/wow/raids", languages: { en: "/wow/raids", ru: "/ru/wow/raids", "x-default": "/wow/raids" } },
  robots: { index: false, follow: true },
};

export default function RaidsPage() {
  return <RaidAtlasPage locale="ru" />;
}
