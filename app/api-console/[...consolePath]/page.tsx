import type { Metadata } from "next";
import { ApiConsole } from "@/components/api-console/ApiConsole";

export const metadata: Metadata = {
  title: "Gildra API — Панель управления",
  robots: { index: false, follow: false },
};

export default async function ApiConsoleSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ consolePath: string[] }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { consolePath } = await params;
  const { next } = await searchParams;
  return <ApiConsole consolePath={consolePath} returnTo={next} />;
}
