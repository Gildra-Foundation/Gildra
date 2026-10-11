import Script from "next/script";

import { plausibleTracker } from "@/lib/cms/plausible";

/** Opt-in Plausible CE pageview tracking (see lib/cms/plausible.ts). Renders nothing unless configured. */
export function PlausibleTracker() {
  const tracker = plausibleTracker();
  if (!tracker) return null;
  return (
    <Script
      id="plausible"
      strategy="afterInteractive"
      defer
      data-domain={tracker.domain}
      data-api={tracker.api}
      src={tracker.src}
    />
  );
}
