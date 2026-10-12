import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/ru/wow/classes";
export const metadata: Metadata = {
  title: "Классы и специализации WoW — статус проверки — Gildra",
  description: "Статус публикации классов и специализаций Midnight. Доступны только деревья талантов с указанным происхождением данных.",
  alternates: { canonical: path, languages: { en: "/wow/classes", ru: path, "x-default": "/wow/classes" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="ru" eyebrow="Midnight" title="Классы и специализации" summary="Классы и специализации Midnight. Деревья талантов доступны в калькуляторе талантов; гайды по классам появятся позже." patch="12.1" season="Midnight Season 2" sourceUrl="https://www.raidbots.com/static/data/live/talents.json" sourceLabel="Raidbots live talent snapshot" lastVerifiedAt="2026-09-13" links={[{ href: "/talents/fury-warrior", label: "Таланты воина «Неистовство»" }]} />;
}
