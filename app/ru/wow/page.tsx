import type { Metadata } from "next";
import { WowHome } from "@/components/wow/home/WowHome";
import { preloadCharacterBookEntry } from "@/lib/wow/preloadCharacterBookEntry";

export const metadata: Metadata = {
  title: "World of Warcraft — Gildra",
  description: "Хаб World of Warcraft с маршрутами Midnight, источниками и явным статусом проверки.",
  alternates: { canonical: "/ru/wow", languages: { en: "/wow", ru: "/ru/wow", "x-default": "/wow" } },
  robots: { index: false, follow: true },
};

export default function Page() {
  preloadCharacterBookEntry();
  return <WowHome lang="ru" />;
}
