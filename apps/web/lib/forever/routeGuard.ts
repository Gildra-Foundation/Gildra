import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { foreverClasses } from "../../data/wow/forever/classes/roster.ts";
import { FOREVER_BUILD, isForeverType, type ForeverType } from "./database/contract.ts";

const classes = new Set(foreverClasses.map(entry => entry.slug));
const indexes = new Map<ForeverType, Promise<Set<number>>>();
async function recordIds(type: ForeverType) {
  let pending = indexes.get(type);
  if (!pending) {
    pending = readFile(path.join(process.cwd(), "data/wow/forever/database", type, "index.json.gz")).then(bytes => {
      const rows = JSON.parse(gunzipSync(bytes).toString("utf8")) as { id: number; edition: string; build: string }[];
      if (rows.some(row => row.edition !== "forever" || row.build !== FOREVER_BUILD)) throw new Error("Forever snapshot mismatch");
      return new Set(rows.map(row => row.id));
    });
    indexes.set(type, pending);
    pending.catch(() => indexes.delete(type));
  }
  return pending;
}

/** Check before the loading shell streams, so unknown records/classes get a real HTTP 404. */
export async function unknownForeverRoute(pathname: string, ids = recordIds): Promise<boolean> {
  const classRoute = /^(?:\/ru)?\/wow\/forever\/(?:classes|talent-calc)\/([^/]+)\/?$/.exec(pathname);
  if (classRoute) return !classes.has(classRoute[1] as typeof foreverClasses[number]["slug"]);
  const record = /^(?:\/ru)?\/wow\/forever\/library\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!record) return false;
  if (!isForeverType(record[1]) || !/^[1-9]\d{0,9}$/.test(record[2])) return true;
  try { return !(await ids(record[1])).has(Number(record[2])); }
  // A temporarily unavailable snapshot is handled by the page's error boundary, never mislabeled missing.
  catch { return false; }
}
