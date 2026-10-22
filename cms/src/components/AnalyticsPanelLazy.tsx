"use client";

import dynamic from "next/dynamic";

/**
 * The analytics screen (charts, filter bar) in its own chunk. Payload's import
 * map loads every admin view's client code on every admin page; this keeps the
 * rarely opened analytics out of the shared bundle. It still renders on the
 * server, and its chunk is fetched only where it is used.
 */
export const AnalyticsPanelLazy = dynamic(() => import("./AnalyticsPanel").then((module) => module.AnalyticsPanel));
