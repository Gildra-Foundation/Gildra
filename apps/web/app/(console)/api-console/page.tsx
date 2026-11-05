import type { Metadata } from "next";
import { ApiConsole } from "@/components/api-console/ApiConsole";
import "@/app/styles/tailwind-app.css";

export const metadata: Metadata = {
  title: "Gildra API — Dashboard",
  description: "Gildra API status, datasets and update history.",
  robots: { index: false, follow: false },
};

export default async function ApiConsolePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <ApiConsole consolePath={[]} returnTo={next} />;
}
