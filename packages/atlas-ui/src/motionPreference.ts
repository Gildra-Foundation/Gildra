/**
 * "Less motion" of the atlas: the system setting (prefers-reduced-motion) or the
 * reader's own choice on the site (the toggle in every inner page's footer),
 * kept in localStorage and mirrored as <html data-motion="reduced"> before the
 * first paint (inline script in app/root-document.tsx). CSS for the site switch lives
 * in app/styles/motion-preference.css; scripted effects ask lessMotion().
 */
export const MOTION_STORAGE_KEY = "gildra-motion";
const EVENT = "gildra-motion-change";

/** Inline script for <head>: applies the stored choice before the first paint. */
export const motionPreferenceScript = `try{if(localStorage.getItem("${MOTION_STORAGE_KEY}")==="reduced")document.documentElement.dataset.motion="reduced"}catch(e){}`;

export function siteMotionReduced() {
  return document.documentElement.dataset.motion === "reduced";
}

export function lessMotion() {
  return siteMotionReduced() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setSiteMotionReduced(reduced: boolean) {
  if (reduced) document.documentElement.dataset.motion = "reduced";
  else delete document.documentElement.dataset.motion;
  try {
    if (reduced) localStorage.setItem(MOTION_STORAGE_KEY, "reduced");
    else localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSiteMotion(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}
