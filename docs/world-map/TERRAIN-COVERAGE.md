# Terrain and painted-label coverage — MAPD4, 2026-11-09

Base: `25aad288ee0498b671298914c72d24407cd243e4`. No deployment.
All pixels are decoded from the matching Blizzard client through TACT/CASC.

## Size and tile inventory

- Logical assets: **543.8 → 668.5 MB**.
- Filesystem allocation: **865 → 982.9 MiB**; **1030.6 MB** against the owner’s 1100 MB on-disk budget.
- **125670 files**, 73 generated terrain pyramids (70 referenced by published descriptors).
- All 73 old/new sparse indexes compared: **0 added, 0 removed tiles**.
- q85 native, q80 coarse; every coarse level averages native lossless pixels.
- Per-pyramid BLP/PNG intermediates removed; no `.native` files are published.
- Disk guard stopped once before the next pyramid at <25 GiB free; only this worktree’s completed `.next` output was removed, then the seven remaining pyramids finished.

## Labels

- **3021/3021 word regions** have `{en, ru}` (all 476 unique localized pictures audited).
- The other **36/3057 detected regions** are reviewed non-word artwork, explicitly `kind: "ornament"`, without invented labels.
- **No unresolved word region remains.** Both current and historical capital layouts were reviewed against EN/RU client art.
- Capitals covered include Stormwind, Orgrimmar (both floors), Ironforge, Undercity, Darnassus, Thunder Bluff, Silvermoon, Exodar, Shattrath, both Dalarans, Oribos, Valdrakken, Dornogal, Boralus, Dazar’alor, Gilneas and the new Silvermoon layout.
- Source names: per-product AreaTable, WMOAreaTable, WorldMapOverlay hit/texture boxes, and manually verified literal art captions. Historical geometry uses its own product’s AreaTable names.
- Source-art differences such as English “Lordaeron Keep” / Russian “Подгород” are retained, not independently translated.
- The detector sometimes merges adjoining names. Those entries join the actual names with `·`, retaining the inherited box geometry. Splitting these composite boxes would improve individual placement in a later annotation pass.
- The registry is `apps/web/data/wow/map/painted-label-text.json`; `label_text.py` reapplies it after annotation and refuses missing/moved source boxes.

## Per pyramid

