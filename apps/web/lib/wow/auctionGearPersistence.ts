import "server-only";
import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, mkdirSync, openSync, readSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { deserialize, serialize } from "node:v8";
import { gunzipSync, gzipSync } from "node:zlib";

/** Private single-writer checkpoints. No bearer tokens or executable tasks. */
const version = 2;
export const auctionSimulationContract = "native-apl-v1";
const maxHeader = 64 * 1024, maxCompressed = 16 * 1024 * 1024, maxUncompressed = 128 * 1024 * 1024;
const limits = { search: 40, job: 200 };
type Kind = keyof typeof limits;
export type AuctionStateHeader<M = Record<string, unknown>> = {
  version: number; simulationContract: string; kind: Kind; id: string; expiresAt: number; metadata: M;
};
type Envelope = AuctionStateHeader & { data: unknown };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

function directory() {
  const value = process.env.GILDRA_AUCTION_STATE_DIR;
  if (!value) return null;
  if (!isAbsolute(value)) throw new Error("auction_storage_unavailable");
  try { mkdirSync(value, { recursive: true, mode: 0o700 }); }
  catch { throw new Error("auction_storage_unavailable"); }
  return value;
}
function syncDirectory(dir: string) {
  const fd = openSync(dir, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function ioFailure(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  return typeof code === "string" && /^E(?!RR_)/.test(code);
}
function readExactly(fd: number, length: number, position: number) {
  const bytes = Buffer.alloc(length);
  let completed = 0;
  while (completed < length) {
    const read = readSync(fd, bytes, completed, length - completed, position + completed);
    if (!read) throw new Error("invalid_auction_checkpoint");
    completed += read;
  }
  return bytes;
}
function validHeader(value: unknown, kind: Kind, id: string, fresh = true): value is AuctionStateHeader {
  if (!value || typeof value !== "object") return false;
  const header = value as AuctionStateHeader;
  return header.version === version && header.simulationContract === auctionSimulationContract && header.kind === kind && header.id === id &&
    Number.isFinite(header.expiresAt) && (!fresh || header.expiresAt > Date.now()) && Boolean(header.metadata) && typeof header.metadata === "object" && !Array.isArray(header.metadata);
}
function readHeader(fd: number, kind: Kind, id: string) {
  const size = fstatSync(fd).size;
  if (size < 5 || size > maxCompressed + maxHeader + 4) throw new Error();
  const lengthBytes = readExactly(fd, 4, 0);
  const length = lengthBytes.readUInt32BE(0);
  if (length < 2 || length > maxHeader || length + 4 >= size || size - length - 4 > maxCompressed) throw new Error();
  const raw = readExactly(fd, length, 4);
  const header: unknown = JSON.parse(raw.toString("utf8"));
  if (!validHeader(header, kind, id)) throw new Error();
  return { header, offset: length + 4 };
}
function replaceFile(dir: string, kind: Kind, id: string, header: AuctionStateHeader, compressed: Buffer) {
  const target = join(dir, `${kind}-${id}.bin`), temporary = join(dir, `.${kind}-${id}.${randomUUID()}.tmp`);
  const replacing = existsSync(target);
  let fd: number | undefined, renamed = false;
  try {
    const rawHeader = Buffer.from(JSON.stringify(header));
    if (rawHeader.length > maxHeader || compressed.length > maxCompressed) throw new Error();
    const prefix = Buffer.alloc(4); prefix.writeUInt32BE(rawHeader.length);
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, Buffer.concat([prefix, rawHeader, compressed])); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, target); renamed = true; syncDirectory(dir);
  } catch {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch { /* No unfinished record to remove. */ }
    if (renamed && !replacing) {
      try { unlinkSync(target); syncDirectory(dir); } catch { /* Preserve the storage error if rollback also fails. */ }
    }
    throw new Error("auction_storage_unavailable");
  }
}
export function auctionPersistenceEnabled() { return Boolean(process.env.GILDRA_AUCTION_STATE_DIR); }

/** A bounded metadata prefix permits startup/owner lookups without inflating every retained result. */
export function writeAuctionState(kind: Kind, id: string, expiresAt: number, data: unknown,
  { replaceId, metadata = {} }: { replaceId?: string; metadata?: Record<string, unknown> } = {}) {
  const dir = directory();
  if (!dir) return;
  if (!validId(id) || !Number.isFinite(expiresAt)) throw new Error("auction_storage_unavailable");
  const target = join(dir, `${kind}-${id}.bin`);
  try {
    const count = readdirSync(dir).filter(name => name.startsWith(`${kind}-`) && name.endsWith(".bin")).length;
    const replacing = replaceId && replaceId !== id && validId(replaceId) && existsSync(join(dir, `${kind}-${replaceId}.bin`));
    if (!existsSync(target) && count >= limits[kind] && !(count === limits[kind] && replacing)) throw new Error();
    const rawHeader = Buffer.from(JSON.stringify({ version, simulationContract: auctionSimulationContract, kind, id, expiresAt, metadata }));
    if (rawHeader.length > maxHeader) throw new Error();
    const header = JSON.parse(rawHeader.toString("utf8")) as AuctionStateHeader;
    const bytes = serialize({ ...header, data } satisfies Envelope);
    if (bytes.length > maxUncompressed) throw new Error();
    const compressed = gzipSync(bytes, { level: 1 });
    if (compressed.length > maxCompressed) throw new Error();
    replaceFile(dir, kind, id, header, compressed);
  } catch {
    throw new Error("auction_storage_unavailable");
  }
}

