import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/ru/wow/gear";
export const metadata: Metadata = {
  title: "Статус данных экипировки WoW — Gildra",
  description: "Инструменты экипировки скрыты до проверки item-сущностей, владельца персонажа, item level, треков и источников.",
  alternates: { canonical: path, languages: { en: "/wow/gear", ru: path, "x-default": "/wow/gear" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage locale="ru" eyebrow="World of Warcraft · экипировка" title="Статус данных экипировки" summary="Публичный оптимизатор больше не перенаправляет на синтетического персонажа. Рекомендации, треки улучшения и экипировка скрыты до проверки canonical item ID и данных владельца." patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Официальный источник сезона Blizzard" lastVerifiedAt="2026-09-13" />;
}
