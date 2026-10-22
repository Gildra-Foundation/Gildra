"use client";
import dynamic from "next/dynamic";
import { Suspense } from "react";
// The shared bar hydrates with the page so navigation never waits for a lazy chunk.
import { WorkspaceNavigatorContent } from "./WorkspaceNavigatorContent";
import toolbarStyles from "./atlasToolbar.module.css";
import "@/components/platform/search/siteSearch.module.css";

const DevelopmentRouteNavigation = process.env.NODE_ENV === "development"
  ? dynamic(() => import("@/components/motion/DevRouteNavigation").then((module) => module.DevRouteNavigation))
  : null;

export function WorkspaceNavigator() {
  return <>
    {DevelopmentRouteNavigation ? <DevelopmentRouteNavigation /> : null}
    <Suspense fallback={<div className={toolbarStyles.toolbar} data-atlas-scope aria-hidden="true" />}><WorkspaceNavigatorContent /></Suspense>
  </>;
}
