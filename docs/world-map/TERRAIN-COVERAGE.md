# Terrain coverage — 2026-11-09

Base: `8fa48087f`. No deployment. Only game-client textures via TACT/CASC.

Assets: **421.2 → 543.8 MB** logical bytes (decimal).
Filesystem: **618 → 865 MiB** (`du -sm`, block overhead; clean checkout).
Budget: <1000 MB; 125670 files; 73 unique terrain pyramids.
Retail: 79 terrain-bearing maps; same-instance descendants use
ancestor terrain. Native-resolution descriptors and sparse indexes include
old and new sources. Sample decode: 292 top/native-level tiles, PASS.

Source builds verified from CDN: retail 12.1.5.70783, Mists 5.5.4.70631,
Classic 1.15.9.70576, TBC 2.5.6.70577, Wrath 3.80.2.70522. Cached/current
primary UiMapAssignment rows and WdtFileDataIDs: zero differences in all five
clients. See TERRAIN.md for native/mixed-resolution sampling.

## Remaining work

- MAPZ3: base engine's Outland→Nagrand deep jump can show only the wash;
  `composition().ground=[]`, while Classic deep zoom draws terrain. Repro and
  screenshots: `/tmp/mapd3/screens-final.log`, `outland-en-1440-deep.png`.
- Exile's Reach 1409: terrain ready in `terrain-unattached.json` and
  `/maps/terrain/1409`, but retail UiMap has ParentUiMapID=0 and is absent from
  the published hierarchy. Do not invent a world-map placement; needs a
  standalone entry/navigation decision.
- WDT MAID has no phase-specific minimaps. Phased art overrides clear direct
  terrain; engine must cap ancestor terrain there. Cataclysm terrain is the
  available 5.5 client, and WoD/Legion new areas use available retail terrain;
  exact historical phases for those clients cannot be certified.
- Real GPU smoothness is outside this data task; browser smoke uses SwiftShader.

Existing zoomable zone/continent maps with a WDT but no own/same-instance
ancestor terrain: **1**.

- 1550 The Shadowlands (MapID 2222): intentional exception; the overview is a
  stylized chart. Its separate zones have terrain; one affine pyramid
  would put the zones in the wrong places on the drawing.

## Eras

| Era | Terrain-bearing nodes | Sources |
|---|---:|---|
| classic | 2 | classic |
| burning-crusade | 18 | classic, tbc |
| wrath-of-the-lich-king | 19 | classic, tbc, wrath |
| cataclysm | 23 | mists, tbc, wrath |
| cataclysm-pandaria | 25 | mists, tbc, wrath |
| warlords-of-draenor | 26 | mists, retail, tbc, wrath |
| legion | 30 | mists, retail, tbc, wrath |
| battle-for-azeroth | 37 | retail |
| shadowlands | 47 | retail |
| dragonflight | 54 | retail |
| the-war-within | 65 | retail |
| midnight | 79 | retail |
| theramore-fall | 25 | mists, tbc, wrath |
| krasarang-landfall | 25 | mists, tbc, wrath |
| vale-corruption | 25 | mists, tbc, wrath |
| iron-horde-incursion | 26 | mists, retail, tbc, wrath |
| arathi-warfront | 37 | retail |

## Per pyramid (shared map IDs use one directory)

