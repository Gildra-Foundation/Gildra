import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { publications, publicationFor, isPublicationReady } from '../../lib/wow/publicationData.ts';
import { confirmedWeeklyBoss, type WeeklyWorldBossRecord } from '../../lib/wow/weeklyWorldBoss.ts';

test('release content covers all required guides and locale aliases share one publication decision',()=>{
 const guides=publications.filter(p=>p.required&&p.path.split('/').length>3);
 assert.equal(guides.filter(p=>p.path.includes('/mythic-plus/')).length,8);
 assert.equal(guides.filter(p=>p.path.startsWith('/wow/raids/venomous-abyss/')).length,8);
 assert.equal(guides.filter(p=>p.path.startsWith('/wow/lairs/')).length,5);
 for(const entry of guides){
  assert.ok(entry.ready && entry.sources.length && Number.isFinite(Date.parse(entry.verifiedAt!)),entry.path);
  assert.equal(publicationFor('/ru'+entry.path),entry);
 }
 assert.equal(isPublicationReady('/wow/raids/the-dreamrift'),false);
 assert.equal(isPublicationReady('/ru/wow/dungeons/murder-row'),isPublicationReady('/wow/mythic-plus/midnight-season-2/murder-row'));
 assert.ok(existsSync(new URL('../../../../docs/reports/mvp-release-20261019/content-review.md',import.meta.url)));
});

test('weekly highlight requires a unique unexpired confirmation for the chosen region',()=>{
 const record:WeeklyWorldBossRecord={region:'eu',slug:'luashal',season:'midnight-season-2',sourceUrl:'https://worldofwarcraft.blizzard.com/',verifiedAt:'2026-10-19T09:00:00Z',startsAt:'2026-10-18T00:00:00Z',expiresAt:'2026-10-21T07:00:00Z'};
 const now=Date.parse('2026-10-19T10:00:00Z');
 assert.equal(confirmedWeeklyBoss([record],'eu',now),record);
 assert.equal(confirmedWeeklyBoss([record],'us',now),null);
 assert.equal(confirmedWeeklyBoss([record],'eu',Date.parse(record.expiresAt)),null);
 assert.equal(confirmedWeeklyBoss([record,{...record,slug:'predaxas'}],'eu',now),null);
 assert.equal(confirmedWeeklyBoss([],'eu',now),null);
});
