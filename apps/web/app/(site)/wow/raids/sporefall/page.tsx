import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";
import { withPageOpenGraph } from "@/lib/seo/metadata";

const path = "/wow/raids/sporefall";
export const metadata: Metadata = withPageOpenGraph("en", {
  title: "Sporefall: Rotmire Raid Guide — WowArcana",
  description: "A clear Normal and Heroic Rotmire guide: role positioning, minion priorities, interrupts and abilities for your class.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
});
export default function Page() {
  return <SporefallPage locale="en" />;
}
