import config from "@payload-config";
import "@payloadcms/next/css";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import type { ServerFunctionClient } from "payload";
import { Alegreya, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { importMap } from "./admin/importMap";
import { secureSchedulePublish, secureUpcomingScheduledPublish } from "../../jobs/scheduleActions";
import "./atlas-tokens.css";
import "./custom.scss";

// The site's two families (apps/web/app/root-document.tsx), self-hosted by
// next/font with swap. Text paints at once in the metric-matched fallbacks of
// atlas-tokens.css, so the swap does not move the layout. Not preloaded: the
// admin's first paint should not wait on font downloads.
const ui = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-ui", preload: false });
const display = Alegreya({ subsets: ["latin", "cyrillic"], variable: "--font-atlas-display", preload: false });

const serverFunction: ServerFunctionClient = async (args) => {
  "use server";
  return handleServerFunctions({ ...args, config, importMap, serverFunctions: {
    "schedule-publish": secureSchedulePublish,
    "get-upcoming-scheduled-publish": secureUpcomingScheduledPublish,
  } });
};

export default function PayloadLayout({ children }: { children: ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction} htmlProps={{ className: `${ui.variable} ${display.variable}` }}>
      {children}
    </RootLayout>
  );
}
