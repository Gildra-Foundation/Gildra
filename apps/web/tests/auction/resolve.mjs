// Standalone server tests have no React rendering environment. Next supplies
// this marker at build time; keep the stub strictly inside the test loader.
import "../atlas/resolve.mjs";
import { register } from "node:module";
export function resolve(specifier, context, nextResolve) {
  if(specifier==="server-only") return {url:"data:text/javascript,export {};",shortCircuit:true};
  if(specifier === "next/headers") return nextResolve("next/headers.js",context);
  return nextResolve(specifier,context);
}
if(!import.meta.url.includes("?hooks")) register(import.meta.url+"?hooks");
