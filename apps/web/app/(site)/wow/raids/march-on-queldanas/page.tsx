import type { Metadata } from "next";
import { QueldanasPage } from "@/components/wow/raid/QueldanasPage";

// A route of its own rather than the [raid] route: one dynamic route for three raid
// pages shipped the client code of all three with each of them.
const path = "/wow/raids/march-on-queldanas";
export const metadata: Metadata = {
  title: "March on Quel'Danas Raid Guide — Gildra",
  description: "Belo’ren and Midnight Falls on Normal and Heroic: encounter flow, positioning, adds and responses for your specialization.",
  alternates: { canonical: path, languages: { en: "/wow/raids/march-on-queldanas", ru: "/ru/wow/raids/march-on-queldanas", "x-default": "/wow/raids/march-on-queldanas" } },
};

export default function Page() {
  return <QueldanasPage locale="en" />;
}
