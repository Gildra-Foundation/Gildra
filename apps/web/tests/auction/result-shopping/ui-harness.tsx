"use client";
import { useState } from "react";
import { AuctionGearResult } from "@/components/wow/audit/AuctionGearResult";
import { AuctionGearOptimizer } from "@/components/wow/audit/AuctionGearOptimizer";
import type { AuctionGearAssemblyResult } from "@/lib/wow/auctionGearTypes";

/** Private fixture page; never mounted by the public application. */
export function ResultShoppingPanels({ locale, initialRevision = 0, mode }: { locale: "en" | "ru"; initialRevision?: number; mode?: string; tooltip?: boolean; weapon?: boolean; controls?: boolean }) {
  const [revision, setRevision] = useState(initialRevision), [quote, setQuote] = useState(0);
  const comparison = (gain: number) => { if (mode === "partial-negative") gain = -20; if (mode === "close-no-upgrade") gain = 1; return ({ baselineDps: 1000, candidateDps: 1000 + gain, deltaDps: gain, deltaPercent: gain / 10, uncertainty: { significant: mode !== "insignificant" && mode !== "partial-negative" && mode !== "close-no-upgrade", marginDps: 5, marginPercent: 0.5 } }); };
  const purchase = { auctionId: 7001, itemId: 7001, name: "Synthetic Exact Helm", slotType: "HEAD", variantKey: "synthetic-exact-variant", itemLevel: 100, lotCostCopper: 1000000 + quote, quantity: 1 };
  const assembly = { kind: "assembly", searchId: "synthetic-result-search", budgetCopper: 10000000, spentCopper: purchase.lotCostCopper, remainingCopper: 9000000,
    purchases: [purchase], removedSlots: [], comparison: comparison(20), bestConfirmed: null, exhaustiveComplete: mode !== "partial-negative", dataComplete: mode !== "incomplete-data", objective: "value", selectedSlots: ["HEAD"],
    enhancementOptimization: { complete: true, status: "ready", recommendations: [{ label: "synthetic-enhanced", purchases: [purchase], comparison: comparison(50), consumableNames: { "7010": "Synthetic Exact Gem" },
      enhancementNames: { gems: { "5": "Synthetic Exact Gem" }, enchants: {} }, configuration: { key: "synthetic-enhanced-config", itemsCopper: purchase.lotCostCopper, totalCopper: mode === "unknown" ? null : 1200000 + quote,
        fullyEnhanced: true, status: mode === "unknown" ? "price_unknown" : "priced", sourceUpdatedAt: new Date().toISOString(),
        slots: [{ slotType: "HEAD", variantKey: purchase.variantKey, gemIds: [5], enchantId: 0 }], consumables: [{ itemId: 7010, kind: "gem", quantity: 2, quotedCopper: mode === "unknown" ? null : 200000, missingQuantity: 0, levels: [] }] } }] } } as unknown as AuctionGearAssemblyResult;
  if (mode === "exact-pending" || mode === "exact-complete") {
    Object.assign(assembly, { enhancementMode: "enhanced" });
    Object.assign(assembly.enhancementOptimization!, {
      traversal: "exhaustive", equipmentChecked: 17, complete: mode === "exact-complete",
      status: mode === "exact-complete" ? "ready" : "pending", searchLimited: true,
    });
  }
  if (mode === "owned-upgrade") {
    const stage = assembly.enhancementOptimization!, rec = stage.recommendations[0];
    Object.assign(assembly, {enhancementMode:"enhanced", purchases:[], comparison:comparison(0), spentCopper:0});
    Object.assign(stage,{traversal:"exhaustive",includesOwnedEquipment:true});
    Object.assign(rec,{purchases:[]});
    Object.assign(rec.configuration,{itemsCopper:0,totalCopper:200000,ownedChanges:[{slotType:"HEAD",itemId:7001,gems:[{index:1,itemId:5}]}]});
    rec.configuration.consumables[0].quantity = 1;
  }
  if (mode === "close-finalists" || mode === "close-no-upgrade" || mode === "close-with-contender") {
    const stage = assembly.enhancementOptimization!, enhanced = stage.recommendations[0];
    Object.assign(assembly, { objective: "dps", enhancementMode: "enhanced", comparison: comparison(70) });
    Object.assign(stage, { traversal: "exhaustive", finalistRecheck: { keys: ["synthetic-enhanced-config", "synthetic-bare"], significant: false, marginDps: 3 } });
    stage.recommendations.push({ ...enhanced, comparison: { ...enhanced.comparison, ...comparison(49) },
      configuration: { ...enhanced.configuration, key: "synthetic-bare", totalCopper: purchase.lotCostCopper, consumables: [],
        fullyEnhanced: false, slots: [{ slotType: "HEAD", variantKey: purchase.variantKey, gemIds: [], enchantId: 0 }] } });
  }
  if (mode === "close-with-contender") {
    const stage = assembly.enhancementOptimization!, contender = structuredClone(stage.recommendations[0]);
    contender.configuration.key = "synthetic-third";
    contender.configuration.consumables[0].quotedCopper = 300000;
    contender.configuration.totalCopper = purchase.lotCostCopper + 300000;
    contender.configuration.slots[0].gemIds = [6];
    contender.comparison = { ...contender.comparison, ...comparison(55) };
    stage.recommendations.push(contender);
    stage.finalistRecheck!.competingKey = contender.configuration.key;
  }
  if (mode === "tradeoff" || mode === "same-winner") {
    const stronger = { ...purchase, auctionId: 7002, itemId: 7002, variantKey: "synthetic-stronger", name: "Synthetic Stronger Helm", lotCostCopper: 5000000 };
    const confirmed = (item: typeof purchase, gain: number) => ({
      purchases: [item], removedSlots: [], spentCopper: item.lotCostCopper,
      remainingCopper: assembly.budgetCopper - item.lotCostCopper, comparison: comparison(gain),
    });
    const value = confirmed(purchase, 20);
    Object.assign(assembly, { enhancementMode: "equipment", enhancementOptimization: undefined, bestConfirmed: value,
      bestValueConfirmed: value, bestDpsConfirmed: mode === "same-winner" ? value : confirmed(stronger, 60) });
  }
  return <><aside><button onClick={() => setRevision(value => value + 1)}>Private snapshot change</button><button onClick={() => setQuote(value => value + 10000)}>Private quote change</button></aside>
    <div data-character-sections><AuctionGearOptimizer characterSlug="eu--synthetic-result--synthetic" snapshotKey={`synthetic:${revision}`} specializationSlug="fury-warrior" localePrefix={locale === "ru" ? "/ru" : ""} />
      <section data-private-result><AuctionGearResult key={revision} characterSlug="eu--synthetic-result--synthetic" snapshotKey={`synthetic:${revision}`} assembly={assembly} locale={locale} stale={mode === "stale"} selectionLocked={false} onExcludeLot={() => {}} /></section></div>
  </>;
}
