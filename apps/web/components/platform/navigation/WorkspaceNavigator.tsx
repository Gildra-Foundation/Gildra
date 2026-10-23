"use client";
import dynamic from "next/dynamic";
// The shared bar hydrates with the page so navigation never waits for a lazy chunk.
// No Suspense boundary around it: nothing in it suspends, and React 19.2 reveals
// an outlined boundary only on its ~300 ms batch, so the bar arrived after the page.
import { WorkspaceNavigatorContent } from "./WorkspaceNavigatorContent";
import "@/components/platform/search/siteSearch.module.css";

const DevelopmentRouteNavigation = process.env.NODE_ENV === "development"
  ? dynamic(() => import("@/components/motion/DevRouteNavigation").then((module) => module.DevRouteNavigation))
  : null;

export function WorkspaceNavigator() {
  return <>
    {DevelopmentRouteNavigation ? <DevelopmentRouteNavigation /> : null}
    <WorkspaceNavigatorContent />
  </>;
}
