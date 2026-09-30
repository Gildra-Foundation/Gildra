import type { Metadata } from "next";
import { PatchCenterPage } from "@/components/platform/patches/PatchCenterPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";

export const metadata: Metadata = { title: "Центр патчей — Gildra", description: "Изменения игр во всех ваших мирах Gildra." };

export default async function Page() {
  return <PatchCenterPage data={await getPlatformHomeData("ru")} lang="ru" />;
}
