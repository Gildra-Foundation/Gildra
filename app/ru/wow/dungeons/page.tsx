import type { Metadata } from "next";
import { DungeonCatalogPage } from "@/components/wow/dungeons/DungeonCatalogPage";

export const metadata: Metadata = { title: "Подземелья Midnight — Gildra", robots: { index: false, follow: true } };
export default function Page() { return <DungeonCatalogPage locale="ru" />; }
