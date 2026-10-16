"use client";
import { AuctionGearOptimizer } from "@/components/wow/audit/AuctionGearOptimizer";
import { GearPlannerItem } from "@/components/wow/audit/GearPlannerItem";

/** Used only by the generated private QA project, never by a published route. */
export function ReliabilityPanels({ locale, tooltip, weapon }: { locale: "ru" | "en"; tooltip: boolean; weapon: boolean }) {
  const iconUrl = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjNzE0ZGEwIi8+PC9zdmc+";
  const exact = { itemId: 880004, name: "Synthetic exact weapon", iconUrl, quality: 3, slotType: "MAIN_HAND",
    itemLevel: 100, requiredLevel: 1, stats: { strength: 21 }, effectsVerified: weapon,
    ...(weapon ? { weapon: { minDamage: 50, maxDamage: 70, dps: 24, speedSeconds: 2.5 }, effects: ["Synthetic exact proc +17"] } : {}) };
  return <div data-character-sections>{tooltip ? <GearPlannerItem item={exact} locale={locale} />
    : <AuctionGearOptimizer characterSlug="eu--synthetic-reliability--synthetic" snapshotKey="synthetic-reliability"
      specializationSlug="fury-warrior" localePrefix={locale === "ru" ? "/ru" : ""} />}</div>;
}
