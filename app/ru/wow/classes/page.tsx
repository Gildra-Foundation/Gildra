import type { Metadata } from "next";
import { ClassCatalogPage } from "@/components/wow/classes/ClassCatalogPage";

const path = "/ru/wow/classes";
export const metadata: Metadata = {
  title: "Классы и специализации WoW — Gildra",
  description: "Все классы и специализации Midnight со ссылками на деревья талантов из снимка данных Raidbots.",
  alternates: { canonical: path, languages: { en: "/wow/classes", ru: path, "x-default": "/wow/classes" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <ClassCatalogPage locale="ru" />;
}
