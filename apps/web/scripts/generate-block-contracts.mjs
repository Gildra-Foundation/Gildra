#!/usr/bin/env node
// Block contracts (roadmap item 85): the JSON Schema of every block's props,
// generated from the TypeScript types the blocks are written with, so the CMS
// and the web app agree on what a block accepts.
//   npm run blocks:contracts            writes contracts/blocks.schema.json and the CMS copy
//   npm run blocks:contracts -- --check fails when either file is out of date (CI)
// The web app validates CMS page overrides against it (lib/cms/pages.ts). The
// CMS builds from its own folder (Docker context ./cms), so it gets a generated
// copy, cms/src/blocks/contract.generated.json, with the same block contracts
// plus the pages it may override: every static page definition
// (lib/games/*/pages/*.ts, no route params) with the block types its code
// config uses, plus CMS_EXTRA_BLOCKS below.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pageFiles = fs.readdirSync(path.join(root, "lib/games"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, "lib/games", entry.name, "pages")))
  .flatMap((entry) => fs.readdirSync(path.join(root, "lib/games", entry.name, "pages")).filter((file) => file.endsWith(".ts")).map((file) => path.join(root, "lib/games", entry.name, "pages", file)))
  .sort();
/** Blocks editors may add to a page beyond those its code config uses. */
const CMS_EXTRA_BLOCKS = { "wow/tier-lists": ["sectionNav", "container", "columns"] };
const registries = ["lib/blocks/registries/shared.ts", "lib/blocks/registries/wow.ts", "lib/blocks/registries/league.ts"].map((file) => path.join(root, file));

const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const program = ts.createProgram([...registries, ...pageFiles], { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();

function schemaOf(type, depth = 0) {
  if (depth > 8) return {};
  if (type.flags & ts.TypeFlags.StringLiteral) return { const: type.value };
  if (type.flags & ts.TypeFlags.NumberLiteral) return { const: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral) return { const: checker.typeToString(type) === "true" };
  if (type.flags & ts.TypeFlags.String) return { type: "string" };
  if (type.flags & ts.TypeFlags.Number) return { type: "number" };
  if (type.flags & ts.TypeFlags.Boolean) return { type: "boolean" };
  if (type.isUnion()) {
    const parts = type.types.filter((part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
    if (parts.length && parts.every((part) => part.flags & ts.TypeFlags.StringLiteral)) return { enum: parts.map((part) => part.value) };
    if (parts.length === 2 && parts.every((part) => part.flags & ts.TypeFlags.BooleanLiteral)) return { type: "boolean" };
    return parts.length === 1 ? schemaOf(parts[0], depth + 1) : { anyOf: parts.map((part) => schemaOf(part, depth + 1)) };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const [item] = checker.getTypeArguments(type);
    return { type: "array", items: item ? schemaOf(item, depth + 1) : {} };
  }
  if (type.flags & ts.TypeFlags.Object) {
    const properties = {};
    const required = [];
    for (const symbol of checker.getPropertiesOfType(type)) {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const propertyType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      properties[symbol.name] = schemaOf(propertyType, depth + 1);
      if (!(symbol.flags & ts.SymbolFlags.Optional)) required.push(symbol.name);
    }
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: index ? schemaOf(index.type, depth + 1) : false };
  }
  return {};
}

const blocks = {};
for (const file of registries) {
  const source = program.getSourceFile(file);
  ts.forEachChild(source, function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let init = node.initializer;
      while (ts.isSatisfiesExpression(init) || ts.isAsExpression(init)) init = init.expression;
      if (ts.isObjectLiteralExpression(init)) {
        for (const property of init.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = property.name.getText(source).replace(/^["']|["']$/g, "");
          const blockType = checker.getTypeAtLocation(property.initializer);
          // BlockDef<P, D, C>: the props type is the parameter of `Component`'s props.props, read through `defaults?: Partial<P>`… simplest: the type of the `demo.props` field.
          const demo = blockType.getProperty("demo");
          const demoType = demo && checker.getTypeOfSymbolAtLocation(demo, property);
          const propsSymbol = demoType?.getProperty("props");
          const propsType = propsSymbol && checker.getTypeOfSymbolAtLocation(propsSymbol, property);
          const container = blockType.getProperty("container");
          const containerType = container && checker.getTypeOfSymbolAtLocation(container, property);
          blocks[name] = { container: containerType ? checker.typeToString(containerType).includes("true") : false, props: propsType ? schemaOf(propsType) : { type: "object" } };
        }
      }
    }
    ts.forEachChild(node, visit);
  });
}

/** `definePage({ game, path: () => "/x", page: () => ({ id, blocks }) })` with a literal id and no route params. */
const literal = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null);
const prop = (object, name) => object.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === name)?.initializer;
function returnedObject(fn) {
  let body = fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ? fn.body : null;
  while (body && ts.isParenthesizedExpression(body)) body = body.expression;
  return body && ts.isObjectLiteralExpression(body) ? body : null;
}
const pages = [];
for (const file of pageFiles) {
  const source = program.getSourceFile(file);
  ts.forEachChild(source, function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "definePage" && ts.isObjectLiteralExpression(node.arguments[0])) {
      const def = node.arguments[0];
      const pathFn = prop(def, "path");
      const config = returnedObject(prop(def, "page"));
      const id = config && literal(prop(config, "id"));
      const pagePath = returnedObject(pathFn) ? null : literal(pathFn?.body);
      if (id && pagePath && pathFn.parameters.length === 0) {
        const types = new Set();
        (function collect(n) {
          if (ts.isPropertyAssignment(n) && n.name.getText(source) === "type" && literal(n.initializer)) types.add(literal(n.initializer));
          ts.forEachChild(n, collect);
        })(prop(config, "blocks"));
        for (const extra of CMS_EXTRA_BLOCKS[id] ?? []) types.add(extra);
        const unknown = [...types].filter((type) => !blocks[type]);
        if (unknown.length) throw new Error(`${id}: unknown block types ${unknown.join(", ")}`);
        pages.push({ id, game: literal(prop(def, "game")), path: pagePath, blocks: [...types].sort() });
      }
    }
    ts.forEachChild(node, visit);
  });
}
pages.sort((a, b) => a.id.localeCompare(b.id));

const out = `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", description: "Props of every web block (generated by scripts/generate-block-contracts.mjs from the block types — do not edit).", blocks: Object.fromEntries(Object.entries(blocks).sort()) }, null, 2)}\n`;
const cmsOut = `${JSON.stringify({ description: "Generated by apps/web/scripts/generate-block-contracts.mjs from the web block types and page definitions — do not edit; run npm run blocks:contracts.", blocks: Object.fromEntries(Object.entries(blocks).sort()), pages }, null, 2)}\n`;
const targets = [[path.join(root, "contracts/blocks.schema.json"), out], [path.resolve(root, "../../cms/src/blocks/contract.generated.json"), cmsOut]];
const summary = `${Object.keys(blocks).length} block contracts, ${pages.length} CMS pages`;
if (process.argv.includes("--check")) {
  const stale = targets.filter(([target, content]) => (fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "") !== content).map(([target]) => path.relative(path.resolve(root, "../.."), target));
  if (stale.length) { console.error(`blocks:contracts — ${stale.join(", ")} out of date; run npm run blocks:contracts`); process.exit(1); }
  console.log(`blocks:contracts — ${summary} up to date`);
} else {
  for (const [target, content] of targets) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  console.log(`blocks:contracts — ${summary} written`);
}
