# Forever assets — delivery report

Completed 2026-11-11 00:45 UTC. All six assets generated with **18 separate built-in image_gen.imagegen calls**, three identical-prompt candidates each. Four real-alpha controls and two opaque scenes; **10 final WebP files** in the shared worktree. No application code, global scene/portrait manifest, sectionKits, service, build, commit, push or deployment changes.

## Selected assets and integration geometry

| Asset | Candidate | Final size | Bytes | Integration |
|---|---:|---|---:|---|
| Panel | 3 | 768×960 | 49,862 | slices **[91,96,84,96]**, railInset **25**, desktop ×.18 / mobile ×.14 |
| Button | 1 | 768×116 | 14,152 | slices **[34,93,29,95]**, scale **68/116** for 68 px height |
| Icon frame | 3 | 256×256 | 13,674 | window bounds **left44 top45 right210 bottom212**; use full measured polygon in manifest |
| Pine ornament | 3 | 384×695 | 34,854 | rootPadding **12**, rootX **194**; 96 px wide; anchor right, theme pollen, duration1500, delay300 |
| Old road | 2 | 1672×941 | 91,326 | position **70% 38%**, og **[.7,.38]** |
| Crafthall | 3 | 1672×941 | 78,414 | position **70% 40%**, og **[.7,.4]** |

Scene variants: road 768×432 **42,514 B**, portrait 847×941 **107,578 B**; crafthall 768×432 **36,018 B**, portrait 847×941 **81,648 B**. Both portrait crops: **left578 top0 width847 height941**, matching current art:portraits ratio .9 and x=.7. Parent adds these two entries to artPortraits.json when integrating; this delegate did not edit that shared registry.

Public controls: `/assets/wow/slim/forever/controls/{panels,buttons,frames,ornaments}/`. Scenes: `/assets/wow/loading/forever-old-road-20261111{,-768,-portrait}.webp` and `/assets/wow/loading/forever-crafthall-20261111{,-768,-portrait}.webp`.

## Evidence and exact sources

- Full SHA256/dimensions/crops/alpha/slices/polygon/delivery budgets: `/home/debian/.t3/worktrees/Gildra-atlas/codex-forever-platform-release-20261111/docs/forever-platform-assets/manifest.generated.json` (copy `/home/debian/gildra-forever-platform-assets-20261111/manifest.generated.json`). Control-local manifests are next to their WebP files; frame uses `entries.skills["forever-icon"]`.
- Exact prompts and reference hashes: `/home/debian/.t3/worktrees/Gildra-atlas/codex-forever-platform-release-20261111/docs/forever-platform-assets/SOURCE.md`; original six prompt files and eighteen candidate-prompt copies under `/home/debian/gildra-forever-platform-assets-20261111/asset-sources/`.
- Selected natives: `asset-sources/panels/forever-native.png`, `buttons/forever-native.png`, `frames/forever-icon-native.png`, `ornaments/forever-pine-native.png`, `scenes/forever-native.png`, `scenes/forever-crafts-native.png` relative to `/home/debian/gildra-forever-platform-assets-20261111`.
- All **18** original output paths and byte-identical candidate hashes: `/home/debian/gildra-forever-platform-assets-20261111/generation-log.json`. Originals remain in `/home/debian/.codex/generated_images/01a1c800-b707-7d31-8bff-db60d5f1e707/` and are copied into the durable source root.
- Six native QA reports: `asset-sources/<folder>/<name>-qa.json`, each includes all three candidates. Twelve unselected originals plus reasons retained under each folder's `rejected/`.
- Skill pack results/proofs: `/home/debian/gildra-forever-platform-assets-20261111/proof/`. Native QA and pack used existing `/home/debian/Gildra-atlas/node_modules` via an isolated task staging directory; no dependency installation or shared symlink changes.
- Repro packing adaptation: `/home/debian/gildra-forever-platform-assets-20261111/pack-budget.cjs` (copy of skill packer, only ornament q82→25 and full-scene q84→70); `/home/debian/gildra-forever-platform-assets-20261111/finish-proofs.cjs` (current portrait crop recipe, q88). Original packer untouched.

## Actual checks and limitations

All selected natives have **zero native QA FAIL/WARN**. Frame candidate2 rejected for 8.2% low-alpha haze; ornament candidate1 has tight-fill warning. Other candidates were visually compared; selection reasons are retained. All final byte budgets pass, including a conservative <120000 B for every full-size and portrait scene, not only the 768 variants.

Viewed cyan-background pack proofs for every control, 9-slice panel/button at the packer's display sizes, frame aperture coverage at 40/48/52/96/280 px, ornament at 96 px, and both final scene compositions at 1440×900 and 390×900. Proofs: `proof/panel/forever-panel-proof.png`, `proof/button/forever-button-proof.png`, `proof/skill/forever-icon-skill-proof.png`, `proof/ornament/forever-pine-ornament-proof.png`, `proof/actual-size-controls.png`, `proof/forever-*-20261111-{1440,390}.png`. No visible cyan gap inside the frame, magenta leak outside, or objectionable fringe in control proofs. Panel and button slice proposals accepted unchanged.

Compression caveat: ornament q25 is deliberately optimized for **96 CSS px**, where its three tufts, cone and basal fitting remain readable; at native/384 px the encoded brush texture is softer. Its alpha is preserved at quality100. No repainting, background removal, colour adjustment, production compositing or enlargement. Scenes are original illustrative environments, not canonical game location documentation. The crafthall has a lit high opening around x30%; the left title area still needs the site's usual dark overlay. Phone crops intentionally omit peripheral props.

These are isolated asset proofs, **not integrated page QA**. Parent must wire kit/scenes/portrait entries and check EN/RU, desktop/mobile, text contrast under actual overlays, loading/empty/error states, keyboard focus, reduced motion and design lock before release. Retain the current material filters, opaque plaque underlay and decorative alt/aria treatment. No integration or release approval is implied by this report.
