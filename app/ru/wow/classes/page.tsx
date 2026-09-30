import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/ru/wow/classes";
export const metadata: Metadata = {
  title: "Классы и специализации WoW — статус проверки — Gildra",
  description: "Статус публикации классов и специализаций Midnight. Доступны только деревья талантов с указанным происхождением данных.",
  alternates: { canonical: path, languages: { en: "/wow/classes", ru: path, "x-default": "/wow/classes" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="ru" eyebrow="World of Warcraft · Midnight" title="Классы и специализации" summary="Каталог классов сверяется с текущим build игры. Fury Warrior — единственное опубликованное дерево талантов из явно маркированного community snapshot; остальные страницы специализаций остаются явно недоступными." patch="12.1" season="Midnight Season 2" sourceUrl="https://www.raidbots.com/static/data/live/talents.json" sourceLabel="Raidbots live talent snapshot" lastVerifiedAt="2026-09-13" links={[{ href: "/talents/fury-warrior", label: "Таланты воина «Неистовство»" }]} />;
}