| Source | UiMap IDs | MB | Native block px | Pyramid px |
|---|---|---:|---:|---|
| classic | 1414 | 6.586 | 256 | 7680×11520 |
| classic | 1415 | 3.885 | 256 | 5376×10752 |
| manifest | 12 | 20.942 | 512 | 15872×23552 |
| manifest | 13, 2537 | 19.343 | 512 | 21504×27136 |
| manifest | 113 | 16.500 | 512 | 18944×12288 |
| manifest | 424 | 8.751 | 512 | 14848×10240 |
| manifest | 619 | 6.975 | 512 | 13824×12288 |
| manifest | 875 | 3.585 | 512 | 12288×9216 |
| manifest | 876 | 4.511 | 512 | 12288×9216 |
| manifest | 1978 | 12.085 | 512 | 22016×16896 |
| manifest | 2274 | 5.190 | 512 | 12288×9216 |
| manifest | 101, 97, 94, 95, 122, 103, 106, 110 | 12.273 | 512 | 24576×18944 |
| manifest | 572 | 11.922 | 512 | 18944×14848 |
| manifest | 1525, 1533, 1536, 1543, 1565, 1670, 1961 | 9.272 | 512 | 16896×14848 |
| manifest | 1970 | 1.543 | 512 | 5120×4096 |
| manifest | 830, 882, 885 | 1.331 | 512 | 10752×10752 |
| manifest | 207 | 1.643 | 512 | 5120×4096 |
| manifest | 174, 194 | 0.317 | 256 | 2560×5888 |
| manifest | 244, 245 | 0.111 | 256 | 1536×1280 |
| manifest | 276 | 0.125 | 512 | 1536×1536 |
| manifest | 504 | 0.210 | 256 | 2048×1536 |
| manifest | 1355 | 0.825 | 512 | 3584×3584 |
| manifest | 2133 | 1.250 | 512 | 5632×5120 |
| manifest | 2200 | 2.804 | 512 | 7680×5120 |
| manifest | 2248 | 1.902 | 512 | 8704×6144 |
| manifest | 2346 | 0.265 | 512 | 2560×2048 |
| manifest | 2369 | 0.163 | 512 | 2048×1536 |
| manifest | 2371 | 1.702 | 512 | 8192×6144 |
| manifest | 2405 | 2.944 | 512 | 8192×7168 |
| manifest | 2413 | 2.401 | 512 | 7680×5120 |
| manifest | 2432, 2565 | 0.631 | 512 | 2560×2560 |
| manifest | 1462 | 0.228 | 512 | 2560×2048 |
| manifest | 2151 | 0.700 | 512 | 5120×3584 |
| manifest | 2118 | 0.581 | 512 | 3584×2560 |
| manifest | 202 | 0.064 | 256 | 768×512 |
| manifest | 1577 | 0.152 | 512 | 1024×1024 |
| manifest | 2372 | 1.030 | 512 | 3072×2560 |
| manifest | 2351 | 1.803 | 512 | 7168×5120 |
| manifest | 2352 | 1.098 | 512 | 5632×3584 |
| manifest | 2366 | 0.515 | 512 | 3072×2048 |
| manifest | 998 | 0.179 | 512 | 1536×1024 |
| manifest | 1010 | 0.192 | 512 | 2048×1536 |
| manifest | 1039 | 0.124 | 512 | 1536×1024 |
| manifest | 1041 | 0.194 | 512 | 1536×1024 |
| manifest | 1339 | 0.150 | 512 | 1536×1536 |
| manifest | 1960 | 0.897 | 512 | 4608×3072 |
| manifest | 2070 | 0.681 | 512 | 2560×2560 |
| manifest | 2165 | 0.092 | 512 | 1536×1024 |
| manifest | 2354 | 1.531 | 512 | 2560×2560 |
| manifest | 2403 | 0.554 | 512 | 2048×1536 |
| manifest | 2404 | 0.678 | 512 | 2560×2048 |
| manifest | 2447 | 0.097 | 512 | 1024×1024 |
| manifest | 2451 | 1.031 | 512 | 3072×2560 |
| manifest | 2509 | 0.182 | 512 | 2560×2048 |
| manifest | 2510 | 0.040 | 512 | 512×512 |
| manifest | 2585 | 0.588 | 512 | 2560×2048 |
| manifest | 2594 | 0.390 | 512 | 2048×1536 |
| manifest | 2599 | 0.125 | 512 | 1024×1024 |
| manifest | 2600, 2623 | 0.196 | 512 | 2560×2048 |
| manifest | 2605 | 0.961 | 512 | 2048×2048 |
| manifest | 2633 | 0.072 | 512 | 1024×512 |
| mists | 12 | 7.417 | 512 | 7936×11520 |
| mists | 13 | 4.854 | 512 | 7424×10752 |
| mists | 424 | 18.456 | 1024 | 29696×20480 |
| mists | 207 | 0.617 | 256 | 2560×2048 |
| mists | 174, 194 | 0.317 | 256 | 2560×5888 |
| mists | 244 | 0.070 | 256 | 1280×768 |
| mists | 245 | 0.065 | 256 | 1024×768 |
| mists | 276 | 0.057 | 256 | 768×768 |
| mists | 504 | 1.325 | 1024 | 8192×6144 |
| tbc | 1945, 1943, 1946, 1947, 1954, 1957, 1941, 1942, 1944, 1948, 1949, 1950, 1951, 1952, 1953, 1955 | 4.190 | 256 | 12288×9472 |
| unattached | 1409 | 0.373 | 512 | 4096×2560 |
| wrath | 113 | 5.546 | 256 | 8960×5888 |

## Checks

TypeScript and focused ESLint PASS; atlas:check 166; test:atlas 807/807;
Python terrain regressions 3/3; validate_eras all 17 eras with zero issues
(also --overlaps before final terrain-only alias/TBC completion; masks unchanged).
EN1440/RU390 screenshots reviewed; clean-ui zero suspicious nodes;
Classic deep terrain displayed. Outland deep wash is an engine handoff above.
No deployment; local dev stopped and .next removed.
