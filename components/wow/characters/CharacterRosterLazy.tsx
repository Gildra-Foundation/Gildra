"use client";

import dynamic from "next/dynamic";

/**
 * The signed-out and signed-in roster share one route module; loading the
 * roster code through this boundary keeps it off the signed-out page.
 */
export const CharacterRosterLazy = dynamic(() => import("./CharacterRoster").then((module) => module.CharacterRoster));
