#!/usr/bin/env node
/** Public-site derivative; the complete vendored Valyro sources stay byte-for-byte intact. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Resolve from declared workspace dependencies, not incidental root hoisting.
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireNext = createRequire(requireWeb.resolve("next/package.json"));
const postcss = requireNext("postcss");
const ts = requireWeb("typescript");

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultSource = path.join(project, "packages/atlas-ui/src");
const tokenPattern = /--ui-[A-Za-z0-9_-]+/g;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function sourceAST(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}
function localImport(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
}

/** Follow actual static imports/re-exports, including CSS imports and primitive barrels. */
export function publicInputs(source = defaultSource) {
  const vendor = path.join(source, "valyro-ui");
  const theme = path.join(vendor, "styles/themes/vercel.css");
  const output = path.join(source, "valyro-public-theme.css");
  const queue = walk(source).filter(file => !file.startsWith(vendor + path.sep) && file !== output && /\.(tsx?|css)$/.test(file));
  const visited = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file) || file === theme || file === output) continue;
    visited.add(file);
    if (file.endsWith(".css")) {
      postcss.parse(fs.readFileSync(file, "utf8")).walkAtRules("import", rule => {
        const specifier = rule.params.match(/^(?:url\()?['"]([^'"]+)['"]/u)?.[1];
        if (specifier) { const child = localImport(file, specifier.startsWith(".") ? specifier : `./${specifier}`); if (child) queue.push(child); }
      });
      continue;
    }
    const visit = node => {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText() === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      if (specifier) { const child = localImport(file, specifier); if (child) queue.push(child); }
      ts.forEachChild(node, visit);
    };
    visit(sourceAST(file));
  }
  return { files: [...visited].sort(), theme, output, vendor };
}

export function generatePublicTheme(source = defaultSource) {
  const inputs = publicInputs(source);
  const original = fs.readFileSync(inputs.theme, "utf8");
  const tree = postcss.parse(original, { from: inputs.theme });
  const needed = new Set();
  const dynamicPrefixes = new Set();
  const scan = value => { for (const match of value.matchAll(tokenPattern)) needed.add(match[0]); };
  for (const file of inputs.files.filter(file => file.endsWith(".css"))) scan(fs.readFileSync(file, "utf8"));
  // Conservatively include every vendor TS token, even if tree-shaking removes its module.
  // AST string/template scanning ignores comments and expands computed token prefixes.
  const codeFiles = new Set([...inputs.files.filter(file => /\.tsx?$/.test(file)), ...walk(inputs.vendor).filter(file => /\.tsx?$/.test(file))]);
  for (const file of codeFiles) {
    const visit = node => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        scan(node.text);
        if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
          const prefix = node.text.match(/(--ui-[A-Za-z0-9_-]*)$/u)?.[1];
          if (prefix) dynamicPrefixes.add(prefix);
        }
      }
      // Concatenation is equivalent to a template head for computed token names.
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isStringLiteralLike(node.left)) {
        const prefix = node.left.text.match(/(--ui-[A-Za-z0-9_-]*)$/u)?.[1];
        if (prefix) dynamicPrefixes.add(prefix);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceAST(file));
  }
  tree.walkDecls(decl => { if ([...dynamicPrefixes].some(prefix => decl.prop.startsWith(prefix))) needed.add(decl.prop); });
  let before;
  do {
    before = needed.size;
    tree.walkDecls(decl => { if (needed.has(decl.prop)) scan(decl.value); });
  } while (needed.size !== before);
  tree.walkComments(comment => comment.remove());
  tree.walkDecls(decl => { if (decl.prop.startsWith("--ui-") && !needed.has(decl.prop)) decl.remove(); });
  // Drop empty rules/media containers, preserving all surviving cascade contexts and order.
  tree.walk(node => { if (node.nodes && node.nodes.length === 0) node.remove(); });
  const hash = createHash("sha256").update(original).digest("hex");
  const css = `/* Generated by scripts/generate-public-valyro-theme.mjs; do not edit.\n * Source: valyro-ui/styles/themes/vercel.css (SHA-256 ${hash}).\n * Preserves original selectors, media conditions, token values and cascade order. */\n${tree.toString().trim()}\n`;
  return { ...inputs, css, needed, sourceHash: hash, sourceBytes: Buffer.byteLength(original) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = generatePublicTheme();
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(result.output) || fs.readFileSync(result.output, "utf8") !== result.css) {
      console.error("Public Valyro theme is stale. Run node scripts/generate-public-valyro-theme.mjs");
      process.exitCode = 1;
    }
  } else fs.writeFileSync(result.output, result.css);
  console.log(`Valyro public theme: ${result.sourceBytes} → ${Buffer.byteLength(result.css)} bytes; ${result.needed.size} referenced tokens; ${result.files.filter(file => file.endsWith(".css")).length} discovered stylesheets.`);
}
