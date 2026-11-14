// Deliberately synthetic single-permit worker; no inference about native DPS throughput.
import { createAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const rows = [];
for (const warm of [false, true]) for (const concurrency of [1, 2]) for (let repeat = 0; repeat < 5; repeat++) {
  let tail = Promise.resolve(), cursor = 0;
  const diagnostic = createAuctionGearDiagnostics();
  diagnostic.candidates(8);
  // A competing client owns the shared permit before auction requests arrive.
  tail = pause(20);
  const cache = new Set(warm ? [0, 1, 2, 3] : []);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < 8) {
      const key = cursor++;
      diagnostic.step();
      if (cache.has(key)) { diagnostic.cacheHit(); diagnostic.comparison(); continue; }
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await diagnostic.measure('queue', () => previous);
      diagnostic.simulation();
      try { await diagnostic.measure('compute', () => pause(10)); diagnostic.comparison(); }
      finally { release(); }
    }
  }));
  await tail;
  rows.push({ warm, concurrency, repeat, ...diagnostic.snapshot() });
}
const summary = [];
for (const warm of [false, true]) for (const concurrency of [1, 2]) {
  const values = rows.filter(r => r.warm === warm && r.concurrency === concurrency).map(r => r.totalMs).sort((a,b)=>a-b);
  summary.push({warm,concurrency,medianMs:values[2],rangeMs:[values[0],values[4]]});
}
console.log(JSON.stringify({scope:'Serialized timer stub, 20ms competitor + eight identical 10ms tasks; warm caches four. Native precision unmeasured. Default remains one.',summary,rows},null,2));
