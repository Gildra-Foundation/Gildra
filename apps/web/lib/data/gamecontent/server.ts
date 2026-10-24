import "server-only";
import { cache } from "react";
import { createGameContentReader, PublicationNotFound } from "./reader";
import type { Edition } from "./types";

export function gameContentEnabled() { return Boolean(process.env.GAME_CONTENT_API_URL); }

async function fetchJSON(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (response.status === 404) throw new PublicationNotFound("Publication is not available");
  if (!response.ok) throw new Error(`Game content unavailable (${response.status})`);
  const raw = await response.text();
  if (raw.length > 24 * 1024 * 1024) throw new Error("Game content response exceeds limit");
  return JSON.parse(raw) as unknown;
}

let reader: ReturnType<typeof createGameContentReader> | undefined;
function getReader() {
  if (!reader) reader = createGameContentReader(process.env.GAME_CONTENT_API_URL!, fetchJSON);
  return reader;
}

// React memoization pins metadata and page reads to the same publication for
// this render. The small publication pointer is checked on every render;
// immutable module payloads are reused by the reader. This also lets genuine
// source outages reach the explicit last-known-good state instead of being
// silently masked by Next's stale fetch cache.
export const getPublishedRaids = cache(async (edition: Edition = "retail") => {
  if (!gameContentEnabled()) return null;
  return getReader()(edition, "raids");
});
export const getPublishedMythic = cache(async (edition: Edition = "retail") => {
  if (!gameContentEnabled()) return null;
  return getReader()(edition, "mythic-plus");
});
