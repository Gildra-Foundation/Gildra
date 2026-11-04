import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

const path = "/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall: Rotmire Raid Guide — Gildra",
  description: "A clear Normal and Heroic Rotmire guide: role positioning, minion priorities, interrupts and abilities for your class.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <SporefallPage locale="en" />;
}
