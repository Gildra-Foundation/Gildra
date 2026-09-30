import type { Metadata } from "next";
import { MythicAtlasPage } from "@/components/wow/mythic/MythicAtlasPage";

export const metadata: Metadata = {
  title: "Midnight Mythic+ Atlas — Gildra",
  description: "Choose from all eight Midnight Season 2 Mythic+ dungeons and open an interactive route.",
};

export default function Page() {
  return <MythicAtlasPage locale="en" />;
}
