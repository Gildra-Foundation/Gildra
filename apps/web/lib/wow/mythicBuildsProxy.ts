import { decodeMythicTalentImport } from "@/components/wow/mythic/mythicTalentImport";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validBuildPath(method: string, path: string[]) {
  return (method === "GET" && path.length === 0) || ((method === "PUT" || method === "DELETE") && path.length === 1 && uuid.test(path[0])) || (method === "POST" && path.length === 1 && path[0] === "import");
}
export function sameBuildOrigin(request: Request, expectedOrigin = new URL(request.url).origin) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).origin === new URL(expectedOrigin).origin && ["http:", "https:"].includes(new URL(origin).protocol); }
  catch { return false; }
}
export async function readBuildBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 100 * 1024) { await reader.cancel(); throw new Error("large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all)) as unknown;
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export function validateBuildBody(method: string, raw: unknown): unknown {
  if (!record(raw)) throw new Error("invalid");
  if (method === "DELETE") {
    if (Object.keys(raw).some(k => !["expectedRevision", "mutationId"].includes(k)) || !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 1 || typeof raw.mutationId !== "string" || !uuid.test(raw.mutationId)) throw new Error("invalid");
    return raw;
  }
  if (method === "POST") {
    if (Object.keys(raw).some(k => k !== "builds") || !Array.isArray(raw.builds) || !raw.builds.length || raw.builds.length > 20) throw new Error("invalid");
    return { builds: raw.builds.map(build => validateBuildBody("PUT", build)) };
  }
  if (Object.keys(raw).some(k => !["id", "name", "code", "expectedRevision", "mutationId"].includes(k)) || typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > 64 || typeof raw.code !== "string" || !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0 || typeof raw.id !== "string" || !uuid.test(raw.id) || typeof raw.mutationId !== "string" || !uuid.test(raw.mutationId)) throw new Error("invalid");
  const decoded = decodeMythicTalentImport(raw.code);
  if (!decoded.ok) throw new Error("invalid");
  return { ...raw, name: raw.name.trim(), code: decoded.code };
}
