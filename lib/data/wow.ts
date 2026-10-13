import "server-only";

/**
 * The one door to World of Warcraft game data for components and routes
 * (roadmap item 78): verified season data lives in data/** and is read here,
 * on the server; client components receive what they need through props.
 * ESLint forbids importing data/** from components/ and app/ directly.
 */
export * from "@/data/wow/midnight-specializations";
export * from "@/data/wow/midnight-delves";
export * from "@/data/wow/midnight-lairs";
export * from "@/data/venomousAbyss";
export { default as contentManifest } from "@/data/wow/content-manifest.json";
export { default as seasonOnePublication } from "@/data/wow/midnight-season-one-publication.json";
export { liveSeason } from "./season";
