"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { RouteThemeController } from "./RouteThemeController";
import routeStyles from "./routeTransition.module.css";

const bookTransitionsEnabled = process.env.NODE_ENV !== "development"
  || process.env.NEXT_PUBLIC_ENABLE_DEV_BOOK_TRANSITIONS === "1";
const RouteTransition = bookTransitionsEnabled
  ? dynamic(() => import("./RouteTransition").then((module) => module.RouteTransition))
  : null;

export function RouteTransitionGate({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-content">
      {RouteTransition ? <RouteTransition>{children}</RouteTransition> : <>
        <RouteThemeController />
        <div className={routeStyles.system} data-theme="wow" data-book-navigation="idle">
          <div className={routeStyles.frame} data-theme="wow">{children}</div>
        </div>
      </>}
    </div>
  );
}
