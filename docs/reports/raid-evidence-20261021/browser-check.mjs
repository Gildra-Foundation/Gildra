import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('docs/reports/raid-evidence-20261021/browser');
await fs.mkdir(out, { recursive: true });
const reviews = JSON.parse(await fs.readFile('apps/web/data/wow/raid-reviews/published-reviews.json', 'utf8'));
const routes = ['/wow/raids', ...reviews.flatMap(r => [`/wow/raids/${r.raidSlug}`, ...r.bosses.map(b => `/wow/raids/${r.raidSlug}/${b.slug}`)])];
const browser = await chromium.launch({ headless: true, executablePath: '/home/debian/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const results = [];
const baseUrl = process.env.RAID_REVIEW_BASE_URL ?? "http://127.0.0.1:3312";
try {
 for (const width of [390, 1440]) for (const locale of ['ru', 'en']) {
  const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  for (const route of routes) {
   const url = `${baseUrl}${locale === 'ru' ? '/ru' : ''}${route}`;
   const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
   await page.evaluate(() => document.fonts.ready);
   if (await page.locator('#spell-reference summary').count()) { await page.locator('#spell-reference summary').focus(); await page.keyboard.press('Enter'); }
   await page.evaluate(async () => {
    const imgs=[...document.images]; for(const img of imgs) img.loading='eager';
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000)})));
   });
   const state=await page.evaluate(()=>({ overflow:document.documentElement.scrollWidth>innerWidth, broken:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')), notes:document.querySelectorAll('[data-testid="raid-reviewed-notes"]').length, icons:document.querySelectorAll('#spell-reference img').length, glyphs:document.querySelectorAll('[data-testid="voidspire-action-card"] .mechanicGlyph').length, title:document.querySelector('h1')?.textContent }));
   const expectedNotes=route==='/wow/raids'?0:1;
   const issues=[...(response?.status()===200?[]:[`HTTP ${response?.status()}`]), ...(state.overflow?['overflow']:[]), ...state.broken.map(x=>`broken:${x}`), ...(state.notes===expectedNotes?[]:[`notes:${state.notes}/${expectedNotes}`]), ...errors.splice(0)];
   results.push({ route,locale,width,...state,issues });
   if (['/wow/raids','/wow/raids/the-voidspire/imperator-averzian','/wow/raids/the-dreamrift/chimaerus','/wow/raids/sporefall/rotmire','/wow/raids/march-on-queldanas/midnight-falls','/wow/raids/venomous-abyss/the-coiled-altar'].includes(route)) await page.screenshot({path:path.join(out,`${locale}-${width}-${route.split('/').at(-1)}.png`),fullPage:true});
   process.stdout.write(`${issues.length?'FAIL':'PASS'} ${locale} ${width} ${route}${issues.length?' '+JSON.stringify(issues):''}\n`);
  }
  await page.close();
 }
} finally { await browser.close(); await fs.writeFile(path.join(out,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),results},null,2)); }
if(results.some(x=>x.issues.length))process.exitCode=1;
