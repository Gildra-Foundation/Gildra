import type { Metadata } from "next";
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";

export const metadata: Metadata = {
  title: "Атлас Эпохальный+ Midnight — Gildra",
  description: "Все восемь подземелий Эпохальный+ второго сезона Midnight с переходом к интерактивным маршрутам.",
};

export default function Page() {
  return <MythicAtlasPage locale="ru" />;
}
