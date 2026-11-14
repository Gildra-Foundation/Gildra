import "server-only";
import { readFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import { FOREVER_BUILD, FOREVER_TYPES, isForeverType, type ForeverRecord, type ForeverSummary, type ForeverType } from "./contract";

// Runtime-only files: never import this module from a client component.
const root = path.join(process.cwd(), "data/wow/forever/database");
const unzip = promisify(gunzip);
// The five record-type indexes stay for the life of the process (~34 MiB by the estimate below): every list
// and every search reads them, and a crawl through the records must not push them out of memory.
const indexes = new Map<string, unknown>();
// Record shards come and go: the most recently read, within the rest of the old 48 MiB budget.
const cache = new Map<string, { value: unknown; bytes: number }>();
const pending = new Map<string, Promise<unknown>>();
const CACHE_BYTES = 14 * 1024 * 1024;
let cacheBytes = 0;
async function read<T>(name: string, prepare: (value: unknown) => T = value => value as T, keep = false): Promise<T> {
  if (indexes.has(name)) return indexes.get(name) as T;
  const cached = cache.get(name);
  if (cached) {
    cache.delete(name);
    cache.set(name, cached);
    return cached.value as T;
  }
  let result = pending.get(name);
  if (!result) {
    result = (async () => {
      const bytes = await unzip(await readFile(path.join(root, name)));
      const value = prepare(JSON.parse(bytes.toString("utf8")));
      // Budget parsed objects and search strings conservatively, not compressed file sizes.
      const size = bytes.length * 3;
      if (keep) indexes.set(name, value);
      else if (size <= CACHE_BYTES) {
        while (cache.size && (cacheBytes + size > CACHE_BYTES || cache.size >= 48)) {
          const oldest = cache.keys().next().value!;
          cacheBytes -= cache.get(oldest)!.bytes;
          cache.delete(oldest);
        }
        cache.set(name, { value, bytes: size });
        cacheBytes += size;
      }
      return value;
    })().finally(() => pending.delete(name));
    pending.set(name, result);
  }
  return result as Promise<T>;
}
let totals: Promise<Record<ForeverType, number>> | undefined;
/** How many records of each type the snapshot holds: the manifest's own count, no index is read for it. */
export function foreverTotals() {
  totals ??= readFile(path.join(root, "manifest.json"), "utf8").then(text => {
    const manifest = JSON.parse(text) as { edition: string; build: string; inventory: Record<string, { imported: number }> };
    if (manifest.edition !== "forever" || manifest.build !== FOREVER_BUILD) throw new Error("Forever snapshot identity mismatch");
    return Object.fromEntries(FOREVER_TYPES.map(type => [type, manifest.inventory[type].imported])) as Record<ForeverType, number>;
  });
  // A failed read is not remembered: the next request tries again.
  totals.catch(() => { totals = undefined; });
  return totals;
}
export async function foreverRecord(type: ForeverType, id: number): Promise<ForeverRecord | null> {
  if (!isForeverType(type) || !Number.isSafeInteger(id) || id <= 0) return null;
  const shard = await read<Record<string, ForeverRecord>>(`${type}/${id % 64}.json.gz`);
  const record=shard[String(id)] ?? null;
  if(record && (record.edition!=="forever" || record.build!==FOREVER_BUILD)) throw new Error("Forever snapshot identity mismatch");
  return record;
}
export interface ForeverQuery { type?: string; q?: string; page?: string; quality?: string; category?: string; minLevel?: string; maxLevel?: string; related?: string; edge?: string }
const normalizeSearch = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/ё/g,"е").replace(/[’`]/g,"'");
export async function foreverSearch(query: ForeverQuery) {
  const type = isForeverType(query.type) ? query.type : "item";
  const terms = normalizeSearch((query.q ?? "").trim().slice(0, 120)).split(/\s+/).filter(Boolean);
  const quality = /^\d$/.test(query.quality ?? "") ? Number(query.quality) : undefined;
  const min = /^\d{1,3}$/.test(query.minLevel ?? "") ? Number(query.minLevel) : undefined;
  const max = /^\d{1,3}$/.test(query.maxLevel ?? "") ? Number(query.maxLevel) : undefined;
  const { index, names, categories } = await read(`${type}/index.json.gz`, value => {
    const index = value as ForeverSummary[];
    if(index.some(record=>record.edition!=="forever" || record.build!==FOREVER_BUILD)) throw new Error("Forever snapshot identity mismatch");
    const names = index.map(x => normalizeSearch(`${x.name.en} ${x.name.ru ?? ""}`));
    const categories = [...new Set(index.map(x => x.category).filter((x): x is string => Boolean(x)))].sort();
    return { index, names, categories };
  }, true);
  let related: Set<number> | undefined;
  if (query.related) {
    const [kind, id] = query.related.split(":");
    const source = isForeverType(kind) && /^[1-9]\d{0,9}$/.test(id ?? "") ? await foreverRecord(kind, Number(id)) : null;
    related = new Set(source?.relations.filter(x => x.type === type && (!query.edge || x.kind === query.edge)).map(x => x.id) ?? []);
  }
  const matches = index.filter((x, i) => terms.every(term => names[i].includes(term))
    && (!related || related.has(x.id))
    && (quality === undefined || x.quality === quality)
    && (!query.category || x.category === query.category || x.categories?.includes(query.category))
    && (min === undefined || (x.level ?? x.requiredLevel ?? -1) >= min)
    && (max === undefined || (x.level ?? x.requiredLevel ?? Infinity) <= max));
  const pages = Math.max(1, Math.ceil(matches.length / 48));
  const requested = /^\d{1,7}$/.test(query.page ?? "") ? Number(query.page) : 1;
  const page = Math.min(pages, Math.max(1, requested));
  return { edition: "forever" as const, type, page, pages, total: matches.length, categories, records: matches.slice((page - 1) * 48, page * 48) };
}
