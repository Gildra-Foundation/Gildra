/**
 * The atlas tempo for scripted motion (Web Animations, timers). The same values
 * as the CSS tokens in app/styles/atlas-theme.css (--atlas-ease, --atlas-duration*),
 * which CSS uses directly; tests/atlas/motion.test.ts keeps the two in step.
 * Motion only moves what the compositor can move: opacity and transform
 * (translate, scale). Hover, press and focus answer with colour changes at once
 * and the press scale (--atlas-press-scale*).
 */
export const ATLAS_EASE = "cubic-bezier(.2, .7, .2, 1)";
/** Tooltips, small state flips, the press. */
export const ATLAS_DURATION_FAST = 150;
/** Hover, focus, in-page switches and the page hand-over. */
export const ATLAS_DURATION = 200;
/** Torchlight fades, glows. */
export const ATLAS_DURATION_SLOW = 350;
/** Artwork zoom on hover. */
export const ATLAS_DURATION_ART = 550;
/** Arrival of a page's hero and sections. */
export const ATLAS_DURATION_ENTER = 620;
/** Step of an arrival cascade. */
export const ATLAS_STAGGER = 60;
/** One pass of light over a material on hover or focus. */
export const ATLAS_DURATION_SWEEP = 900;
/** A route or a glow drawing itself in. */
export const ATLAS_DURATION_DRAW = 1200;
/** One beat of a loading skeleton or a busy pulse. */
export const ATLAS_DURATION_PULSE = 1400;
/** One turn of a busy spinner. */
export const ATLAS_DURATION_SPIN = 900;
