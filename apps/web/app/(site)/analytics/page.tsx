import type { Metadata } from "next";
import { AnalyticsPage } from "@/components/analytics/AnalyticsPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {"title": "Gildra activity — Gildra", "description": "A summary of Gildra site events and users over the last 24 hours."};

export default function Page() { return <AnalyticsPage locale="en" />; }
