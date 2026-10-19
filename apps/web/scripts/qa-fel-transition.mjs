import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:58190';
const baseline = process.argv.includes('--baseline');
const workerOnly = process.argv.includes('--worker');
const pixelsOnly = process.argv.includes('--pixels');
const out = path.resolve(import.meta.dirname, '../.artifacts/fel', baseline ? 'baseline' : 'candidate');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--site-per-process'] });
const results = [];
async function pixelChecks() {
  const rows = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route('**/__qa-fel-pixels', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#bd376b">QA NEXT PAGE</body></html>' }));
    await context.route('**/fel-renderer-v1.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
const qaDraw = draw, qaTargets = [.15,.5,.85,1];
draw = function(message) {
  qaDraw(message);
  if(message.phase!=='shattering'||!qaTargets.length||message.progress<qaTargets[0])return;
  const target=qaTargets.shift(), pixels=state.context.getImageData(0,0,state.canvas.width,state.canvas.height).data;
  let clear=0,source=0;
  for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)clear++;if(pixels[i]===35&&pixels[i+1]===75&&pixels[i+2]===103&&pixels[i+3]===255)source++;}
  postMessage({type:'qa-pixels',target,progress:message.progress,clear:clear/(pixels.length/4),source:source/(pixels.length/4)});
};` });
    });
    const page = await context.newPage();
    await page.goto(base + '/__qa-fel-pixels');
    await page.evaluate(() => {
      window.__samples = []; window.__done = false;
      const canvas = document.createElement('canvas'), scale = Math.min(1, 1024 / Math.max(innerWidth, innerHeight));
      canvas.width = Math.ceil(innerWidth * scale); canvas.height = Math.ceil(innerHeight * scale); document.body.append(canvas);
      const source = new OffscreenCanvas(canvas.width, canvas.height), ctx = source.getContext('2d'); ctx.fillStyle = '#234b67'; ctx.fillRect(0, 0, source.width, source.height);
      const bitmap = source.transferToImageBitmap(), surface = canvas.transferControlToOffscreen(), worker = window.__worker = new Worker('/assets/motion/fel-renderer-v1.js');
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { worker.postMessage({ type: 'content', id: 1, bitmap }, [bitmap]); worker.postMessage({ type: 'play', id: 1, token: 1, phases: [{ phase: 'shattering', duration: 1080 }] }); }
        if (data.type === 'qa-pixels') window.__samples.push(data);
        if (data.type === 'complete') window.__done = true;
      };
      worker.postMessage({ type: 'init', id: 1, width: innerWidth, height: innerHeight, canvas: surface }, [surface]);
    });
    await page.waitForFunction(() => window.__done, null, { timeout: 15000 });
    const samples = await page.evaluate(() => window.__samples);
    assert.equal(samples.length, 4);
    assert.ok(samples[0].clear > .05 && samples[0].clear < .4 && samples[0].source > .4);
    assert.ok(samples[1].clear > .4 && samples[1].clear < .75 && samples[1].source > .15);
    assert.ok(samples[2].clear > .85); assert.equal(samples[3].clear, 1);
    assert.ok(samples.every((s, i) => !i || s.clear >= samples[i - 1].clear));
    rows.push({ width, samples });
    await page.evaluate(() => { window.__worker.postMessage({ type: 'dispose', id: 1 }); window.__worker.terminate(); });
    await context.close();
  }
  fs.writeFileSync(path.join(out, 'pixels.json'), JSON.stringify({ passed: true, method: 'Separate pixel-only instrumentation, excluded from performance timing. Exact old bitmap colors retained while transparent holes expand; final canvas is clear.', rows }, null, 2));
}
async function controls() {
  const rows = [];
  for (const locale of ['ru', 'en']) {
    const prefix = locale === 'ru' ? '/ru' : '';
    const context = await browser.newContext({ viewport: { width: locale === 'ru' ? 320 : 768, height: 900 }, reducedMotion: 'no-preference' });
    await context.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('gildra-home-theme', 'illidan'); localStorage.setItem('gildra-consent', 'declined'); });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + prefix + '/login', { waitUntil: 'load' });
    await page.locator('[data-book-route-frame][data-route-ready]').waitFor(); await page.evaluate(() => document.fonts.ready);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/privacy?fel-hold=1*', async route => { await held; await route.continue(); });
    const navigate = href => page.evaluate(href => { const a = document.createElement('a'); a.href = href; document.body.append(a); a.click(); }, href);
    const idle = () => page.waitForFunction(() => !document.querySelector('[data-themed-transition][data-phase]'), null, { timeout: 15000 });
    await navigate(prefix + '/privacy?fel-hold=1');
    await page.waitForFunction(() => document.querySelector('[data-themed-transition]')?.dataset.phase === 'cracking');
    await page.waitForTimeout(700);
    assert.equal(await page.locator('[data-themed-transition]').getAttribute('data-phase'), 'cracking', 'do not burn away the old page before the destination is ready');
    assert.notEqual(await page.locator('[data-transition-snapshot]').evaluate(e => getComputedStyle(e).visibility), 'hidden');
    await page.keyboard.press('Escape'); await idle();
    assert.equal(await page.locator('[data-themed-transition] *').count(), 0);
    release(); await page.waitForURL(base + prefix + '/privacy?fel-hold=1'); await idle();
    await page.unroute('**/privacy?fel-hold=1*');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await navigate(prefix + '/login');
    await page.waitForURL(base + prefix + '/login'); await idle();
    assert.equal(await page.locator('[data-themed-transition] *').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await navigate(prefix + '/privacy');
    await page.waitForFunction(() => document.querySelector('[data-themed-transition][data-phase]'));
    await page.setViewportSize({ width: locale === 'ru' ? 390 : 1024, height: 900 }); await idle();
    await page.waitForURL(base + prefix + '/privacy');
    assert.deepEqual(errors, []); rows.push({ locale, passed: true, errors }); await context.close();
  }
  for (const failure of ['worker', 'worker-load', 'capture']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.addInitScript(failure => { if (window !== window.top) return; localStorage.setItem('gildra-home-theme', 'illidan'); localStorage.setItem('gildra-consent', 'declined'); if (failure === 'worker') window.Worker = undefined; }, failure);
    if (failure === 'capture') await context.route('**/assets/motion/page-raster-*', route => route.fulfill({ status: 503, body: 'QA unavailable' }));
    if (failure === 'worker-load') await context.route('**/fel-renderer-v1.js', async route => { await new Promise(resolve => setTimeout(resolve, 4000)); await route.fulfill({ status: 503, body: 'QA delayed' }).catch(() => {}); });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/privacy', { waitUntil: 'load' }); await page.locator('[data-book-route-frame][data-route-ready]').waitFor();
    await page.evaluate(() => { const a = document.createElement('a'); a.href = '/login'; document.body.append(a); a.click(); });
    await page.waitForURL(base + '/login'); await page.waitForFunction(() => !document.querySelector('[data-themed-transition][data-phase]'), null, { timeout: 15000 });
    assert.equal(await page.locator('[data-themed-transition] *').count(), 0); assert.deepEqual(errors, []);
    rows.push({ failure, passed: true, errors }); await context.close();
  }
  fs.writeFileSync(path.join(out, 'controls.json'), JSON.stringify({ passed: true, rows }, null, 2));
}
async function workerChecks() {
  const rows = [];
  const record = () => {
    const complete = rows.length === 6 && rows.every(r => r.during >= 5 && r.maxGap < 120 && !r.errors.length);
    const withinCost = [1440, 390].every(width => {
      const costs = rows.filter(r => r.width === width).map(r => r.drawP95).sort((a, b) => a - b);
      return costs.length === 3 && costs[1] <= 5;
    });
    fs.writeFileSync(path.join(out, 'worker-clock.json'), JSON.stringify({ base, passed: complete && withinCost, method: 'Actual worker with timestamps only; original phase durations. Parent CPU1/CPU4. 330ms busy parent; worker timestamps are not display FPS.', rows }, null, 2));
  };
  record();
  for (const width of [1440, 390]) for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route('**/__qa-fel-worker', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#bd376b"><h1>QA destination</h1></body></html>' }));
    await context.route('**/fel-renderer-v1.js', async route => {
      const response = await route.fetch();
      const instrumentation = `
const qaDraw = draw;
draw = function(message) { const before = performance.now(); qaDraw(message); postMessage({type:'qa-frame',phase:message.phase,progress:message.progress,epoch:performance.timeOrigin+performance.now(),cost:performance.now()-before}); };
const qaReceive = onmessage;
onmessage = event => { qaReceive(event); if(event.data.type==='dispose')postMessage({type:'qa-disposed',hasState:!!state,hasClock:!!clock}); };
`;
      await route.fulfill({ response, body: await response.text() + instrumentation });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: width === 390 ? 4 : 1 });
    await page.goto(base + '/__qa-fel-worker');
    await page.evaluate(async () => {
      window.__frames = []; window.__stall = null; window.__done = false; window.__disposed = null;
      const canvas = document.createElement('canvas'), scale = Math.min(1, 1024 / Math.max(innerWidth, innerHeight));
      canvas.width = Math.ceil(innerWidth * scale); canvas.height = Math.ceil(innerHeight * scale); document.body.append(canvas);
      const source = new OffscreenCanvas(canvas.width, canvas.height), ctx = source.getContext('2d');
      ctx.fillStyle = '#234b67'; ctx.fillRect(0, 0, source.width, source.height); ctx.fillStyle = '#ffe789'; ctx.font = '40px serif'; ctx.fillText('QA OLD PAGE', 30, 70);
      const bitmap = source.transferToImageBitmap(), surface = canvas.transferControlToOffscreen(), worker = window.__worker = new Worker('/assets/motion/fel-renderer-v1.js');
      worker.onmessage = ({ data }) => {
        if (data.type === 'qa-frame') {
          window.__frames.push(data);
          if (!window.__stall && data.phase === 'shattering' && data.progress >= .15) {
            const from = performance.timeOrigin + performance.now(), start = performance.now();
            while (performance.now() - start < 330) Math.sqrt(performance.now());
            window.__stall = { from, to: performance.timeOrigin + performance.now() };
          }
        }
        if (data.type === 'ready') {
          worker.postMessage({ type: 'content', id: 1, bitmap }, [bitmap]);
          worker.postMessage({ type: 'play', id: 1, token: 1, phases: [{ phase: 'freezing', duration: 300 }, { phase: 'cracking', duration: 220 }] });
        }
        if (data.type === 'complete' && data.token === 1) worker.postMessage({ type: 'play', id: 1, token: 2, phases: [{ phase: 'shattering', duration: 1080 }] });
        if (data.type === 'complete' && data.token === 2) { window.__done = true; worker.postMessage({ type: 'dispose', id: 1 }); }
        if (data.type === 'qa-disposed') window.__disposed = data;
        if (data.type === 'failed') window.__failure = data;
      };
      worker.postMessage({ type: 'init', id: 1, width: innerWidth, height: innerHeight, canvas: surface }, [surface]);
    });
    await page.waitForFunction(() => window.__disposed || window.__failure, null, { timeout: 15000 });
    const data = await page.evaluate(() => ({ frames: window.__frames, stall: window.__stall, disposed: window.__disposed, failure: window.__failure }));
    assert.ok(!data.failure && data.stall && data.disposed && !data.disposed.hasState && !data.disposed.hasClock);
    const during = data.frames.filter(f => f.epoch > data.stall.from + 20 && f.epoch < data.stall.to - 20);
    const gaps = data.frames.slice(1).map((f, i) => ({ from: data.frames[i].epoch, to: f.epoch, ms: f.epoch - data.frames[i].epoch })).filter(g => g.from < data.stall.to && g.to > data.stall.from);
    const costs = data.frames.filter(f => f.phase === 'shattering').map(f => f.cost).sort((a, b) => a - b);
    const row = { width, run, during: during.length, maxGap: Math.max(0, ...gaps.map(g => g.ms)), drawP95: costs[Math.floor(costs.length * .95)], errors, ...data };
    rows.push(row); record();
    assert.ok(row.during >= 5 && row.maxGap < 120, 'original autonomous-worker pacing budget');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, run, during: row.during, maxGap: row.maxGap, drawP95: row.drawP95 }));
    await page.evaluate(() => window.__worker.terminate()); await context.close();
  }
  for (const width of [1440, 390]) {
    const values = rows.filter(r => r.width === width).map(r => r.drawP95).sort((a, b) => a - b);
    assert.ok(values[1] <= 5, 'median worker draw p95 must stay within 5ms');
  }
  record();
}
try {
  if (!workerOnly && !pixelsOnly) for (const profile of [{ width: 1440, cpu: 1 }, { width: 390, cpu: 4 }]) {
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: 900 }, reducedMotion: 'no-preference' });
      await context.addInitScript(() => {
        if (window !== window.top) return;
        localStorage.setItem('gildra-home-theme', 'illidan');
        localStorage.setItem('gildra-consent', 'declined');
        localStorage.setItem('gildra-home-music', JSON.stringify({ enabled: false, confirmed: true, volume: 0 }));
        window.__felTasks = [];
        new PerformanceObserver(list => { window.__felTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))); }).observe({ type: 'longtask', buffered: true });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      await page.goto(base + '/ru/privacy', { waitUntil: 'load' });
      await page.locator('[data-book-route-frame][data-route-ready]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1600);
      const click = await page.evaluate(() => {
        const a = document.createElement('a'); a.href = '/ru/login'; document.body.append(a);
        const start = performance.now(); a.click();
        return { start, cost: performance.now() - start, nodes: document.querySelector('[data-transition-snapshot]')?.querySelectorAll('*').length };
      });
      await page.waitForURL(base + '/ru/login');
      await page.waitForFunction(() => !document.querySelector('[data-themed-transition][data-phase]'), null, { timeout: 15000 });
      const row = await page.evaluate(click => ({
        ...click, elapsed: performance.now() - click.start,
        tasks: window.__felTasks.filter(t => t.start >= click.start),
        idleNodes: document.querySelector('[data-themed-transition]')?.childElementCount,
        theme: document.documentElement.dataset.siteTheme,
      }), click);
      assert.equal(row.theme, 'illidan'); assert.equal(row.idleNodes, 0); assert.ok(row.nodes < 700); assert.deepEqual(errors, []);
      results.push({ profile, run, ...row, errors });
      console.log(JSON.stringify({ profile, run, clickMs: row.cost, elapsed: Math.round(row.elapsed), maxTaskMs: Math.max(0, ...row.tasks.map(t => t.duration)), nodes: row.nodes }));
      await context.close();
    }
  }
  if (workerOnly) await workerChecks();
  if (pixelsOnly) await pixelChecks();
  if (!baseline && !workerOnly && !pixelsOnly) await controls();
} finally {
  if (!workerOnly && !pixelsOnly) fs.writeFileSync(path.join(out, 'navigation.json'), JSON.stringify({ base, baseline, browser: browser.version(), method: 'Three contexts per profile; same public privacy to login journey, CPU1 desktop/CPU4 mobile. Lab tasks, not field INP or physical display FPS.', results, passed: results.length === 6 }, null, 2));
  await browser.close();
}
