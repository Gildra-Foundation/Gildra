import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProfilePage } from "@/components/platform/profile/ProfilePage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { auth, isBattleNetAuthConfigured } from "@/auth";
import { BATTLE_NET_REGIONS } from "@/lib/wow/battleNetCharacters";

export const metadata: Metadata = { title: "Arcanist Vexis — Gildra", description: "Межигровой командный профиль Gildra." };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  if (slug === "arcanist-vexis") redirect("/ru/profile/arcanist");
  if (slug !== "arcanist") notFound();
  const { tab } = await searchParams;
  if (tab === "gear") redirect("/ru/wow/characters");

  const [session, data] = await Promise.all([
    isBattleNetAuthConfigured ? auth() : Promise.resolve(null),
    getPlatformHomeData("ru"),
  ]);
  return <ProfilePage data={data} lang="ru" battleNet={{
    accountName: session?.user?.name ?? undefined,
    characters: [],
    pendingRegions: session?.battleNetAccessToken ? BATTLE_NET_REGIONS : [],
  }} />;
}
