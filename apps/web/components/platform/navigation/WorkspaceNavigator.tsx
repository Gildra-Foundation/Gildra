"use client";
import dynamic from "next/dynamic";
import { lazy, Suspense } from "react";
import { usePathname } from "next/navigation";
// The bar hydrates with the page (≈7 KB gzip). As a lazy chunk its server HTML
// was discarded whenever an update reached the root before the chunk arrived:
// the bar vanished for ~0.5 s and every inner page shifted (CLS 0.09–0.16).
import { WorkspaceNavigatorContent } from "./WorkspaceNavigatorContent";
import toolbarStyles from "./atlasToolbar.module.css";
import "@/components/platform/search/siteSearch.module.css";

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
    {/* Same box as the bar: if anything inside it ever suspends (search, dialogs),
        the page below keeps its place (no layout shift). */}
    <Suspense fallback={<div className={toolbarStyles.toolbar} data-atlas-scope aria-hidden="true" />}><WorkspaceNavigatorContent /></Suspense>
  </>;
}
