import data from "@/data/wow/mists/classes.json";
import type { MistsClass } from "./types";

/** Built by scripts/build-wow-mists.mjs from Blizzard's Classic game data. */
export const mistsClasses = data.classes as MistsClass[];
export const mistsClass = (slug: string) => mistsClasses.find((cls) => cls.slug === slug) ?? null;
