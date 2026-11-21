import { data, dataResponse } from './bridge.mjs';
import { characterSlug } from '../../web/lib/wow/characterSlug.ts';

export async function getBattleNetCharacterBySlug(_owner, lang, slug, signal, options) {
  const reply = await dataResponse({ read: 'character', slug, lang, fresh: options?.cache === 'no-store' ? '1' : '0' }, signal);
  if (reply.status === 404) return undefined;
  if (!reply.ok) throw new Error(reply.status === 401 ? 'session_expired' : 'character_unavailable');
  return reply.json();
}
export function getBattleNetSimulationSnapshot(_owner, character, signal) {
  return data({ read: 'snapshot', slug: characterSlug(character) }, signal);
}

const markets = new Map();
export async function getCharacterAuctionMarket(character, _owner, options = {}) {
  const slug = characterSlug(character);
  const key = `${character.region}:${character.realm.id}`;
  const previous = markets.get(key);
  const next = await data({ read: 'market', slug, fresh: options.refresh ? '1' : '0', known: previous?.id ?? '' }, options.signal);
  if (previous && next.unchanged === previous.id) return previous;
  if (!Array.isArray(next.offers) || !next.id) throw new Error('invalid_market_response');
  markets.set(key, next);
  if (markets.size > 4) markets.delete(markets.keys().next().value);
  return next;
}
export async function exactCommodityPrices(region, ids, options = {}) {
  const unique = [...new Set(ids)];
  if (unique.length <= 512) return data({ read: 'prices', region, ids: unique.join(',') }, options.signal);
  // Every price ladder in a certified loadout must describe the same market update.
  for (let attempt = 0; attempt < 2; attempt++) {
    let first, consistent = true;
    for (let i = 0; i < unique.length; i += 512) {
      const batch = await data({ read: 'prices', region, ids: unique.slice(i, i + 512).join(',') }, options.signal);
      if (!first) first = batch;
      else if (batch.sourceUpdatedAt === first.sourceUpdatedAt) Object.assign(first.prices, batch.prices);
      else { consistent = false; break; }
    }
    if (consistent) return first;
  }
  throw new Error('market_stale');
}
