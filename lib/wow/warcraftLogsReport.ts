export type WarcraftLogsReportActor = { id: number; name: string; server?: string; type?: string; subType?: string };

export type WarcraftLogsActorResolution =
  | { actor: WarcraftLogsReportActor; error?: never }
  | { actor?: never; error: "invalid_character_slug" | "character_not_in_report" | "character_ambiguous" };

function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function resolveWarcraftLogsActor(characterSlug: string, actors: WarcraftLogsReportActor[]): WarcraftLogsActorResolution {
  let decoded: string;
  try { decoded = decodeURIComponent(characterSlug); }
  catch { return { error: "invalid_character_slug" }; }
  const parts = decoded.split("--"), realm = parts[1] ?? "", name = parts.slice(2).join("--");
  if (parts.length < 3 || !realm || !name) return { error: "invalid_character_slug" };
  const candidates = actors.filter((actor) => actor.type === "Player" && actor.name.normalize("NFKC").toLocaleLowerCase() === name.normalize("NFKC").toLocaleLowerCase());
  const exactRealm = candidates.filter((actor) => actor.server && normalized(actor.server) === normalized(realm));
  if (exactRealm.length === 1) return { actor: exactRealm[0] };
  if (exactRealm.length > 1 || candidates.length > 1) return { error: "character_ambiguous" };
  if (candidates.length === 1 && !candidates[0].server) return { actor: candidates[0] };
  return { error: "character_not_in_report" };
}

export function analyzableWarcraftLogsFights<T extends { startTime: number; endTime: number; friendlyPlayers?: number[] }>(fights: T[], actorID: number) {
  return fights.filter((fight) => fight.endTime > fight.startTime && fight.friendlyPlayers?.includes(actorID));
}
