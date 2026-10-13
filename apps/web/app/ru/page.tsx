import type { Metadata } from "next";
import { PlatformHome } from "@/components/platform/home/PlatformHome";
import { JsonLd, websiteLd } from "@/lib/seo/jsonld";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";

const TITLE = "Gildra — Хроники Азерота";
const DESCRIPTION = "Ваша книга World of Warcraft: персонажи, маршруты подземелий и рейдовые тактики. Откройте новую главу приключения.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pairedAlternates("ru", "/"),
  openGraph: pageOpenGraph("ru", { title: TITLE, description: DESCRIPTION, path: "/ru" }),
};

export default function HomePageRu() {
  return (
    <>
      <JsonLd data={websiteLd("ru", DESCRIPTION)} />
      <PlatformHome lang="ru" />
    </>
  );
}
