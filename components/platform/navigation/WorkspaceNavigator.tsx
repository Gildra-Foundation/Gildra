"use client";
import dynamic from "next/dynamic";
import { lazy, Suspense } from "react";
import { usePathname } from "next/navigation";

const WorkspaceNavigatorContent = lazy(
  () => import("./WorkspaceNavigatorContent").then((module) => ({ default: module.WorkspaceNavigatorContent })),
);
const DevelopmentRouteNavigation = process.env.NODE_ENV === "development"
  ? dynamic(() => import("@/components/motion/DevRouteNavigation").then((module) => module.DevRouteNavigation))
  : null;

export function WorkspaceNavigator() {
  const pathname = usePathname();
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  if (path === "/") return null;

  return <>
    {DevelopmentRouteNavigation ? <DevelopmentRouteNavigation /> : null}
    <Suspense fallback={null}><WorkspaceNavigatorContent /></Suspense>
  </>;
}
