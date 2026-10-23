import type { AtlasToastTone } from "./AtlasToaster";

/**
 * A short confirmation at the bottom of the screen ("Link copied"), on the
 * Valyro toast stack. The toaster's code loads on the first call, so pages pay
 * nothing for it until something is confirmed.
 */
export function notify(message: string, { tone = "default", locale = "en" }: { tone?: AtlasToastTone; locale?: "en" | "ru" } = {}) {
  void import("./AtlasToaster").then(({ showAtlasToast }) => showAtlasToast(message, tone, locale));
}
