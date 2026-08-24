import type { Metadata } from "next";
import { ApiConsole } from "@/components/api-console/ApiConsole";

export const metadata: Metadata = {
  title: "Gildra API — Панель управления",
  description: "Состояние Gildra API, датасеты и история обновлений.",
  robots: { index: false, follow: false },
};

export default function ApiConsolePage() {
  return <ApiConsole consolePath={[]} />;
}