/** Persist only lifecycle changes, copying compressed data without deserializing it. */
export function touchAuctionState(kind: Kind, id: string, expiresAt: number, lifecycle: { touchedAt: number; recency: number }) {
  const dir = directory();
  if (!dir) return;
  if (!validId(id) || !Number.isFinite(expiresAt) || !Number.isFinite(lifecycle.touchedAt) || !Number.isSafeInteger(lifecycle.recency)) throw new Error("auction_storage_unavailable");
  let fd: number | undefined;
  try {
    fd = openSync(join(dir, `${kind}-${id}.bin`), constants.O_RDONLY | constants.O_NOFOLLOW);
    const { header, offset } = readHeader(fd, kind, id);
    if (expiresAt < header.expiresAt || lifecycle.recency <= Number(header.metadata.recency ?? 0)) throw new Error();
    const compressed = readExactly(fd, fstatSync(fd).size - offset, offset);
    closeSync(fd); fd = undefined;
    replaceFile(dir, kind, id, { ...header, expiresAt, metadata: { ...header.metadata, ...lifecycle } }, compressed);
  } catch {
    if (fd !== undefined) closeSync(fd);
    throw new Error("auction_storage_unavailable");
  }
}
export function removeAuctionState(kind: Kind, id: string) {
  const dir = directory();
  if (!dir || !validId(id)) return;
  try { unlinkSync(join(dir, `${kind}-${id}.bin`)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("auction_storage_unavailable");
  }
  try { syncDirectory(dir); } catch { throw new Error("auction_storage_unavailable"); }
}

/** Read only bounded prefixes; corrupt, expired and incompatible records fail closed. */
export function listAuctionStateHeaders<M = Record<string, unknown>>(kind: Kind): Array<AuctionStateHeader<M>> {
  const dir = directory();
  if (!dir) return [];
  let names: string[];
  try { names = readdirSync(dir); } catch { throw new Error("auction_storage_unavailable"); }
  const records: Array<AuctionStateHeader<M>> = [];
  for (const name of names) {
    if (!name.startsWith(`${kind}-`) || !name.endsWith(".bin")) continue;
    const id = name.slice(kind.length + 1, -4);
    if (!validId(id)) continue;
    let header: AuctionStateHeader | undefined, fd: number | undefined;
    try { fd = openSync(join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW); header = readHeader(fd, kind, id).header; }
    catch (error) {
      if (ioFailure(error) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("auction_storage_unavailable");
    }
    finally { if (fd !== undefined) closeSync(fd); }
    if (!header) { removeAuctionState(kind, id); continue; }
    records.push(header as AuctionStateHeader<M>);
  }
  const recency = (header: AuctionStateHeader<M>) => {
    const value = (header.metadata as Record<string, unknown>).recency;
    return Number.isSafeInteger(value) ? Number(value) : header.expiresAt;
  };
  records.sort((a, b) => recency(b) - recency(a) || b.expiresAt - a.expiresAt || a.id.localeCompare(b.id));
  for (const record of records.slice(limits[kind])) removeAuctionState(kind, record.id);
  return records.slice(0, limits[kind]);
}

/** Inflate one explicitly selected record, checking the body against its metadata prefix. */
export function readAuctionState<T, M = Record<string, unknown>>(kind: Kind, id: string): { id: string; expiresAt: number; data: T; metadata: M } | null {
  const dir = directory();
  if (!dir || !validId(id)) return null;
  let fd: number | undefined;
  try {
    fd = openSync(join(dir, `${kind}-${id}.bin`), constants.O_RDONLY | constants.O_NOFOLLOW);
    const { header, offset } = readHeader(fd, kind, id), size = fstatSync(fd).size;
    const compressed = readExactly(fd, size - offset, offset);
    closeSync(fd); fd = undefined;
    const envelope = deserialize(gunzipSync(compressed, { maxOutputLength: maxUncompressed })) as Envelope;
    const identity = (metadata: Record<string, unknown>) => Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "recency" && key !== "touchedAt"));
    if (!validHeader(envelope, kind, id, false) || envelope.expiresAt > header.expiresAt ||
        Number(envelope.metadata.recency ?? 0) > Number(header.metadata.recency ?? 0) ||
        JSON.stringify(identity(envelope.metadata)) !== JSON.stringify(identity(header.metadata))) throw new Error();
    return { id, expiresAt: header.expiresAt, data: envelope.data as T, metadata: header.metadata as M };
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (ioFailure(error) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("auction_storage_unavailable");
    removeAuctionState(kind, id);
    return null;
  }
}

/** Compatibility wrapper for callers that explicitly need every body. */
export function readAuctionStates<T>(kind: Kind): Array<{ id: string; expiresAt: number; data: T }> {
  return listAuctionStateHeaders(kind).flatMap(header => {
    const record = readAuctionState<T>(kind, header.id);
    return record ? [{ id: record.id, expiresAt: record.expiresAt, data: record.data }] : [];
  });
}
