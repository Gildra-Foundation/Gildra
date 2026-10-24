import "server-only";
import { publications, publicationFor } from "./publicationData";
export { publications, publicationFor, isPublicationReady, canonicalPublicationPath } from "./publicationData";
export type { Publication } from "./publicationData";
/** Candidate previews expose mandatory drafts for review, never in the sitemap. */
export function canBrowsePublication(path: string) {
  const entry = publicationFor(path);
  return entry?.ready === true || (process.env.GILDRA_STAGING === "1" && entry?.required === true);
}
export function requiredPublicationBlockers() { return publications.filter(entry => entry.required && !entry.ready); }

export function isUnpublishedPath(path: string) {
  const entry = publicationFor(path);
  return Boolean(entry && !canBrowsePublication(entry.path));
}
