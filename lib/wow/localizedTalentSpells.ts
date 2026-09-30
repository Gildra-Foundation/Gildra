type Lang = "ru" | "en";
export type LocalizedTalentSpell = { name: string; description: string };
const cacheDuration = 43_200_000;
type LocalizedTalentCache = {
  values: Map<string, { expires: number; value: LocalizedTalentSpell }>;
  requests: Map<string, Promise<LocalizedTalentSpell | null>>;
};
type LocalizedTalentGlobal = typeof globalThis & { __gildraLocalizedTalentCache?: LocalizedTalentCache };
const localizedTalentCache = (globalThis as LocalizedTalentGlobal).__gildraLocalizedTalentCache ??= {
  values: new Map(),
  requests: new Map(),
};
const { values: cache, requests } = localizedTalentCache;

function plainText(value: string) {
  const entities: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code: string) => {
      if (code.startsWith("#")) {
        const point = code.toLowerCase().startsWith("#x") ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
        return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
      }
      return entities[code.toLowerCase()] ?? entity;
    }).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function spellTooltip(spellId: number, lang: Lang, signal: AbortSignal): Promise<LocalizedTalentSpell | null> {
  const key = `${lang}:${spellId}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = requests.get(key);
  if (existing) return existing;
  const request = fetch(`https://nether.wowhead.com/tooltip/spell/${spellId}?dataEnv=1&locale=${lang === "ru" ? 7 : 0}`, {
    headers: { Accept: "application/json", "User-Agent": "Gildra/1.0 talent-calculator" },
    next: { revalidate: 43_200 },
    signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]),
  }).then(async (response) => {
    if (!response.ok) return null;
    const payload = await response.json() as { name?: unknown; tooltip?: unknown };
    const name = typeof payload.name === "string" ? plainText(payload.name) : "";
    if (!name) return null;
    const tooltip = typeof payload.tooltip === "string" ? payload.tooltip : "";
    const descriptions = [...tooltip.matchAll(/<div\s+class=(?:"q"|'q')>([\s\S]*?)<\/div>/gi)];
    const value = { name, description: plainText(descriptions.at(-1)?.[1] ?? "") };
    cache.set(key, { expires: Date.now() + cacheDuration, value });
    if (cache.size > 4_000) cache.delete(cache.keys().next().value as string);
    return value;
  }).catch(() => null).finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}

/** Fill catalog gaps from the existing localized tooltip source within a bounded SSR budget. */
export async function getLocalizedTalentSpells(spellIds: number[], lang: Lang, deadlineMs = 8_000) {
  const ids = [...new Set(spellIds)].filter((id) => Number.isInteger(id) && id > 0);
  const values = new Map<number, LocalizedTalentSpell>();
  if (!ids.length) return values;
  const signal = AbortSignal.timeout(deadlineMs);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(12, ids.length) }, async () => {
    while (cursor < ids.length && !signal.aborted) {
      const id = ids[cursor++];
      const value = await spellTooltip(id, lang, signal);
      if (value) values.set(id, value);
    }
  }));
  return values;
}
