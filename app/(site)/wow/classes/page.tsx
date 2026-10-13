import type { Metadata } from "next";
import { ClassCatalogPage } from "@/components/wow/classes/ClassCatalogPage";

const path = "/wow/classes";
export const metadata: Metadata = {
  title: "WoW Classes and Specializations — Gildra",
  description: "Every Midnight class and specialization with a link to its talent tree from the Raidbots data snapshot.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <ClassCatalogPage locale="en" />;
}
