"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const isStaging = () => document.cookie.split("; ").includes("gildra-env=staging");

/**
 * A fixed "STAGING" mark on the staging copy of the site, so its screenshots are
 * never mistaken for production. proxy.ts sets the cookie only when
 * GILDRA_STAGING=1; production renders nothing.
 */
export function StagingBadge() {
  const staging = useSyncExternalStore(noSubscribe, isStaging, () => false);
  if (!staging) return null;
  return <div className="staging-badge" role="note">Staging</div>;
}
