import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

const path = "/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall — Midnight Raid — Gildra",
  description: "Sporefall, the one-boss Midnight Season 1 raid in Harandar: the pull on the map, Rotmire and what to know.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <SporefallPage locale="en" view="raid" />;
}
