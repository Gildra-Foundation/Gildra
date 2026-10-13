export const consentKey = "gildra-consent";
export const consentChanged = "gildra-consent-changed";
export type BrowserConsent = "accepted" | "declined";

export function readBrowserConsent(): BrowserConsent | null {
  try {
    const value = localStorage.getItem(consentKey);
    return value === "accepted" || value === "declined" ? value : null;
  } catch { return null; }
}

export function saveBrowserConsent(value: BrowserConsent) {
  try { localStorage.setItem(consentKey, value); } catch { /* The choice still works for this page. */ }
  window.dispatchEvent(new CustomEvent(consentChanged, { detail: value }));
}
