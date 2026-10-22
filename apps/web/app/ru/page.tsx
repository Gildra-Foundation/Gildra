import type { Metadata } from "next";
import { PlatformHome } from "@/components/platform/home/PlatformHome";
import { JsonLd, websiteLd } from "@/lib/seo/jsonld";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";

const TITLE = "Gildra — Хроники Азерота";
const DESCRIPTION = "Ваш спутник в World of Warcraft: персонажи, маршруты подземелий, рейдовые тактики, тир-листы и статьи.";

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
