/** The proxy accepts 8MiB; valid canonical selections up to 20k+20k fit below 3MiB. */
export const auctionGearSelectionBodyLimit = 4 * 1024 * 1024;

const hashPattern = /^[a-f0-9]{32}$/;
const invalid = (): never => { throw new Error("invalid_auction_selection"); };
type CompactVariantId = [number, string];

function variantKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20000 ||
      value.some(key => typeof key !== "string" || !key || key.length > 240) || new Set(value).size !== value.length) invalid();
  return value as string[];
}

function compactId(value: unknown): CompactVariantId {
  if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || value[0] <= 0 ||
      typeof value[1] !== "string" || !hashPattern.test(value[1])) invalid();
  return value as CompactVariantId;
}

/** Only exact current identities compact; legacy identities remain unchanged. */
function canonicalId(key: string): CompactVariantId | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isSafeInteger(parsed[0]) || parsed[0] <= 0 ||
        typeof parsed[1] !== "string" || !parsed[1].startsWith("auction:") || !hashPattern.test(parsed[1].slice(8)) ||
        JSON.stringify(parsed) !== key) return undefined;
    return [parsed[0], parsed[1].slice(8)];
  } catch { return undefined; }
}

/** Pure wire encoding: internal form, cache, work and recovery keep string keys. */
export function encodeAuctionGearSelectionTransport(body: Record<string, unknown>): Record<string, unknown> {
  if (!Object.hasOwn(body, "excludedVariantKeys")) return body;
  if (Object.hasOwn(body, "excludedVariantIds")) invalid();
  const raw: string[] = [], compact: CompactVariantId[] = [];
  for (const key of variantKeys(body.excludedVariantKeys)) {
    const id = canonicalId(key);
    if (id) compact.push(id); else raw.push(key);
  }
  return compact.length ? { ...body, excludedVariantKeys: raw, excludedVariantIds: compact } : body;
}

/** Normalize before selection ownership checks and idempotency fingerprints. */
export function decodeAuctionGearSelectionTransport(body: Record<string, unknown>): Record<string, unknown> {
  if (!Object.hasOwn(body, "excludedVariantIds")) return body;
  const compact = body.excludedVariantIds;
  if (!Array.isArray(compact) || compact.length > 20000) return invalid();
  const raw = Object.hasOwn(body, "excludedVariantKeys") ? variantKeys(body.excludedVariantKeys) : [];
  if (raw.length + compact.length > 20000) invalid();
  const keys = [...raw, ...compact.map(value => {
    const [itemId, hash] = compactId(value);
    return JSON.stringify([itemId, `auction:${hash}`]);
  })];
  if (new Set(keys).size !== keys.length) invalid();
  const normalized: Record<string, unknown> = { ...body, excludedVariantKeys: keys };
  delete normalized.excludedVariantIds;
  return normalized;
}
