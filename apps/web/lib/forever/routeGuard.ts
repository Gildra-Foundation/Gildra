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

/** The professions of data/wow/forever/professions/catalog.json (a test keeps the two in step; the catalog itself is too large to load here). */
export const FOREVER_PROFESSION_SLUGS = ["alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring", "herbalism", "mining", "skinning", "cooking", "first-aid", "fishing"];

/** Check before the loading shell streams, so unknown records/classes get a real HTTP 404. */
export async function unknownForeverRoute(pathname: string, ids = recordIds): Promise<boolean> {
  const classRoute = /^(?:\/ru)?\/wow\/forever\/(?:classes|talent-calc)\/([^/]+)\/?$/.exec(pathname);
  if (classRoute) return !classes.has(classRoute[1] as typeof foreverClasses[number]["slug"]);
  // A profession and one of its recipes (the recipe pages share their ids with the library's recipes).
  const craft = /^(?:\/ru)?\/wow\/forever\/professions\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (craft) {
    if (!FOREVER_PROFESSION_SLUGS.includes(craft[1])) return true;
    if (craft[2] === undefined) return false;
    if (!/^[1-9]\d{0,9}$/.test(craft[2])) return true;
    try { return !(await ids("recipe")).has(Number(craft[2])); }
    catch { return false; }
  }
  const record = /^(?:\/ru)?\/wow\/forever\/library\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!record) return false;
  if (!isForeverType(record[1]) || !/^[1-9]\d{0,9}$/.test(record[2])) return true;
  try { return !(await ids(record[1])).has(Number(record[2])); }
  // A temporarily unavailable snapshot is handled by the page's error boundary, never mislabeled missing.
  catch { return false; }
}
