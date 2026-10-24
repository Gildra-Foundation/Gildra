import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchArticlePreview } from '../../lib/cms/preview.ts';
import { exclusionScript, isTrackedPage } from '../../lib/cms/tracking.ts';

test('preview is private and bound to the configured site, including older CMS responses', async () => {
  const oldUrl = process.env.CMS_INTERNAL_URL, oldSite = process.env.CMS_SITE_SLUG;
  const originalFetch = globalThis.fetch;
  process.env.CMS_INTERNAL_URL = 'https://cms.example.test'; process.env.CMS_SITE_SLUG = 'gildra';
  try {
    for (const site of ['gildra', 'riftden', undefined]) {
      globalThis.fetch = async (input, init) => {
        assert.equal(new URL(String(input)).searchParams.get('site'), 'gildra');
        assert.equal(init?.cache, 'no-store');
        return Response.json({collection: 'guides', site: site ? {slug: site} : undefined, doc: {id: 3, title: 'Private draft'}});
      };
      const result = await fetchArticlePreview('test.signature', 'ru');
      assert.equal(result.status, site === 'gildra' ? 'ok' : 'not-found');
      if (site !== 'gildra') assert.ok(!('article' in result));
    }
    globalThis.fetch = async () => { throw new Error('network should not be used'); };
    assert.deepEqual(await fetchArticlePreview('malformed', 'en'), {status:'invalid'});
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.CMS_INTERNAL_URL; else process.env.CMS_INTERNAL_URL = oldUrl;
    if (oldSite === undefined) delete process.env.CMS_SITE_SLUG; else process.env.CMS_SITE_SLUG = oldSite;
  }
});

test('preview and staging visits never count as public pageviews', () => {
  for (const host of ['127.0.0.1','staging.gildra.net','gildra.net.evil.test','riftden.net']) assert.equal(isTrackedPage(host,'gildra.net','/ru/wow'),false);
  for (const prefix of ['', '/ru', '/en']) for (const preview of ['/preview','/cms-preview']) {
    assert.equal(isTrackedPage('gildra.net','gildra.net',prefix+preview),false);
    assert.equal(isTrackedPage('gildra.net','gildra.net',prefix+preview+'/draft'),false);
  }
  assert.equal(isTrackedPage('gildra.net','gildra.net','/ru/wow'),true);
  assert.equal(isTrackedPage('www.gildra.net','gildra.net','/preview-guide'),true);
  assert.equal(exclusionScript('https://gildra.net/stats/js/script.js'),'https://gildra.net/stats/js/script.exclusions.js');
  assert.equal(exclusionScript('https://gildra.net/stats/js/script.exclusions.js'),'https://gildra.net/stats/js/script.exclusions.js');
});
