import type { Metadata } from "next";
import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";

const path = "/ru/wow/gear";
export const metadata: Metadata = {
  title: "Статус данных экипировки WoW — Gildra",
  description: "Инструменты экипировки скрыты до проверки item-сущностей, владельца персонажа, item level, треков и источников.",
  alternates: { canonical: path, languages: { en: "/wow/gear", ru: path, "x-default": "/wow/gear" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <IdentityStatusPage art="/assets/wow/loading/tools.webp" artPosition="center 45%" locale="ru" eyebrow="Midnight · Сезон 2" title="Экипировка" summary="Подбор экипировки и треки улучшений сезона появятся здесь, когда данные о предметах пройдут проверку. А пока экипировка вашего героя видна в профиле персонажа." links={[{ href: "/wow/characters", label: "Мои персонажи" }]} patch="12.1" season="Midnight Season 2" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" sourceLabel="Официальный источник сезона Blizzard" lastVerifiedAt="2026-09-13" />;
}
