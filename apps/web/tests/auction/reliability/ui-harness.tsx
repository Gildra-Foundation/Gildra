"use client";
import { AuctionGearOptimizer } from "@/components/wow/audit/AuctionGearOptimizer";
import { GearPlannerItem } from "@/components/wow/audit/GearPlannerItem";
import { useState } from "react";

/** Used only by the generated private QA project, never by a published route. */
export function ReliabilityPanels({ locale, tooltip, weapon, controls = false, initialRevision = 0 }: { locale: "ru" | "en"; tooltip: boolean; weapon: boolean; controls?: boolean; initialRevision?: number }) {
  const [language, setLanguage] = useState(locale);
  const [revision, setRevision] = useState(initialRevision);
  const [visible, setVisible] = useState(true);
  const iconUrl = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjNzE0ZGEwIi8+PC9zdmc+";
  const exact = { itemId: 880004, name: "Synthetic exact weapon", iconUrl, quality: 3, slotType: "MAIN_HAND",
    itemLevel: 100, requiredLevel: 1, stats: { strength: 21 }, effectsVerified: weapon,
    ...(weapon ? { weapon: { minDamage: 50, maxDamage: 70, dps: 24, speedSeconds: 2.5 }, effects: ["Synthetic exact proc +17"] } : {}) };
  return <>{controls ? <aside><button type="button" onClick={() => setLanguage(value => value === "ru" ? "en" : "ru")}>Private locale change</button><button type="button" onClick={() => setRevision(value => value + 1)}>Private snapshot change</button><button type="button" onClick={() => setVisible(value => !value)}>Private optimizer unmount</button></aside> : null}<div data-character-sections>{!visible ? <p>Private optimizer removed</p> : tooltip ? <GearPlannerItem item={exact} locale={language} />
    : <AuctionGearOptimizer characterSlug="eu--synthetic-reliability--synthetic" snapshotKey={`synthetic-reliability:${revision}`}
      specializationSlug="fury-warrior" localePrefix={language === "ru" ? "/ru" : ""} />}</div></>;
}
