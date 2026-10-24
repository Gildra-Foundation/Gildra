import { publications } from "@/lib/wow/publication";
/** Only reviewed public pages are indexed, in both locales. Private profiles stay out. */
export const staticPaths = (): string[] => [...new Set(publications.filter(entry => entry.ready && entry.path !== "/wow/characters").map(entry => entry.path))];
