// Test-only module resolution for `node --test`: the "@/..." alias of
// tsconfig.json, extensionless relative imports (./file → ./file.ts), JSON
// imports without an import attribute and the "server-only" marker.
import { existsSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  // Next.js provides the build-time "server-only" marker; tests run as server code.
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  // JSON modules imported the way the app does (no `with { type: "json" }`).
  const next = async (target, ctx) => {
    const result = await nextResolve(target, ctx);
    return result.url.endsWith(".json") ? { ...result, importAttributes: { ...result.importAttributes, type: "json" } } : result;
  };
  let target = specifier;
  if (specifier.startsWith("@/")) target = pathToFileURL(root + specifier.slice(2)).href;
  else if (!(specifier.startsWith("./") || specifier.startsWith("../")) || /\.[cm]?[jt]sx?$|\.json$/.test(specifier)) return next(specifier, context);
  const base = target.startsWith("file:") ? target : new URL(target, context.parentURL).href;
  for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
    if (existsSync(fileURLToPath(base + suffix)) && !(suffix === "" && !/\.[a-z]+$/.test(base))) return next(base + suffix, context);
  }
  return next(specifier, context);
}

if (!import.meta.url.includes("?hooks")) register(import.meta.url + "?hooks");
