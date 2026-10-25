"use client";
import { GearFarmPlanner } from "@/components/wow/audit/GearFarmPlanner";
export function FarmPanels({ locale }: { locale: "ru" | "en" }) {
  return <GearFarmPlanner characterSlug="eu--synthetic-farm--synthetic" snapshotKey="synthetic-farm" localePrefix={locale === "ru" ? "/ru" : ""} />;
}