| Source | Client build | UiMap IDs sharing the directory | MB | Native block px | Pyramid px |
|---|---|---|---:|---:|---|
| classic | 1.15.9.70576 | 1414 | 10.667 | 256 | 7680×11520 |
| classic | 1.15.9.70576 | 1415 | 6.298 | 256 | 5376×10752 |
| manifest | 12.1.5.70783 | 12 | 37.165 | 512 | 15872×23552 |
| manifest | 12.1.5.70783 | 13, 2537 | 33.981 | 512 | 21504×27136 |
| manifest | 12.1.5.70783 | 113 | 25.043 | 512 | 18944×12288 |
| manifest | 12.1.5.70783 | 424 | 14.394 | 512 | 14848×10240 |
| manifest | 12.1.5.70783 | 619 | 11.511 | 512 | 13824×12288 |
| manifest | 12.1.5.70783 | 875 | 5.789 | 512 | 12288×9216 |
| manifest | 12.1.5.70783 | 876 | 7.389 | 512 | 12288×9216 |
| manifest | 12.1.5.70783 | 1978 | 20.072 | 512 | 22016×16896 |
| manifest | 12.1.5.70783 | 2274 | 8.669 | 512 | 12288×9216 |
| manifest | 12.1.5.70783 | 101, 97, 94, 95, 122, 103, 106, 110 | 20.438 | 512 | 24576×18944 |
| manifest | 12.1.5.70783 | 572 | 17.327 | 512 | 18944×14848 |
| manifest | 12.1.5.70783 | 1525, 1533, 1536, 1543, 1565, 1670, 1961 | 13.659 | 512 | 16896×14848 |
| manifest | 12.1.5.70783 | 1970 | 2.247 | 512 | 5120×4096 |
| manifest | 12.1.5.70783 | 830, 882, 885 | 1.971 | 512 | 10752×10752 |
| manifest | 12.1.5.70783 | 207 | 2.450 | 512 | 5120×4096 |
| manifest | 12.1.5.70783 | 174, 194 | 0.464 | 256 | 2560×5888 |
| manifest | 12.1.5.70783 | 244, 245 | 0.163 | 256 | 1536×1280 |
| manifest | 12.1.5.70783 | 276 | 0.208 | 512 | 1536×1536 |
| manifest | 12.1.5.70783 | 504 | 0.298 | 256 | 2048×1536 |
| manifest | 12.1.5.70783 | 1355 | 1.189 | 512 | 3584×3584 |
| manifest | 12.1.5.70783 | 2133 | 1.787 | 512 | 5632×5120 |
| manifest | 12.1.5.70783 | 2200 | 4.292 | 512 | 7680×5120 |
| manifest | 12.1.5.70783 | 2248 | 2.853 | 512 | 8704×6144 |
| manifest | 12.1.5.70783 | 2346 | 0.379 | 512 | 2560×2048 |
| manifest | 12.1.5.70783 | 2369 | 0.238 | 512 | 2048×1536 |
| manifest | 12.1.5.70783 | 2371 | 2.339 | 512 | 8192×6144 |
| manifest | 12.1.5.70783 | 2405 | 4.343 | 512 | 8192×7168 |
| manifest | 12.1.5.70783 | 2413 | 3.596 | 512 | 7680×5120 |
| manifest | 12.1.5.70783 | 2432, 2565 | 0.881 | 512 | 2560×2560 |
| manifest | 12.1.5.70783 | 1462 | 0.343 | 512 | 2560×2048 |
| manifest | 12.1.5.70783 | 2151 | 1.090 | 512 | 5120×3584 |
| manifest | 12.1.5.70783 | 2118 | 0.917 | 512 | 3584×2560 |
| manifest | 12.1.5.70783 | 202 | 0.094 | 256 | 768×512 |
| manifest | 12.1.5.70783 | 1577 | 0.233 | 512 | 1024×1024 |
| manifest | 12.1.5.70783 | 2372 | 1.612 | 512 | 3072×2560 |
| manifest | 12.1.5.70783 | 2351 | 2.632 | 512 | 7168×5120 |
| manifest | 12.1.5.70783 | 2352 | 1.681 | 512 | 5632×3584 |
| manifest | 12.1.5.70783 | 2366 | 0.746 | 512 | 3072×2048 |
| manifest | 12.1.5.70783 | 998 | 0.291 | 512 | 1536×1024 |
| manifest | 12.1.5.70783 | 1010 | 0.286 | 512 | 2048×1536 |
| manifest | 12.1.5.70783 | 1039 | 0.186 | 512 | 1536×1024 |
| manifest | 12.1.5.70783 | 1041 | 0.284 | 512 | 1536×1024 |
| manifest | 12.1.5.70783 | 1339 | 0.224 | 512 | 1536×1536 |
| manifest | 12.1.5.70783 | 1960 | 1.294 | 512 | 4608×3072 |
| manifest | 12.1.5.70783 | 2070 | 1.123 | 512 | 2560×2560 |
| manifest | 12.1.5.70783 | 2165 | 0.134 | 512 | 1536×1024 |
| manifest | 12.1.5.70783 | 2354 | 2.206 | 512 | 2560×2560 |
| manifest | 12.1.5.70783 | 2403 | 0.857 | 512 | 2048×1536 |
| manifest | 12.1.5.70783 | 2404 | 1.018 | 512 | 2560×2048 |
| manifest | 12.1.5.70783 | 2447 | 0.142 | 512 | 1024×1024 |
| manifest | 12.1.5.70783 | 2451 | 1.614 | 512 | 3072×2560 |
| manifest | 12.1.5.70783 | 2509 | 0.250 | 512 | 2560×2048 |
| manifest | 12.1.5.70783 | 2510 | 0.063 | 512 | 512×512 |
| manifest | 12.1.5.70783 | 2585 | 0.903 | 512 | 2560×2048 |
| manifest | 12.1.5.70783 | 2594 | 0.568 | 512 | 2048×1536 |
| manifest | 12.1.5.70783 | 2599 | 0.185 | 512 | 1024×1024 |
| manifest | 12.1.5.70783 | 2600, 2623 | 0.293 | 512 | 2560×2048 |
| manifest | 12.1.5.70783 | 2605 | 1.362 | 512 | 2048×2048 |
| manifest | 12.1.5.70783 | 2633 | 0.111 | 512 | 1024×512 |
| mists | 5.5.4.70631 | 12 | 11.676 | 256 | 7936×11520 |
| mists | 5.5.4.70631 | 13 | 7.667 | 256 | 7424×10752 |
| mists | 5.5.4.70631 | 424 | 23.300 | 1024 | 29696×20480 |
| mists | 5.5.4.70631 | 207 | 0.889 | 256 | 2560×2048 |
| mists | 5.5.4.70631 | 174, 194 | 0.464 | 256 | 2560×5888 |
| mists | 5.5.4.70631 | 244 | 0.104 | 256 | 1280×768 |
| mists | 5.5.4.70631 | 245 | 0.097 | 256 | 1024×768 |
| mists | 5.5.4.70631 | 276 | 0.089 | 256 | 768×768 |
| mists | 5.5.4.70631 | 504 | 1.713 | 1024 | 8192×6144 |
| tbc | 2.5.6.70577 | 1945, 1943, 1946, 1947, 1954, 1957, 1941, 1942, 1944, 1948, 1949, 1950, 1951, 1952, 1953, 1955 | 6.043 | 256 | 12288×9472 |
| unattached | 12.1.5.70783 | 1409 | 0.561 | 512 | 4096×2560 |
| wrath | 3.80.2.70522 | 113 | 7.726 | 256 | 8960×5888 |

