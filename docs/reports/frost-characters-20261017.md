# Character-list transition and realistic ice v4 — 17 October 2026

Returning from the character list to home through the Gildra game selector
changed the dimensions and positions of the frozen list while the ice was still
covering it. `RouteTransitionGate` removed the atlas scope on home arrival, and
the outgoing copy inherited its typography and tokens from that live wrapper.

The single snapshot viewport now keeps the source workspace scope classes until
it is released. Its cards, text and spacing remain fixed when the destination
switches to home. No style serialization per element or extra page copies were
added.

## Reproduction and regression

The actual Auth.js route and `CharacterRoster` were exercised locally with an
isolated synthetic session and 70 clearly labelled fixtures. No real account
credentials or Blizzard requests were used. Navigation used the actual Gildra
selector link, on desktop/mobile at the top and after deep scrolling.

Before the fix, immediate snapshot geometry matched but changed after home
mounted. The four RU cases had 80/111/26/45 displaced visible elements, with
maximum changes of 760/676/1062.5/1186 px. Restoring the scope in a targeted browser
probe removed every change. The regression then passed with **0 px displacement**
in all eight RU/EN × 1440/390 px × top/deep-scroll combinations, locally and on
the final production image.

`qa-character-transitions.mjs` retains that real route/component seam. Fixture
sessions are restricted to 127.0.0.1 and require an explicit QA secret. On the
public site the same actual navigation is tested anonymously, including its
entry layout; all eight public cases passed with zero movement/errors. This
separates the authenticated fixture coverage from public anonymous verification.

## Ice refinement

The versioned `ice-renderer-v4.js` replaces the rectangular distribution of
fragments with 18 uneven cells around a pressure point. Shared jagged edges and
angled branching hairlines remain aligned with the fragments. Dendritic frost
has varied branch spacing and cloudy density. A broad cached reflection, dark
undersides and thin bright bevels give the sheet and fragments depth. Faces
rotate, fall and foreshorten as they separate.

The renderer retains one bounded canvas (longest edge 1024 px), one cached
material, one in-flight/coalesced worker frame and a finite animation loop.
Idle workers terminate after 60 seconds. The old immutable v3 asset remains
available. No raster is allocated per fragment and no PNG/base64 encoding occurs
on the navigation gesture.

## Performance diagnostics

The existing production-image harness recorded three independent contexts per
route/profile: 1440×900 CPU1 and 390×844 CPU4, with 4 Mbps down / 1 Mbps up and
80 ms latency. Results are lab diagnostics; real-user INP/CrUX and guaranteed
frame rates are outside this measurement. These measurements were taken before
other browser checks ran.

| Profile / outgoing route | Median click handler | Median long-task blocking | Peak transition elements |
| --- | ---: | ---: | ---: |
| desktop `/ru` | 32.2 ms | 678 ms | 328 |
| desktop `/ru/wow/raids` | 55.0 ms | 25 ms | 104 |
| mobile `/ru` | 105.9 ms | 259 ms | 308 |
| mobile `/ru/wow/raids` | 102.4 ms | 285 ms | 104 |

All 12 transitions had zero page errors, fewer than 700 effect elements and zero
toDataURL calls. The single-copy/canvas architecture from the preceding
[performance release](site-performance-20261017.md) is retained.

## Verification and publication

- Production build, TypeScript and 766 generated pages passed. Existing auction
  filesystem tracing warnings remain unchanged.
- Scoped ESLint, Atlas tokens and fracture coverage/shared-edge/timing tests passed.
- Worker growth, coalescing, fallback, blocked worker and idle termination checks passed.
- Local, final-image and public journeys passed all four themes, persistence,
  cross-tab synchronization, history, opt-outs, delayed routes, Escape, RU/EN,
  320–1440 px layouts, audio consent/cleanup and system/site reduced motion.
- Ice integration passed 390/1440/2560 px on the candidate and public site.
- Six public JS/CSS/worker/cover assets matched the image byte-for-byte.

Published on gildra.net on 17 October 2026:

- Fix source: `71d1e30b03fb5b10f16ccd5b8a42239ed3d84430`.
- Combined application source: `17c14116b5a656fc7b02f975dfd947fd7af2e880`.
- Preserved published auction source: `2950e8e49f5b85cb7678ee20af58ea7ab6fb5e19`
  and its final documentation `95f5cda`.
- Image: `sha256:d536c53aa158b5e2b51f038b0a2a48c5ca352cdbbce26bbba2412eadebb29ed7`.
- Release: `frost-characters-20261017-17c1411-r1`.
- Plan: `sha256:a457147d40d1119ccf9a822cda8dacea28f9961543752100b489a8d96d4a39d8`.

Only web was replaced, with its existing runtime environment and auction-state
mount retained; existing nginx configuration passed validation and was softly
reloaded. Origin HTTPS/readiness checks passed with originCA validation. During
120 seconds of observation web stayed healthy with zero restarts/runtime errors;
nine other container identities/start times/restart counts remained unchanged.
The isolated candidate was removed. No schema/data mutation or migration was made.

Rollback image:
`sha256:1bc12864fcf668c4739afe8b15637a137b156d88f7a9cc2480ce820c1708ccfd`.
The exact prior manifest, guarded rollback runner and protected release evidence
are archived under `/opt/gildra/releases/frost-characters-20261017-17c1411-r1/`.
The rollback runner refuses a newer image/manifest. The verified operation ledger
tip is `sha256:98b92f5704d3a79b3bbfef6533d4a7d5742a86dc72ee103c4e2eddc0d62f88b9`.

No remote push was performed by this task. Future web releases must include
17c1411 (both frost fix71d1e30 and auction2950e8e), along with previous global
theme/performance history. Future worker changes require a new immutable asset
version. Raw regression screenshots/results are in the ignored
`apps/web/.artifacts/frost-characters/` directory; protected release evidence is
also retained in `/home/debian/gildra-frost-characters-release-20261017/evidence/`.
