import type { Metadata } from "next";
import { PlatformHome } from "@/components/platform/home/PlatformHome";
import { JsonLd, websiteLd } from "@/lib/seo/jsonld";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";

const TITLE = "Gildra — Chronicles of Azeroth";
const DESCRIPTION = "Your World of Warcraft companion. Open the book to explore characters, dungeons and raid guides.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pairedAlternates("en", "/"),
  openGraph: pageOpenGraph("en", { title: TITLE, description: DESCRIPTION, path: "/" }),
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={websiteLd("en", DESCRIPTION)} />
      <PlatformHome lang="en" />
    </>
  );
}
