import type { Metadata } from "next";
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";

export const metadata: Metadata = {
  title: "Атлас Mythic+ Midnight — Gildra",
  description: "Все восемь подземелий Mythic+ второго сезона Midnight с переходом к интерактивным маршрутам.",
};

export default function Page() {
  return <MythicAtlasPage locale="ru" />;
}
