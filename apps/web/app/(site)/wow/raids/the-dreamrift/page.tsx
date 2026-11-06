import type { Metadata } from "next";
import { DreamriftPage } from "@/components/wow/raid/DreamriftPage";

// A route of its own rather than the [raid] route: one dynamic route for three raid
// pages shipped the client code of all three with each of them.
const path = "/wow/raids/the-dreamrift";
export const metadata: Metadata = {
  title: "The Dreamrift Raid Guide — Gildra",
  description: "Chimaerus Normal and Heroic guide: realm groups, positioning, minions and abilities for your specialization.",
  alternates: { canonical: path, languages: { en: "/wow/raids/the-dreamrift", ru: "/ru/wow/raids/the-dreamrift", "x-default": "/wow/raids/the-dreamrift" } },
};

export default function Page() {
  return <DreamriftPage locale="en" />;
}
