import { PlausibleScript } from "./PlausibleScript";

import { plausibleTracker } from "@/lib/analytics/plausible";

/** Opt-in Plausible CE pageview tracking (see lib/analytics/plausible.ts). Renders nothing unless configured. */
export function PlausibleTracker() {
  const tracker = plausibleTracker();
  if (!tracker) return null;
  return <PlausibleScript {...tracker} />;
}
