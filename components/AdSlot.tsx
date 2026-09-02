import { AdSlot as AdSlotBlock, type AdSlotProps } from "@/components/blocks/shared/adSlot/AdSlot";
import type { Lang } from "@/lib/i18n";

/** Compatibility wrapper for non-block pages (tier workspace, spec pages).
 *  Block pages place `{ type: "adSlot" }` in their config instead. */
export function AdSlot({ variant = "billboard", lang = "en" }: AdSlotProps & { lang?: Lang }) {
  return <AdSlotBlock variant={variant} lang={lang} game="wow" data={undefined} />;
}
