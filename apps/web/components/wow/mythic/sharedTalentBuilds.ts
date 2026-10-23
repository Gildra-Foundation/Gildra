import { decodeMythicTalentImport } from "./mythicTalentImport";
import { maxBuildNameLength } from "./savedTalentBuilds";

export const sharedBuildPrefix = "#mythic-build=";
export type SharedTalentBuild = { name: string; code: string };
export type SharedBuildResult = { ok: true; build: SharedTalentBuild } | { ok: false } | null;
const maxFragmentLength = 7000;

function validate(value: unknown): SharedTalentBuild {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid shared build");
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).sort().join(",") !== "code,name,v" || entry.v !== 1 || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > maxBuildNameLength || typeof entry.code !== "string") throw new Error("Invalid shared build");
  const decoded = decodeMythicTalentImport(entry.code);
  if (!decoded.ok) throw new Error("Outdated shared build");
  return { name: entry.name.trim(), code: decoded.code };
}

/** A snapshot of one build only. No account identifiers, credentials or library IDs. */
export function sharedBuildFragment(build: SharedTalentBuild): string {
  const checked = validate({ v: 1, name: build.name, code: build.code });
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, ...checked }));
  const fragment = sharedBuildPrefix + btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  if (fragment.length > maxFragmentLength) throw new Error("Shared build too large");
  return fragment;
}

export function readSharedBuild(fragment: string): SharedBuildResult {
  if (!fragment.startsWith(sharedBuildPrefix)) return null;
  try {
    if (fragment.length > maxFragmentLength) throw new Error("Shared build too large");
    const encoded = fragment.slice(sharedBuildPrefix.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error("Invalid encoding");
    const raw = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
    return { ok: true, build: validate(value) };
  } catch { return { ok: false }; }
}

export function sharedBuildUrl(pageUrl: string, build: SharedTalentBuild): string {
  const url = new URL(pageUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid page URL");
  // Keep the dungeon and language, discard unrelated query parameters and anchors.
  url.search = "";
  url.hash = sharedBuildFragment(build);
  return url.href;
}
