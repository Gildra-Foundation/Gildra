import type { Metadata } from "next";
import { WowHome } from "@/components/wow/home/WowHome";

export const metadata: Metadata = {
  title: "World of Warcraft — Gildra",
  description: "World of Warcraft hub with source-tracked Midnight routes and explicit verification status.",
  alternates: { canonical: "/wow", languages: { en: "/wow", ru: "/ru/wow", "x-default": "/wow" } },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <WowHome lang="en" />;
}
