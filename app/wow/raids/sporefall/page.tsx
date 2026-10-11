import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

const path = "/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall — Midnight Raid — Gildra",
  description: "Verified identity page for the one-encounter Sporefall raid and Rotmire. Strategy and entity details remain withheld.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <SporefallPage locale="en" view="raid" />;
}
