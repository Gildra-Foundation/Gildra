# Frost login materials

Original decorative game-style assets for Gildra, generated with the built-in
`image_gen` tool on 2026-10-26. These are not official Blizzard screenshots.
Each asset was generated in a separate call with genuine transparent RGBA.
No input reference images were used. Frostmourne-inspired silver steel, dark
gunmetal and glacial blue ice share a hand-painted Warcraft interface style.

Sharp only trims by alpha, resizes proportionally, adds transparent padding and
encodes WebP. No repainting, recolouring, background removal or alpha repair.
Text and interface icons are live HTML/SVG, not part of the painted assets.

`manifest.json` records final dimensions, native dimensions and paths, SHA-256,
alpha checks and nine-slice geometry. Panel and button use `border-image` with
these cuts; the crest keeps its original proportions.

- `panel.webp`: filled dark metal panel, silver rails and ice corner clasps;
  panel recipe, 768 px wide, quality 82, alpha quality 100.
- `button.webp`: blank dark steel button with icy blade end caps;
  button recipe, 768 px wide, quality 88, alpha quality 100.
- `crest.webp`: horned steel skull and glacial crossguard;
  cutout recipe, fit 352×416 with 16 px transparent padding, quality 84.

Native PNGs and complete per-asset prompts are retained outside the web bundle:
`/home/debian/gildra-frost-login-release-20261026/asset-sources/`.
Proofs over dark and cyan backgrounds and at different nine-slice sizes are in
`/home/debian/gildra-frost-login-release-20261026/proof/`.

The follow-up `icons/` directory contains four matching ice/steel interface
ornaments; see its own `SOURCE.md` and manifest for their provenance and proofs.

## Ornate Frostmourne revision — 2026-10-26

Owner requested substantially heavier, extravagant cursed-steel frames. The panel entry now uses `panel-ornate.webp`, generated with builtin image_gen and native alpha. Only trim/proportional resize/padding/WebP encoding; no retouch or recoloring. Native, exact prompt, measurements and proofs: `/home/debian/gildra-frost-ornate-release-20261026/asset-sources/panel`. SHA256 `f287d51fc0e3894cd63f829c7186c66434f7af7256981b0f3e5ec7ab6082fdb9`. Earlier delivered artwork remains as historical source; active paths are in manifest.json.

## Ornate Frostmourne revision — 2026-10-26

Owner requested substantially heavier, extravagant cursed-steel frames. The button entry now uses `button-ornate.webp`, generated with builtin image_gen and native alpha. Only trim/proportional resize/padding/WebP encoding; no retouch or recoloring. Native, exact prompt, measurements and proofs: `/home/debian/gildra-frost-ornate-release-20261026/asset-sources/button`. SHA256 `10f9fe89aea5d46109d265c2b2b1d2a6770ca98a26d03aadada25f16c0403c96`. Earlier delivered artwork remains as historical source; active paths are in manifest.json.
