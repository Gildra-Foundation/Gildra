// Execute the existing pure TypeScript data projections for seed export/tests.
// This hook is limited to this process and is never loaded by the website.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  if (request === "@gildra/game-data") request = path.join(root, "../../packages/game-data/src/index.ts");
  return originalResolve.call(this, request, parent, ...rest);
};
Module._load = function (request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
module.exports = { root };
