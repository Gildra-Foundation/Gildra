# Auction House kit (slim) — origin

Generated 2026-11-05 by Codex built-in image generation (gpt-image), task by Claude per the `gildra-asset-imagegen`
skill: prompts `docs/auction-assets/CODEX-PROMPTS-slim.md` (spec `docs/auction-assets/auction-slim.spec.json`), three candidates per
asset, ranked by `asset-qa.cjs` (all 12 PASS, no warnings), winner checked by eye and copied unchanged. Packed by
`gildra-wow-material-design/scripts/pack-asset.cjs` (crop, downscale, WebP; no retouch, recolour or background removal).
Real generator alpha (controls); the scene is opaque. Used through `components/wow/auction/auctionKit.ts` (local adapter,
same contract as `components/wow/shared/material/sectionKits.ts`) and `AuctionBackdrop.tsx`.

Material: slim gunmetal iron rails with flush rivets, copper-gold coin bosses, emerald enamel, bottle-green ledger face.
Accent `#d0995a`.

| File | Native (outside public/) | Native SHA-256 | Chosen | asset-qa |
| --- | --- | --- | --- | --- |
| `controls/panels/auction.webp` | `/home/debian/gildra-owner-20261105b/auction/assets/asset-sources/panels/auction-native.png` | `26a8977f5676e082…` | candidate 1 | PASS |
| `controls/buttons/auction.webp` | `/home/debian/gildra-owner-20261105b/auction/assets/asset-sources/buttons/auction-native.png` | `c3c9ed4388f6e004…` | candidate 2 | PASS |
| `controls/frames/auction-icon.webp` | `/home/debian/gildra-owner-20261105b/auction/assets/asset-sources/frames/auction-icon-native.png` | `2de4b7ee6f06dc09…` | candidate 3 | PASS |
| `hall.webp`, `hall-768.webp`, `hall-mobile.webp` (crop 903,0,602,941) | `/home/debian/gildra-owner-20261105b/auction/assets/asset-sources/scenes/hall-native.png` | `2bb2ffef9c41f6cd…` | candidate 2 | PASS |

Prompts, QA reports, all candidates and proofs: `/home/debian/gildra-owner-20261105b/auction/assets/` (`asset-sources/`, `proof/`, `asset-sources/auction-selection.json`).

## hall-orgrimmar-20261106 (replaces hall*.webp in AuctionBackdrop)

Orgrimmar auction hall, generated 2026-11-06 by Codex image_gen (gpt-image), no references, candidate 2 of 3, copied unchanged;
packed by `pack-asset.cjs --type scene` (`hall-orgrimmar-20261106.webp`, `-768.webp`) and `--type scene-mobile --crop 1000,0,602,941`
(`-mobile.webp`). Native `/home/debian/gildra-art-20261106/asset-sources/scenes/auction-native.png`; prompt and hashes:
`docs/backgrounds-20261106/CODEX-PROMPTS.md`, `docs/backgrounds-20261106/SOURCE.md`.
