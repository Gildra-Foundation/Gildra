import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '../../web');
const standins = {
  'next/server': 'export const NextResponse = Response;',
  'next/headers': 'export const cookies = async () => new Map();',
  react: 'export const cache = fn => fn;',
  'server-only': '',
};
const result = await build({
  metafile: Boolean(process.argv[3]),
  entryPoints: [resolve(here, 'run.mjs')], outfile: process.argv[2], bundle: true, format: 'esm',
  platform: 'node', target: 'node22', tsconfig: resolve(web, 'tsconfig.json'),
  plugins: [{ name: 'desktop-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(?:next\/server|next\/headers|react|server-only)$/ }, a => ({ path: a.path, namespace: 'desktop' }));
    builder.onLoad({ filter: /.*/, namespace: 'desktop' }, a => ({ contents: standins[a.path] }));
    builder.onResolve({ filter: /^@\/auth$/ }, () => ({ path: resolve(here, 'bridge.mjs') }));
    builder.onResolve({ filter: /\/(?:battleNetCharacters|battleNetCharacterDetails|auctionMarketProvider|auctionBrowserData)$/ }, () => ({ path: resolve(here, 'inputs.mjs') }));
    builder.onResolve({ filter: /^@gildra\/game-data$/ }, () => ({ path: resolve(web, '../../packages/game-data/src/index.ts') }));
  }}],
});
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(Object.keys(result.metafile.inputs)));
