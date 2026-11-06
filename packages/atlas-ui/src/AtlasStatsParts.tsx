"use client";

import dynamic from "next/dynamic";

// Every page's 404 boundary renders an AtlasHero, so whatever AtlasStats imports
// statically ships with every page, yet only the hubs show stats. The Valyro card
// (with its icon set) and the count-up load as their own chunk, fetched by the
// pages that render them; their styles stay in the shared sheet (AtlasStats.tsx).
export const AtlasStatsCard = dynamic(() => import("./valyro-ui/data-display/StatsCard").then((module) => module.StatsCard));
export const AtlasStatsCountUp = dynamic(() => import("./AtlasCountUp").then((module) => module.AtlasCountUp));
