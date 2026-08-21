import type { Metadata } from "next";
import { ApiConsole } from "@/components/api-console/ApiConsole";

export const metadata: Metadata = {
  title: "Gildra API — Панель управления",
  robots: { index: false, follow: false },
};

export default async function ApiConsoleSectionPage({
  params,
}: {
  params: Promise<{ consolePath: string[] }>;
}) {
  const { consolePath } = await params;
  return <ApiConsole consolePath={consolePath} />;
}
