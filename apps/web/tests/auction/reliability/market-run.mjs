import { run } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const baseline = process.argv[2] ?? 'red';
if (!['red', 'green', 'presentation-red', 'presentation-green'].includes(baseline)) throw new Error('invalid_baseline');
const report = { phase: baseline, mode: 'Synthetic transport fixtures, current actual production modules, zero external/native requests', cases: [] };
const stream = run({ files: [new URL(baseline.startsWith('presentation-') ? 'market-presentation.test.mjs' : 'market.test.mjs', import.meta.url).pathname], concurrency: false, isolation: "none" });
for await (const event of stream) {
  if (!['test:pass', 'test:fail'].includes(event.type)) continue;
  const data = event.data;
  if (data.nesting !== 0 || !data.name.startsWith('market:')) continue;
  report.cases.push({ name: data.name, status: event.type === 'test:pass' ? 'passed' : 'failed',
    ...(data.details?.error ? { error: data.details.error.cause?.message ?? data.details.error.message } : {}) });
}
report.passed = report.cases.filter(result => result.status === 'passed').length;
report.failed = report.cases.filter(result => result.status === 'failed').length;
report.sourceHashes = {};
for (const name of ['auctionGearRunner.ts', 'auctionGearDiscovery.ts', 'auctionMarketProvider.ts', 'auctionItemReference.ts', 'auctionGearJobs.ts']) {
  report.sourceHashes[name] = createHash('sha256').update(await readFile(new URL('../../../lib/wow/' + name, import.meta.url))).digest('hex');
}
await writeFile(new URL('../../../../../.artifacts/auction-reliability-20261016/market-' + baseline + '.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.cases.length || (baseline.endsWith('green') && report.failed)) process.exitCode = 1;
