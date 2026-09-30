import type { Metadata } from "next";
import { PlatformHome } from "@/components/platform/home/PlatformHome";

export const metadata: Metadata = {
  title: "Gildra — Chronicles of Azeroth",
  description: "Your World of Warcraft companion. Open the book to explore characters, dungeons and raid guides.",
  alternates: { canonical: "/", languages: { en: "/", ru: "/ru", "x-default": "/" } },
};

export default function HomePage() {
  return <PlatformHome lang="en" />;
}