## Verification and remaining integration

- Python: 5 terrain/edge regressions + 5 localization/registry checks, PASS.
- `validate_eras.py`: all 17 eras, no problems.
- `atlas:check`: 166; `test:atlas`: 827/827; TypeScript and changed-test ESLint PASS.
- Production build and EN1440/RU390 before/after screenshots: evidence and exact final commands in `/tmp/mapd4/REPORT.md`.
- The original Ashenvale dot pattern and native DXT discontinuities remain. q85 reduces newly introduced WebP blocks; source pixels are not retouched or invented.
- Asset URLs are unchanged: an authorized deployment must purge updated `/maps/terrain/*` URLs, or version them, to replace cached q70 tiles. No purge/deployment was performed.
- Valdrakken can prefer its finer 3840px painted city art at the cap (`ground=0`); engine-policy note `/tmp/mapcoord/MAPD4-requests.md`. No engine files changed.
- Final Stormwind screenshots have a rectangular tone discontinuity absent from an offline stitch of the same published native tiles; composition/clip review requested in the same engine handoff. The initial production EN Stormwind capture showed only the wash, so it is not a reliable codec A/B comparison.
- Orgrimmar district text reaches the browser, but max-depth focus art has `blur≈0.731792`, and `pickMarkers` excludes blurred entries before its text branch. The Drag / Волок remains absent even after a small pan. Consumer fix requested in `/tmp/mapcoord/MAPD4-requests.md`; all data captions are complete, but UI visibility is not yet passing.
- Existing limits remain: Exile’s Reach 1409 is prepared but not linked into the hierarchy; phase-specific historical minimaps are not independently available, and Shadowlands overview 1550 is intentionally a stylized chart.
