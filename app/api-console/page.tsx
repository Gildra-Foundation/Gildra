import type { Metadata } from "next";
import { ApiConsole } from "@/components/api-console/ApiConsole";

export const metadata: Metadata = {
  title: "Gildra API — Панель управления",
  description: "Состояние Gildra API, датасеты и история обновлений.",
  robots: { index: false, follow: false },
};

export default async function ApiConsolePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <ApiConsole consolePath={[]} returnTo={next} />;
}
