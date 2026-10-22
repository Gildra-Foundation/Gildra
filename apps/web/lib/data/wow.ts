import "server-only";

/**
 * The one door to World of Warcraft game data for components and routes
 * (roadmap item 78): verified season data lives in data/** and is read here,
 * on the server; client components receive what they need through props.
 * ESLint forbids importing data/** from components/ and app/ directly.
 */
export * from "@gildra/game-data";
export * from "./wow/specializations";
export { default as seasonOnePublication } from "@/data/wow/midnight-season-one-publication.json";
export { liveSeason } from "./season";
