"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
// Keep the shared contents toolbar styled before its lazy dialog loads.
import "@/components/platform/navigation/bookNavigation.module.css";
import { RouteThemeController } from "./RouteThemeController";
import routeStyles from "./routeTransition.module.css";

const bookTransitionsEnabled = process.env.NODE_ENV !== "development"
  || process.env.NEXT_PUBLIC_ENABLE_DEV_BOOK_TRANSITIONS === "1";
const RouteTransition = bookTransitionsEnabled
  ? dynamic(() => import("./RouteTransition").then((module) => module.RouteTransition))
  : null;

export function RouteTransitionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const landing = pathname === "/" || pathname === "/ru" || pathname === "/ru/";
  return (
    <div className={landing ? "workspace-content" : "workspace-content gildra-atlas"} data-atlas-theme={landing ? undefined : "dark"}>
      {RouteTransition ? <RouteTransition>{children}</RouteTransition> : <>
        <RouteThemeController />
        <div className={routeStyles.system} data-theme="wow" data-book-navigation="idle">
          <div className={routeStyles.frame} data-theme="wow">{children}</div>
        </div>
      </>}
    </div>
  );
}
