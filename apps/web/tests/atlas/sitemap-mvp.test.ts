import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../../app/sitemap.xml/route.ts';

test('the MVP sitemap index does not advertise the hidden League catalog',async()=>{
 const response=await GET(), xml=await response.text();
 assert.equal(response.status,200);
 assert.ok(xml.includes('/sitemaps/static'));
 assert.ok(!xml.includes('/sitemaps/league-of-legends'));
});
