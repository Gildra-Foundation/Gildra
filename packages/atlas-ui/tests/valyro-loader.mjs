// SSR test loader only: transpile source TSX; the browser build still uses Next.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/link") return nextResolve("next/link.js", context);
  if (specifier.startsWith(".")) {
    const base = new URL(specifier, context.parentURL);
    for (const suffix of [".tsx", ".ts", "/index.ts", "/index.tsx"]) {
      const target = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(target))) return { url: target.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) return { format: "module", source: "export default new Proxy({}, {get: (_, key) => String(key)})", shortCircuit: true };
  if (/\.tsx?$/.test(url)) return {
    format: "module", shortCircuit: true,
    source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  };
  return nextLoad(url, context);
}
if (!import.meta.url.includes("?hooks")) register(import.meta.url + "?hooks");
