/**
 * @gildra/atlas-ui — the Gildra atlas kit: building blocks of every inner page
 * (roadmap item 82). Server components with client islands, styled only through
 * the --atlas-* tokens (app/styles/atlas-theme.css). Catalogue and rules:
 * packages/atlas-ui/README.md. No app imports (ESLint): the app adapts the kit
 * in components/atlas (AtlasFrame with scenes and the legal line).
 */
export { AtlasFrameShell, type AtlasFrameShellProps, type AtlasGlow } from "./AtlasFrameShell";
export { AtlasHero } from "./AtlasHero";
export { AtlasStats, type AtlasStat } from "./AtlasStats";
export { AtlasSection } from "./AtlasSection";
export { AtlasPanel } from "./AtlasPanel";
export { AtlasCard, type AtlasCardImage, type AtlasCardMeta } from "./AtlasCard";
export { AtlasBadge, type AtlasBadgeTone } from "./AtlasBadge";
export { AtlasButton, AtlasLinkButton } from "./AtlasButton";
export { AtlasBreadcrumbs, type AtlasCrumb } from "./AtlasBreadcrumbs";
export { AtlasEmblem } from "./AtlasEmblem";
export { AtlasNotice } from "./AtlasNotice";
export { AtlasMetaList, type AtlasMetaItem } from "./AtlasMetaList";
export { AtlasGrid } from "./AtlasGrid";
export { AtlasAnchorNav, type AtlasAnchor } from "./AtlasAnchorNav";
export { formatAtlasDate, formatSeason, pluralRu, type AtlasLocale } from "./format";
export { AtlasTile } from "./AtlasTile";
export { AtlasPath, type AtlasPathStep } from "./AtlasPath";
export { AtlasDisclosure } from "./AtlasDisclosure";
export { AtlasTable, type AtlasColumn } from "./AtlasTable";
export { AtlasTabs, type AtlasTab } from "./AtlasTabs";
export { AtlasField, AtlasInput, AtlasSelect, AtlasCheckbox, AtlasRange } from "./AtlasField";
export { AtlasTooltip } from "./AtlasTooltip";
export { AtlasEmpty, AtlasError, AtlasSkeleton } from "./AtlasState";
export { AtlasDialog } from "./AtlasDialog";
export { AtlasToast } from "./AtlasToast";
export { AtlasShareButton } from "./AtlasShareButton";
export { AtlasArtGlow, type ArtGlowPoint } from "./AtlasArtGlow";
export { AtlasPagination } from "./AtlasPagination";
export { AtlasChart, type AtlasChartDatum } from "./AtlasChart";
export { artMorphName } from "./morph";
export { artPlaceholder, configureArtPlaceholders } from "./placeholders";
export { lessMotion, motionPreferenceScript, setSiteMotionReduced, siteMotionReduced, subscribeSiteMotion, MOTION_STORAGE_KEY } from "./motionPreference";
