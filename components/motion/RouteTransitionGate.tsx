"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
// Keep the shared contents toolbar styled before its lazy dialog loads.
import "@/components/platform/navigation/bookNavigation.module.css";
import { RouteTransitionRuntime } from "./RouteTransitionRuntime";

/** Root wrapper: atlas scope for inner routes and the page-to-page transition for all. */
export function RouteTransitionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const landing = pathname === "/" || pathname === "/ru" || pathname === "/ru/";
  return (
    <div className={landing ? "workspace-content" : "workspace-content gildra-atlas"} data-atlas-theme={landing ? undefined : "dark"}>
      <RouteTransitionRuntime>{children}</RouteTransitionRuntime>
    </div>
  );
}
