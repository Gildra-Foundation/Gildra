/**
 * The painted material kit of the Mythic+ hub (gildra-wow-material-design), shared with every page
 * that wears the same atlas — the Mythic+ meta, the Auction House and the rest of the site.
 * The pieces stay where the hub keeps them; feature modules reach them only through this door.
 *
 * New pages use the generic pieces (`MaterialPlaque`, `MaterialLinkButton`, `MaterialButton`,
 * `MaterialCard` / `MaterialFrame` — a scene in the kit's frame with a plaque — and
 * `materialIconFrameStyle`) instead of copying the plaque and button CSS of another page.
 */
export { MythicHubBackdrop } from "@/components/wow/mythic/MythicHubBackdrop";
export { MythicHubMotion } from "@/components/wow/mythic/MythicHubMotion";
export { MythicHubLinkButton } from "@/components/wow/mythic/hub/MythicHubLinkButton";
export { MythicHubOrnaments } from "@/components/wow/mythic/hub/MythicHubOrnaments";
export { mythicHubButtonLayout, mythicHubControlLayout } from "@/components/wow/mythic/hub/mythicHubControls";
export { MaterialPlaque, materialStyles } from "./material/MaterialPlaque";
export { MaterialButton, MaterialLinkButton } from "./material/MaterialButton";
export { MaterialCard, MaterialFrame } from "./material/MaterialCard";
export { materialButtonStyle, materialFrameArtwork, materialFrameStyle, materialIconFrameStyle, materialPlaqueStyle, type AnyMaterialKit, type MaterialIconKit, type MaterialKit, type RaidMaterialKit } from "./material/materialKit";
