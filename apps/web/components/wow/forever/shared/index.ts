/**
 * The shared parts of the Forever section — the contract is docs/forever/DESIGN.md.
 * Server components import from here. A client component imports a part from its own file
 * (`./shared/ForeverFilters`): through this index it would also bundle the rest.
 * The page frame is `ForeverFrame` (one level up); route states are `ForeverLoading` and
 * `ForeverError` in their own files (they bring the frame).
 */
export { ForeverHero, foreverTrail, type ForeverCrumb } from "./ForeverHero";
export { ForeverFilters, ForeverSearch, ForeverLevel, ForeverSelect, type ForeverOption } from "./ForeverFilters";
export { ForeverTabs, ForeverChips, type ForeverTab, type ForeverChip } from "./ForeverTabs";
export { ForeverPager } from "./ForeverPager";
export { ForeverPanel, ForeverStack, ForeverIcon, foreverIconFrame, foreverPanelStyles } from "./ForeverPanel";
export { ForeverArtGrid, ForeverArtCard, ForeverRows, ForeverRow, ForeverCrests, ForeverCrest, ForeverList, ForeverListRow, ForeverFeature } from "./ForeverCards";
export { ForeverEmpty, ForeverSkeleton } from "./ForeverStates";
export { foreverScenes, type ForeverPageId } from "./foreverScenes";
export { sharedCopy } from "./sharedCopy";
export { FOREVER_KIT } from "../foreverKit";
