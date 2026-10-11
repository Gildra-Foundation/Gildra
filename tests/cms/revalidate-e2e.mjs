#!/usr/bin/env node
// End-to-end cache behaviour against a production build (`npm run build` first):
// a stub CMS serves the public projection, `next start` serves Gildra, and signed
// webhooks hit /api/cms/revalidate. It checks what visitors actually receive:
//   - a brand-new CMS slug renders without a rebuild;
//   - edits without a webhook stay cached; a bad signature changes nothing;
//   - "change" (stale-while-revalidate) brings the new text within a few requests;
//   - "unpublish" expires immediately: the very next request is a 404, never stale;
//   - replayed and foreign-site webhooks are refused.
//   node tests/cms/revalidate-e2e.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SECRET = 'e2e-only-secret';
const SITE = 'gildra';
const PAGE = (slug) => `/wow/articles/${slug}`;

const state = { articles: new Map(), page: null, hits: 0 };
const lexical = (text) => ({ root: { type: 'root', children: [{ type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Section' }] }, { type: 'paragraph', children: [{ type: 'text', text }] }] } });
function article(slug, title) {
  return {
    id: slug, slug, title, summary: `${title} summary`, publishedAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
    legacyCategory: null, cover: null, author: { name: 'Editor' }, categories: [], tags: [],
    game: { patch: null, season: null, lastReviewedAt: null, wowClass: null, wowSpec: null, wowInstance: null, lolChampion: null, lolRole: null, lolMentionedChampions: [] },
    seo: { title: null, description: null, image: null, noIndex: false },
    content: lexical(`${title} body`), requestedLocale: 'en', resolvedLocale: 'en', availableLocales: ['en'],
  };
}

const cms = createServer((req, res) => {
  state.hits++;
  const url = new URL(req.url, 'http://cms');
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const detail = url.pathname.match(new RegExp(`^/api/public/${SITE}/articles/([a-z0-9-]+)$`));
  if (detail) return state.articles.has(detail[1]) ? send(200, state.articles.get(detail[1])) : send(404, { status: 'not-found' });
  if (url.pathname === `/api/public/${SITE}/page`) {
    return state.page && url.searchParams.get('slug') === state.page.slug ? send(200, state.page) : send(404, { status: 'not-found' });
  }
  if (url.pathname === `/api/public/${SITE}/articles`) {
    const docs = [...state.articles.values()].map(({ content: _c, ...rest }) => rest);
    return send(200, { docs, page: 1, limit: 24, totalDocs: docs.length, totalPages: 1 });
  }
  send(404, { status: 'not-found' });
});

/**
 * A removed article must not be served (no stale text). Where the app streams
 * (Gildra has a root loading.tsx), Next keeps HTTP 200 for a not-found page and
 * marks it noindex — documented in next/dist/docs …/loading.md "Status Codes".
 */
function assertGone(r, slug) {
  assert.doesNotMatch(r.html, new RegExp(`(Title|Second) v[12]`), `${slug} was served stale`);
  if (r.status === 404) return;
  assert.equal(r.status, 200);
  assert.match(r.html, /NEXT_HTTP_ERROR_FALLBACK;404/, `${slug}: no not-found marker`);
  assert.match(r.html, /<meta name="robots" content="noindex"\/?>/, `${slug}: streamed not-found without noindex`);
}

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sign(body, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'content-type': 'application/json', 'x-gildra-timestamp': String(ts), 'x-gildra-signature': `sha256=${createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}` } };
}

async function main() {
  const cmsPort = await listen(cms);
  // A free ephemeral port (never one of the fixed ports other local servers use).
  const port = await new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', CMS_INTERNAL_URL: `http://127.0.0.1:${cmsPort}`, CMS_SITE_SLUG: SITE, CMS_REVALIDATE_SECRET: SECRET, CMS_READERS_ENABLED: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  app.stdout.on('data', (d) => (log += d));
  app.stderr.on('data', (d) => (log += d));
  const results = [];
  const step = (name) => results.push(name) && console.log(`ok - ${name}`);
  try {
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${base}/wow/articles/sitemap.xml`)).status) break; } catch { await sleep(500); }
    }
    const page = async (slug) => { const r = await fetch(base + PAGE(slug)); return { status: r.status, html: await r.text() }; };
    const hook = (body, opts) => { const s = sign(body, opts); return fetch(`${base}/api/cms/revalidate`, { method: 'POST', headers: s.headers, body: s.raw }); };
    const ev = (action, slug, extra = {}) => ({ action, collection: 'guides', id: slug, previousSlug: null, site: SITE, slug, ...extra });

    // /privacy is static (○). In a build made without CMS_INTERNAL_URL it carries no CMS tags;
    // a published `pages` override still applies after its webhook (lib/cms/staticPaths.ts).
    const privacy = async () => (await (await fetch(`${base}/privacy`)).text()).includes('CMS privacy override');
    assert.equal(await privacy(), false);
    state.page = { slug: 'wow/privacy', title: 'Privacy', layout: 'default', blocks: [{ type: 'legal', props: { title: 'CMS privacy override', updated: 'today', sections: [{ heading: 'One', text: 'Two' }], backLabel: 'Back' } }] };
    assert.equal(await privacy(), false, 'static page changed without a webhook');
    assert.equal((await hook({ ...ev('change', 'wow/privacy'), collection: 'pages' })).status, 200);
    let applied = false;
    for (let i = 0; i < 6 && !applied; i++) { applied = await privacy(); if (!applied) await sleep(300); }
    assert.ok(applied, 'page override never applied after its webhook');
    step('a static block page picks up a CMS page override after its webhook (no rebuild)');

    state.articles.set('e2e-article', article('e2e-article', 'Title v1'));
    let r = await page('e2e-article');
    assert.equal(r.status, 200); assert.match(r.html, /Title v1/);
    step('a new CMS slug renders without a rebuild');

    state.articles.set('e2e-article', article('e2e-article', 'Title v2'));
    r = await page('e2e-article');
    assert.match(r.html, /Title v1/);
    step('edits without a webhook stay cached');

    assert.equal((await hook(ev('change', 'e2e-article'), { secret: 'wrong' })).status, 401);
    assert.equal((await hook(ev('change', 'e2e-article'), { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401);
    assert.equal((await hook({ ...ev('change', 'e2e-article'), site: 'riftden' })).status, 403);
    r = await page('e2e-article');
    assert.match(r.html, /Title v1/);
    step('unsigned, outdated and foreign-site webhooks change nothing');

    const change = sign(ev('change', 'e2e-article'));
    assert.equal((await fetch(`${base}/api/cms/revalidate`, { method: 'POST', headers: change.headers, body: change.raw })).status, 200);
    assert.equal((await fetch(`${base}/api/cms/revalidate`, { method: 'POST', headers: change.headers, body: change.raw })).status, 409);
    step('a replayed webhook is refused');
    const seen = [];
    for (let i = 0; i < 6 && !seen.includes('v2'); i++) {
      const html = (await page('e2e-article')).html;
      seen.push(/Title v2/.test(html) ? 'v2' : /Title v1/.test(html) ? 'v1' : '?');
      await sleep(300);
    }
    assert.ok(seen.includes('v2'), `never refreshed: ${seen.join(',')}`);
    step(`"change" refreshes with stale-while-revalidate (responses: ${seen.join(' → ')})`);

    state.articles.delete('e2e-article');
    assert.match((await page('e2e-article')).html, /Title v2/);
    step('control: without a webhook the removed article is still served from cache');
    assert.equal((await hook(ev('unpublish', 'e2e-article'))).status, 200);
    r = await page('e2e-article');
    assertGone(r, 'e2e-article');
    step(`"unpublish" expires immediately: the next request is not-found (HTTP ${r.status})`);

    state.articles.set('second', article('second', 'Second v1'));
    assert.equal((await page('second')).status, 200);
    state.articles.delete('second');
    assert.equal((await hook(ev('delete', 'second'))).status, 200);
    assertGone(await page('second'), 'second');
    step('"delete" expires immediately');
    console.log(`\n${results.length} checks passed (stub CMS requests: ${state.hits}).`);
  } catch (error) {
    console.error(log.split('\n').slice(-30).join('\n'));
    throw error;
  } finally {
    app.kill('SIGTERM');
    cms.close();
  }
}

await main();
