// Private desktop input contract, with fixture credentials and no upstream traffic.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const state = globalThis.desktopTest = { token: undefined, marketCalls: 0 };
const substitutes = {
  '@/auth': 'export async function auth(){return {battleNetAccessToken:globalThis.desktopTest.token}}',
  '@/lib/wow/battleNetCharacters': `export const isBattleNetRegion = value => ['eu','us','kr','tw'].includes(value);
    export async function getBattleNetCharacterBySlug(token, lang, slug){return slug === 'owned' ? {region:'eu',name:'Test',realm:{slug:'test'}} : null}`,
  '@/lib/wow/battleNetCharacterDetails': 'export const getBattleNetSimulationSnapshot = async () => ({activeSpecializationId:72})',
  '@/lib/wow/auctionMarketProvider': "export async function getCharacterAuctionMarket(){globalThis.desktopTest.marketCalls++;return {id:'market-id',offers:[]}}",
  '@/lib/wow/auctionBrowserData': "export async function exactCommodityPrices(region, ids){return {ids,region}}"
};
const hooks = registerHooks({resolve(specifier, context, next) {
  if (!substitutes[specifier]) return next(specifier, context);
  return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(substitutes[specifier])};
}});
const { GET } = await import('../app/api/wow/gear-desktop-data/route.ts');
const go = (query, headers) => GET(new Request('https://wowarcana.com/api/wow/gear-desktop-data?' + query, {headers}));
try {
  assert.equal((await go('read=session')).status,401);
  state.token = 'fixture-a';
  const handshake = await go('read=session');
  assert.match(handshake.headers.get('cache-control'), /private, no-store/);
  const session = await handshake.json();
  assert.deepEqual(Object.keys(session).sort(),['owner','protocol']);
  assert.match(session.owner,/^[a-f0-9]{64}$/);
  assert.equal((await go('read=session',{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await go('read=snapshot&slug=other')).status,404);
  assert.equal((await go('read=market&slug=other')).status,404);
  assert.equal(state.marketCalls,0);
  assert.deepEqual(await (await go('read=snapshot&slug=owned')).json(),{activeSpecializationId:72});
  assert.deepEqual(await (await go('read=market&slug=owned&known=market-id')).json(),{unchanged:'market-id'});
  assert.deepEqual(await (await go('read=prices&region=eu&ids=1,2')).json(),{region:'eu',ids:[1,2]});
  assert.equal((await go('read=prices&region=eu&ids=invalid')).status,400);
  assert.equal((await go('read=item&region=eu&id=1&locale=invalid')).status,400);
  assert.equal((await go('read=icon&region=invalid&id=1')).status,400);
  state.token = 'fixture-b';
  assert.equal((await go('read=snapshot&slug=owned&owner='+session.owner)).status,401);
  console.log('Desktop input contract passed.');
} finally { hooks.deregister(); }
