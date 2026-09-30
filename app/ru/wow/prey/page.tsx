import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/ru/wow/prey";
export const metadata: Metadata = {
  title: "Prey Season 2 — Gildra",
  description: "Страница подтверждённой идентичности активности Prey в Midnight Season 2. Цели и награды скрыты до проверки источников.",
  alternates: { canonical: path, languages: { en: "/wow/prey", ru: path, "x-default": "/wow/prey" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="ru" eyebrow="World of Warcraft · Midnight" title="Prey Season 2" summary="Prey подтверждена как активность Season 2 на Coiled Isle. Цели, режимы, награды, ID и медиа скрыты до проверки на уровне сущностей." patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Официальный источник Blizzard" lastVerifiedAt="2026-09-13" />;
}
