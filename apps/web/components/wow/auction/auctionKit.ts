import type { MaterialKit } from "@/components/wow/shared/materialAtlas";

/**
 * Painted kit of the Auction House. Until its own kit is generated
 * (docs/auction-assets/CODEX-PROMPTS.v2.md) the page wears one finished kit of the
 * Mythic+ atlas: King's Rest — Zandalari gold over dark teal reads as coin and trade.
 * Plaques, buttons and icon frames are the shared material pieces (MaterialPlaque,
 * MaterialButton, materialIconFrameStyle); swap the slug here and all of them follow.
 */
export const auctionKit: MaterialKit = "kings-rest";
