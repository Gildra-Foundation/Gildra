# Public WoW Auction House

New routes: `/wow/auction` and `/ru/wow/auction`. The shared navigation has a
**Tools / Инструменты** realm with **Auction House / Аукцион**. The section
registry also exposes the page in site search. Existing character auction
optimization is independent and unchanged by this feature.

Browse retail EU/US/KR/TW without an account. Realm auctions resolve a selected
realm to its connected group; commodities use Blizzard's regional market.
The first page browses all listings, including bid-only auctions and pets.
Name searches use the selected locale in Blizzard Item Search, then filter
by the full typed phrase/substring (Blizzard itself matches words with OR); if more than
1,000 search results match, the UI explicitly asks for a narrower query. An item ID
search is exact. Pages contain 40 listings, sorted by unit buyout or quantity.
Bid-only lots sort after buyout lots. Each listing retains its auction ID,
bonus IDs, context, modifiers and pet species/level; variants are not merged.

A realm `buyout` is the entire lot's price. Its per-unit comparison divides
by quantity and marks fractional copper as approximate (rounded up). Commodity
`unit_price` stays a unit price; it is never displayed as a whole-lot buyout.
`bid` is the current bid reported by Blizzard, not a promise of the next bid.
Buying and bidding take place in the game. No purchase endpoint exists.

## Runtime

`GET /api/wow/auction?action=realms&region=eu&lang=ru` lists realms.
Without `action=realms`, query parameters are `region`, `lang`, `market`
(`realm`/`commodities`), `realm` (slug), `q`, `sort` (`price`/`quantity`), `page`.
Requests need existing server variables `BATTLENET_CLIENT_ID` and
`BATTLENET_CLIENT_SECRET`. Client-credentials authentication uses
`https://oauth.battle.net/token`; no user access token or profile is needed.
Never expose these variables or the resulting token in client bundles/logs.
The existing nginx `/api/wow/` proxy already forwards to Next.js.

References: [Blizzard Game Data APIs](https://develop.battle.net/documentation/world-of-warcraft/game-data-apis)
and [client credentials](https://develop.battle.net/documentation/guides/using-oauth/client-credentials-flow).
Endpoints: `/data/wow/realm/index`, `/data/wow/realm/{slug}`,
`/data/wow/connected-realm/{id}/auctions`, `/data/wow/auctions/commodities`,
`/data/wow/search/item`, `/data/wow/item/{id}`. These use the matching region's
`dynamic-*` or `static-*` namespace; all hosts/paths are constructed server-side.

Snapshots: five-minute process cache, four market entries (including pending),
two concurrent market downloads, 64 MiB maximum response each. Metadata/realm/
search/token requests share a 1,600-entry bounded cache and in-flight requests;
at most 12 cache loaders, errors cool down for ten seconds. Metadata uses four
workers with a six-second admission window and three-second requests; missing
names display item IDs without hiding listings. Market fetch timeout is 30s;
other API calls use 10s. Responses cache for 30s client/60s shared. This is an
in-process bound; replicas have independent caches.

The source time comes only from a valid Blizzard Last-Modified header. Missing,
future or older-than-two-hour timestamps visibly warn the reader. Fetch time is
separate. Failed snapshots show a localized error, never invented statistics.
No database, schema change, import or persistent price history is introduced.

## Validation

Run `node apps/web/scripts/test-auction-browser.mjs` from the repository root
(the runner sets its own cwd), TypeScript, scoped ESLint, `atlas:check`,
`routes:check`, `test:atlas`, `valyro:check`, and a production build through the
shared heavy queue. Provider tests use a synthetic Blizzard boundary; they
verify application behavior and do not establish current live Blizzard access.
Browser checks should cover RU/EN desktop/mobile, keyboard menus, submitted URL,
paging, cancellation when market changes, loading, empty, stale, API and realm
errors, retries and reduced motion. Actual live-data access must also be checked
with the deployment environment's existing server credentials before publishing.

## Item icons and descriptions

The same bounded four-worker metadata pass loads localized item previews and
Blizzard icon media in parallel (3-second per-request timeout, 6-second page
budget). Metadata failures leave listings visible with a package placeholder.
Media is restricted to HTTPS render.worldofwarcraft.com; credentials stay on
the server. The existing 1600-entry cache also bounds item/media results.

Hover or keyboard focus on an item shows its Blizzard level, binding, slot,
requirements, armor, localized stats, weapon parameters, effects and description
when provided. Click/tap opens the full details in the existing Valyro-based
AtlasDialog with focus management, Escape and a link to Wowhead retaining bonuses.
The Valyro AtlasTooltip respects reduced motion.

Exact combat properties are loaded lazily for the actual lot as described below.
Caged pets show the auction species/level; cage item stats are not substituted.

## Exact lot tooltips and WoW money/frame assets

Combat previews are no longer displayed as auction-lot properties. On first
hover, keyboard focus or tap, `action=tooltip` accepts only the auction ID and
market identity. It retrieves the actual listing from the Blizzard snapshot;
client-supplied item levels, stats, bonuses and modifiers are never accepted.

Bonus-only items without context/scaling/crafting inputs use Wowhead's documented
bonus tooltip contract without inventing a player or item level. Other variants
use the existing native item resolver with the complete context/bonus/modifier
identity. The resolved item level and crafted stats select the corresponding
Wowhead tooltip; native level, requirements, stat values and weapon damage/speed
are checked before that tooltip's text is displayed. If Wowhead is unavailable,
verified native combat facts remain usable. Unknown bonuses, unsupported modifiers,
missing weapon metadata and heirlooms requiring a viewer level fail visibly;
base combat stats are never used as a fallback. No DPS simulation job or account
write is submitted: the existing metadata resolver runs its bounded item probe.

Tooltip work is lazy, shared by full variant identity for15minutes, limited to
two active requests per process, and remains under the existing bounded cache.
Native resolution is capped at8seconds and Wowhead at4seconds/256KB. Browser
requests share promises in an80-entry cache. Foreign HTML is converted to text;
no external script or HTML is mounted. NPC sell prices are removed; prices in
the tooltip are the actual listing's quantity, unit, whole-lot buyout and bid.

Money uses local original WoW gold/silver/copper icons with accessible text.
Item slots and lot outlines use original WoW UI textures; source attribution is
in public/assets/wow/ui-textures/auction/SOURCE.md. Rarity colours apply to item
names and icon borders. Existing AtlasTooltip/AtlasDialog retain Escape,
keyboard focus management, mobile scrolling and reduced motion behavior.
