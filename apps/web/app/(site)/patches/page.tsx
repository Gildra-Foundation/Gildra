import type { Metadata } from "next";
import { PatchCenterPage } from "@/components/platform/patches/PatchCenterPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { hiddenForMvp } from "@/lib/mvp";

export const metadata: Metadata = { title: "Patch Center — Gildra", description: "Track live game changes across your Gildra worlds." };

export default async function Page() {
  // Hidden for the WoW-only MVP: answers 404 until the flag in lib/mvp.ts is flipped.
  hiddenForMvp();
  return <PatchCenterPage data={await getPlatformHomeData("en")} lang="en" />;
}
