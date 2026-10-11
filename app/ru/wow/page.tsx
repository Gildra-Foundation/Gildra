import type { Metadata } from "next";
import { WowHome } from "@/components/wow/home/WowHome";

export const metadata: Metadata = {
  title: "World of Warcraft — Gildra",
  description: "Хаб World of Warcraft с маршрутами Midnight, источниками и явным статусом проверки.",
  alternates: { canonical: "/ru/wow", languages: { en: "/wow", ru: "/ru/wow", "x-default": "/wow" } },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <WowHome lang="ru" />;
}
