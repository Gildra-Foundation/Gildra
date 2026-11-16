"use client";
import { useState } from "react";
import { AuctionGearResult } from "@/components/wow/audit/AuctionGearResult";
import { AuctionGearOptimizer } from "@/components/wow/audit/AuctionGearOptimizer";
import type { AuctionGearAssemblyResult } from "@/lib/wow/auctionGearTypes";

/** Private fixture page; never mounted by the public application. */
export function ResultShoppingPanels({ locale, initialRevision = 0, mode }: { locale: "en" | "ru"; initialRevision?: number; mode?: string; tooltip?: boolean; weapon?: boolean; controls?: boolean }) {
  const [revision, setRevision] = useState(initialRevision), [quote, setQuote] = useState(0);
  const comparison = (gain: number) => ({ baselineDps: 1000, candidateDps: 1000 + gain, deltaDps: gain, deltaPercent: gain / 10, uncertainty: { significant: mode !== "insignificant", marginDps: 5 } });
  const purchase = { auctionId: 7001, itemId: 7001, name: "Synthetic Exact Helm", slotType: "HEAD", variantKey: "synthetic-exact-variant", itemLevel: 100, lotCostCopper: 1000000 + quote, quantity: 1 };
  const assembly = { kind: "assembly", searchId: "synthetic-result-search", budgetCopper: 10000000, spentCopper: purchase.lotCostCopper, remainingCopper: 9000000,
    purchases: [purchase], removedSlots: [], comparison: comparison(20), bestConfirmed: null, exhaustiveComplete: true, objective: "value", selectedSlots: ["HEAD"],
    enhancementOptimization: { complete: true, status: "ready", recommendations: [{ label: "synthetic-enhanced", purchases: [purchase], comparison: comparison(50), consumableNames: { "7010": "Synthetic Exact Gem" },
      enhancementNames: { gems: { "5": "Synthetic Exact Gem" }, enchants: {} }, configuration: { key: "synthetic-enhanced-config", itemsCopper: purchase.lotCostCopper, totalCopper: mode === "unknown" ? null : 1200000 + quote,
        fullyEnhanced: true, status: mode === "unknown" ? "price_unknown" : "priced", sourceUpdatedAt: new Date().toISOString(),
        slots: [{ slotType: "HEAD", variantKey: purchase.variantKey, gemIds: [5], enchantId: 0 }], consumables: [{ itemId: 7010, kind: "gem", quantity: 2, quotedCopper: mode === "unknown" ? null : 200000, missingQuantity: 0, levels: [] }] } }] } } as unknown as AuctionGearAssemblyResult;
  return <><aside><button onClick={() => setRevision(value => value + 1)}>Private snapshot change</button><button onClick={() => setQuote(value => value + 10000)}>Private quote change</button></aside>
    <div data-character-sections><AuctionGearOptimizer characterSlug="eu--synthetic-result--synthetic" snapshotKey={`synthetic:${revision}`} specializationSlug="fury-warrior" localePrefix={locale === "ru" ? "/ru" : ""} />
      <section data-private-result><AuctionGearResult key={revision} characterSlug="eu--synthetic-result--synthetic" snapshotKey={`synthetic:${revision}`} assembly={assembly} locale={locale} stale={mode === "stale"} selectionLocked={false} onExcludeLot={() => {}} /></section></div>
  </>;
}
