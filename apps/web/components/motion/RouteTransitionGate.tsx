"use client";

import type { ReactNode } from "react";
import { RouteTransitionRuntime } from "./RouteTransitionRuntime";

/** Every route shares the atlas theme and the header's skip-link target. */
export function RouteTransitionGate({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-content gildra-atlas" data-atlas-theme="dark" id="atlas-content" tabIndex={-1}>
      <RouteTransitionRuntime>{children}</RouteTransitionRuntime>
    </div>
  );
}
