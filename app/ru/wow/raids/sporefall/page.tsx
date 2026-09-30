import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/ru/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall — рейд Midnight — Gildra",
  description: "Страница подтверждённой идентичности рейда Sporefall и встречи Rotmire. Тактика и сущности скрыты до проверки.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall", ru: path, "x-default": "/wow/raids/sporefall" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="ru" eyebrow="World of Warcraft · Midnight" title="Sporefall" summary="Рейд Sporefall и встреча Rotmire подтверждены. Тактика, способности, encounter ID, NPC ID, иконки и добыча скрыты до проверки." patch="12.0.7" season="Midnight Season 1" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24272110" sourceLabel="Официальный источник Blizzard" lastVerifiedAt="2026-09-13" links={[{ href: "/wow/raids/sporefall/rotmire", label: "Rotmire" }]} />;
}
