import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

const path = "/ru/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Споропад: Гнилотоп — тактика рейда — Gildra",
  description: "Гнилотоп: понятная тактика обычного и героического Споропада. Позиции по ролям, прислужники, прерывания и способности вашего класса.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall", ru: path, "x-default": "/wow/raids/sporefall" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <SporefallPage locale="ru" />;
}
