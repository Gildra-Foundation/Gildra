import type { Metadata } from "next";
import { RaidAtlasPage } from "@/components/wow/raid/RaidAtlasPage";

export const metadata: Metadata = {
  title: "World of Warcraft Raid Journal — Gildra",
  description: "Source-tracked Midnight raid routes and an archive inventory. Coverage is not declared complete.",
  alternates: { canonical: "/wow/raids", languages: { en: "/wow/raids", ru: "/ru/wow/raids", "x-default": "/wow/raids" } },
  robots: { index: false, follow: true },
};

export default function RaidsPage() {
  return <RaidAtlasPage locale="en" />;
}
