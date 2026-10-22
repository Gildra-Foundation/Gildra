// Self-contained local stand for the browser scripts that used to need an
// external QA directory: scratch payload_*test* database, fixture, production
// CMS server on a local port and, when asked, stub frontends for both sites.
// Requires `npm run build` first and PAYLOAD_DATABASE_URL on a local test DB.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const CMS = path.resolve(import.meta.dirname, '../..');
export const PASSWORD = 'local-test-password-1';
const SECRET = 'local-publish-isolated-fixture-only';
const REVALIDATE_SECRETS = { gildra: 'stand-revalidate-gildra', riftden: 'stand-revalidate-riftden' };

const freePort = () => new Promise((resolve) => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: CMS, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  child.on('exit', (code) => code === 0 ? resolve(log) : reject(new Error(log.slice(-2000))));
});
const poll = async (condition) => {
  for (let n = 0; n < 200; n++) { if (await condition()) return; await new Promise((resolve) => setTimeout(resolve, 150)); }
  throw new Error('Timed out waiting for the stand');
};

/**
 * Minimal stand-in for the two public sites. It renders what the CMS public
 * API returns (no cache), verifies the signed revalidation webhook and serves
 * the draft-preview route, so the CMS publishing contract is exercised end to
 * end without the real web apps.
 */
function stubSite(site, cmsOrigin) {
  const ruPrefix = site === 'gildra';
  const base = site === 'gildra' ? '/wow/articles' : '/articles';
  const html = (body) => `<!doctype html><html><body>${body}</body></html>`;
  const send = (res, status, body, type = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': type }); res.end(body); };
  const cms = async (url) => { const r = await fetch(cmsOrigin + url); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const localeOf = (pathname) => ruPrefix ? (pathname.startsWith('/ru/') || pathname === '/ru' ? 'ru' : 'en') : (pathname.startsWith('/en/') || pathname === '/en' ? 'en' : 'ru');
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://stub');
      const raw = [];
      for await (const chunk of req) raw.push(chunk);
      if (req.method === 'POST' && url.pathname === '/api/cms/revalidate') {
        const body = Buffer.concat(raw).toString();
        const expected = createHmac('sha256', REVALIDATE_SECRETS[site]).update(`${req.headers['x-gildra-timestamp']}.${body}`).digest('hex');
        const given = String(req.headers['x-gildra-signature'] ?? '').replace(/^sha256=/, '');
        const valid = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
        return send(res, valid ? 200 : 401, '{}', 'application/json');
      }
      const pathname = url.pathname;
      const locale = localeOf(pathname);
      const unprefixed = pathname.replace(/^\/(ru|en)(?=\/|$)/, '');
      if (unprefixed === (site === 'gildra' ? '/cms-preview' : '/preview')) {
        const r = await cms(`/api/preview-content?token=${encodeURIComponent(url.searchParams.get('token') ?? '')}&locale=${locale}`);
        return send(res, r.status, html(r.status === 200 ? `<h1>${r.body.doc.title}</h1>` : ''));
      }
      if (unprefixed === (site === 'gildra' ? '/wow/articles/sitemap.xml' : '/sitemap.xml')) {
        const urls = [];
        for (const loc of ['en', 'ru']) {
          const r = await cms(`/api/public/${site}/articles?locale=${loc}&limit=50`);
          for (const doc of r.body.docs ?? []) urls.push(`<url><loc>${req.headers.host}${base}/${doc.slug}</loc></url>`);
        }
        return send(res, 200, `<urlset>${urls.join('')}</urlset>`, 'application/xml');
      }
      if (unprefixed === base) {
        const r = await cms(`/api/public/${site}/articles?locale=${locale}&limit=50`);
        return send(res, r.status, html((r.body.docs ?? []).map((doc) => `<a href="${base}/${doc.slug}">${doc.title}</a>`).join('')));
      }
      if (unprefixed.startsWith(base + '/')) {
        const r = await cms(`/api/public/${site}/articles/${encodeURIComponent(unprefixed.slice(base.length + 1))}?locale=${locale}`);
        return send(res, r.status === 200 ? 200 : 404, html(r.status === 200 ? `<h1>${r.body.title}</h1>` : 'not found'));
      }
      return send(res, 404, html('not found'));
    } catch (error) {
      return send(res, 500, String(error));
    }
  });
}

/** `fixture`: file under tests/browser; `name`: scratch database suffix. */
export async function startStand({ name, fixture }) {
  const base = new URL(process.env.PAYLOAD_DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(base.hostname) || !/^\/payload_[a-z0-9_]*test[a-z0-9_]*$/.test(base.pathname)) {
    throw new Error('Refusing: a local payload_*test* database is required.');
  }
  const dbUrl = new URL(base);
  dbUrl.pathname = `${base.pathname}__${name}`;
  const out = await mkdtemp(path.join(os.tmpdir(), `gildra-cms-${name}-`));
  const [cmsPort, gildraPort, riftdenPort] = await Promise.all([freePort(), freePort(), freePort()]);
  // Browsers treat `localhost` cookies marked Secure as valid; 127.0.0.1 redirects lose the session.
  const cmsOrigin = `http://localhost:${cmsPort}`;
  const qa = { origins: { cms: cmsOrigin, gildra: `http://127.0.0.1:${gildraPort}`, riftden: `http://127.0.0.1:${riftdenPort}` }, browser_origin: cmsOrigin };
  await writeFile(path.join(out, 'qa.json'), JSON.stringify(qa));
  const env = { ...process.env, CMS_QA_DIR: out, PAYLOAD_SECRET: SECRET };
  await run([path.join(CMS, 'node_modules/payload/bin.js'), 'run', `tests/browser/${fixture}`], { ...env, NODE_ENV: 'test' });
  const stubs = [['gildra', gildraPort], ['riftden', riftdenPort]].map(([site, port]) => {
    const server = stubSite(site, cmsOrigin);
    server.listen(port, '127.0.0.1');
    return server;
  });
  const server = spawn(process.execPath, [path.join(CMS, 'node_modules/next/dist/bin/next'), 'start', '-p', String(cmsPort), '-H', '127.0.0.1'], {
    cwd: CMS,
    env: { ...env, PAYLOAD_DATABASE_URL: dbUrl.toString(), PAYLOAD_PUBLIC_URL: cmsOrigin, NODE_ENV: 'production', EMAIL_TRANSPORT: 'disabled', CMS_JOBS_AUTORUN: 'false',
      CMS_REVALIDATE_SECRET_GILDRA: REVALIDATE_SECRETS.gildra, CMS_REVALIDATE_SECRET_RIFTDEN: REVALIDATE_SECRETS.riftden },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (data) => { log += data; });
  server.stderr.on('data', (data) => { log += data; });
  await poll(async () => { try { return (await fetch(`${cmsOrigin}/admin/login`)).ok; } catch { return false; } });
  const stand = {
    out, qa, log: () => log,
    fixture: JSON.parse(await readFile(path.join(out, 'fixture.json'), 'utf8')),
    async stop() {
      server.kill('SIGTERM');
      for (const stub of stubs) stub.close();
      await rm(out, { recursive: true, force: true });
    },
  };
  return stand;
}

/** Chromium launch options shared by the scripts. */
export const launchOptions = () => ({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
export async function loadChromium() { return (await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core')).chromium; }
