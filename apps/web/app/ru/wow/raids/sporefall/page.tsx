import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

const path = "/ru/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall — рейд Midnight — Gildra",
  description: "Споропад — рейд Midnight · Сезон 1 с одним боссом в Харандаре: пул на карте, Гнилотоп и что важно знать.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall", ru: path, "x-default": "/wow/raids/sporefall" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <SporefallPage locale="ru" view="raid" />;
}
