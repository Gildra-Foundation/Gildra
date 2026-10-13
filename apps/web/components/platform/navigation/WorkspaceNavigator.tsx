"use client";
import dynamic from "next/dynamic";
import { lazy, Suspense } from "react";
import { usePathname } from "next/navigation";
// Load the top bar styles with the initial bundle; the bar itself mounts lazily
// and would otherwise paint unstyled for a frame and shift the page.
import "./atlasToolbar.module.css";
import "@/components/platform/search/siteSearch.module.css";

const WorkspaceNavigatorContent = lazy(
  () => import("./WorkspaceNavigatorContent").then((module) => ({ default: module.WorkspaceNavigatorContent })),
);
// The landing scene draws its own toolbar; it only gets the search hotkeys.
const SearchHotkeys = lazy(
  () => import("@/components/platform/search/SiteSearch").then((module) => ({ default: () => <module.SiteSearch hotkeysOnly /> })),
);
const DevelopmentRouteNavigation = process.env.NODE_ENV === "development"
  ? dynamic(() => import("@/components/motion/DevRouteNavigation").then((module) => module.DevRouteNavigation))
  : null;

export function WorkspaceNavigator() {
  const pathname = usePathname();
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  if (path === "/") return <Suspense fallback={null}><SearchHotkeys /></Suspense>;

  return <>
    {DevelopmentRouteNavigation ? <DevelopmentRouteNavigation /> : null}
    <Suspense fallback={null}><WorkspaceNavigatorContent /></Suspense>
  </>;
}
