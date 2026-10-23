/**
 * Valyro motion-kit through the atlas (valyro-ui/motion-kit, installed with
 * valyro-cli): does this machine composite on a GPU? Full-screen motion picks
 * its full variant on "gpu" and a one-layer dissolve on "cpu" (virtual machines,
 * remote desktops, software WebGL, two cores or 2 GB of memory or less).
 */
export { knownRenderTier, resolveRenderTier, warmRenderTier, type PageTransitionTierSetting } from "./valyro-ui/motion-kit/render-tier";
