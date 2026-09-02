# League of Legends static catalog

Gildra publishes a patch-versioned, read-only League of Legends database at:

- Web panel: `https://api.gildra.net/league-of-legends`
- API index: `https://api.gildra.net/league-of-legends/v1`
- OpenAPI contract: `backend/api/league-of-legends-openapi.yaml`

This catalog deliberately excludes match statistics and recommended builds.
It is the static-data foundation those features can join to later by Riot
champion, item, rune and spell identifiers.

## Coverage

The importer reads official Riot Data Dragon endpoints and the matching
patch branch of CommunityDragon's extracted League client data. Every release
contains English and Russian records for:

- champions, lore, tips, tags, info and base stats;
- passive and active abilities, formulas and icons;
- skins and chroma records with splash, loading and tile artwork;
- items, rune paths/runes, stat shards, summoner spells, maps and profile icons;
- complete source JSON alongside indexed columns, so new Riot fields are not
  discarded before the schema is updated.

Media is downloaded over HTTPS from `ddragon.leagueoflegends.com`, decoded as
an image, limited to 24 MiB, content-addressed by SHA-256 and served locally
with immutable caching. Legacy skin JSON occasionally references artwork Riot
no longer serves; those files receive a documented same-champion base-art
fallback while the original record remains unchanged.

Stat-shard names, descriptions and active client identifiers come from the
localized `perks.json` client dataset published by CommunityDragon. Their
images are still fetched from `ddragon.leagueoflegends.com`. The precise
CommunityDragon source URLs are recorded in each release manifest alongside
the Data Dragon URLs.

## Import a release

First preview and validate the current upstream dataset without database or
filesystem writes:

```bash
cd backend
go run ./cmd/lol-import -version latest -workers 16
```

Publish only after the preview is plausible and PostgreSQL migrations are up:

```bash
cd backend
DATABASE_URL='postgres://...' CATALOG_MEDIA_DIRECTORY='/var/lib/gildra/catalog-media' \
  go run ./cmd/lol-import -version latest -workers 16 -confirm
```

The Compose operations profile exposes the same command as `lol-import`. Add
`-confirm` only for an intentional publication. Pin `LOL_DDRAGON_VERSION` for
reproducible releases; `latest` is appropriate for a scheduled refresh job.

Publication uses a serializable transaction and an advisory lock. The new
release is staged, inserted, checked for entity/localization/media coverage,
and only then made active. Existing API readers continue to use the previous
published release until the final commit.

## Data model

`lol_catalog_releases` owns all patch-scoped rows. Typed champion tables make
the primary web flow fast, while `lol_static_entries` and localized source
payloads preserve the full non-champion dataset. `lol_media_assets` is shared
across releases by content hash, so unchanged images are not duplicated.

The active release is exposed through `lol_current_release`. Never query the
latest created row directly: a staging or failed import must remain invisible.

## Verification

```bash
cd backend
go test ./api ./internal/league ./internal/leagueimport ./cmd/lol-import ./cmd/server
go run ./cmd/lol-import -version latest -workers 16
```

After publication, verify `/status`, both locales, a champion detail and a
media URL. The production web build is checked with `npm run typecheck` and
`npm run build`.

## Riot attribution

League of Legends and Riot Games are trademarks of Riot Games, Inc. Gildra is
not endorsed by Riot Games and does not reflect the views or opinions of Riot
Games or anyone officially involved in producing or managing Riot Games
properties. Review Riot's current developer policies and Data Dragon guidance
before public deployment:

- <https://developer.riotgames.com/docs/lol#data-dragon>
- <https://developer.riotgames.com/policies/general>
- <https://www.communitydragon.org/>
