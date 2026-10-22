import type { Metadata } from "next";
import { AnalyticsPage } from "@/components/analytics/AnalyticsPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {"title": "Активность Gildra — Gildra", "description": "Сводка событий и пользователей Gildra за последние 24 часа."};

export default function Page() { return <AnalyticsPage locale="ru" />; }
