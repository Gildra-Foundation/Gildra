import "server-only";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { FOREVER_BUILD, isForeverType, type ForeverRecord, type ForeverSummary, type ForeverType } from "./contract";

// Runtime-only files: never import this module from a client component.
const root = path.join(process.cwd(), "data/wow/forever/database");
const cache = new Map<string, Promise<unknown>>();
async function read<T>(name: string): Promise<T> {
  let result = cache.get(name);
  if (!result) {
    result = readFile(path.join(root, name)).then(bytes => JSON.parse(gunzipSync(bytes).toString("utf8")) as unknown);
    cache.set(name, result);
    result.catch(() => cache.delete(name));
    // Bounded process cache; requests already holding a promise remain valid.
    if (cache.size > 48) cache.delete(cache.keys().next().value!);
  }
  return result as Promise<T>;
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
  const index = await read<ForeverSummary[]>(`${type}/index.json.gz`);
  if(index.some(record=>record.edition!=="forever" || record.build!==FOREVER_BUILD)) throw new Error("Forever snapshot identity mismatch");
  let related: Set<number> | undefined;
  if (query.related) {
    const [kind, id] = query.related.split(":");
    const source = isForeverType(kind) && /^[1-9]\d{0,9}$/.test(id ?? "") ? await foreverRecord(kind, Number(id)) : null;
    related = new Set(source?.relations.filter(x => x.type === type && (!query.edge || x.kind === query.edge)).map(x => x.id) ?? []);
  }
  const categories = [...new Set(index.map(x => x.category).filter((x): x is string => Boolean(x)))].sort();
  const matches = index.filter(x => terms.every(term => normalizeSearch(`${x.name.en} ${x.name.ru ?? ""}`).includes(term))
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
