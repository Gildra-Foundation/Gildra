import type { Metadata } from "next";
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";

export const metadata: Metadata = { title: "Mythic+ Midnight — Gildra", robots: { index: false, follow: true } };
export default function Page() { return <MythicAtlasPage locale="ru" />; }
