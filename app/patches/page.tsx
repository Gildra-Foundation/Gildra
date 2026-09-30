import type { Metadata } from "next";
import { PatchCenterPage } from "@/components/platform/patches/PatchCenterPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";

export const metadata: Metadata = { title: "Patch Center — Gildra", description: "Track live game changes across your Gildra worlds." };

export default async function Page() {
  return <PatchCenterPage data={await getPlatformHomeData("en")} lang="en" />;
}
