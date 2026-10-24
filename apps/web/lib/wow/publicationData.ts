import { contentManifest } from "@gildra/game-data";

export type Publication = { path: string; ready: boolean; season: string | null; verifiedAt: string | null; sources: string[]; required: boolean };
export const publications = contentManifest.publication as Publication[];
export function canonicalPublicationPath(path: string) {
  const bare = path.replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";
  return bare.replace(/^\/wow\/(?:dungeons|mythic)\/([^/]+)$/, "/wow/mythic-plus/midnight-season-2/$1");
}
export function publicationFor(path: string) {
  return publications.find(entry => entry.path === canonicalPublicationPath(path));
}
export function isPublicationReady(path: string) { return publicationFor(path)?.ready === true; }
