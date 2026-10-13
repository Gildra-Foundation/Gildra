/**
 * @gildra/game-data — verified season data (roadmap item 83). Plain data and
 * pure helpers, no React and no app imports. The web app reads it through
 * lib/data (server side); the catalog scripts read content-manifest.json, also
 * reachable at its old path data/wow/content-manifest.json (a symlink).
 */
export * from "./midnight-specializations";
export * from "./midnight-delves";
export * from "./midnight-lairs";
export * from "./venomous-abyss";
export { default as contentManifest } from "./content-manifest.json";
