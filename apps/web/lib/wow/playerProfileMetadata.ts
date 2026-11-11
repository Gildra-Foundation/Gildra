import "server-only";
import type { Metadata } from "next";
import { playerProfileCopy } from "@/components/wow/audit/playerProfileCopy";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";
import { loadPlayerProfile } from "./playerProfile";
import { playerProfilePath, type PlayerKey } from "./playerProfileView";

/**
 * Title and description of a public player profile. Profiles stay out of the index (as the
 * signed-in character pages): one page per character of the game, about a person.
 */
export async function playerMetadata(key: PlayerKey, locale: "en" | "ru"): Promise<Metadata> {
  const copy = playerProfileCopy[locale];
  const alternates = pairedAlternates(locale, playerProfilePath(key.region, key.realm, key.name));
  const robots = { index: false, follow: true };
  const load = await loadPlayerProfile(key, locale);
  if (load.state !== "ready") return { title: `${copy.unavailableTitle} — WowArcana`, robots, alternates };
  const { profile } = load;
  const title = copy.metaTitle(profile.snapshot.character.name, profile.realmName);
  const description = copy.metaDescription(profile.snapshot.character.name, profile.snapshot.character.className, profile.snapshot.character.itemLevel, profile.rating ? Math.round(profile.rating.value) : undefined);
  return { title, description, robots, alternates, openGraph: pageOpenGraph(locale, { title, description, path: String(alternates.canonical) }) };
}
