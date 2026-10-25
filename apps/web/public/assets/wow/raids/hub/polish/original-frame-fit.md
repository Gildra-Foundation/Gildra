# Original raid frame aperture fit

Updated 2026-10-25 UTC. All five original frame WebP files and their original `frames/SOURCE.md` are preserved byte for byte. Runtime frame URLs remain `/assets/wow/raids/hub/frames/{slug}.webp`. No replacement frame images are used.

Each original is 960×640 RGBA. `raidHubFrames.ts` follows the actual connected transparent inner aperture, rather than estimating it from a rectangle and a generic radius. The contour is expanded four original pixels beneath the inner rail and simplified within 0.75 original pixels. The CSS polygon is normalized relative to that frame's own measured window. Original corners, roots, fungi and other inward contours therefore retain their own fit at every size.

| Original frame | Contour vertices | SHA-256 of unchanged WebP |
| --- | ---: | --- |
| venomous-abyss | 153 | `ffd7dd47ec9526e2ea9299f1271af810a70933d777ef09d303799f62852988c8` |
| the-voidspire | 185 | `372cfdf11002b7444d3aa926f17e0af2c615fd96471deba18b8b13c520cbb8fe` |
| the-dreamrift | 376 | `935c14542bb6ad0069af26e50ae471b65632206ff11555323bd00cb9e8a9f567` |
| march-on-queldanas | 124 | `56a656cd805107042748ca2cac61772a13364dfcd0dbe26d8037f093c0119a9b` |
| sporefall | 570 | `d26587d5cbd34ac9a670f4b19e482503b52411487977f052c452b077c7f2fa97` |

The derivation uses alpha≤32 to find the original aperture. A separate read-only verifier imports the actual runtime helper CSS, reconstructs its real polygon and insets, independently flood-fills the actual original WebP at alpha≤32, and checks inner-hole coverage and exterior leakage. All five frames are checked at widths 246, 270, 280, 320, 354, 384, 512, 654, 720, 960, 1200 and 1536: 60 cases, zero uncovered inner-hole pixels and zero exterior leaks.

Measurements, per-size counts, source hashes and rerunnable scripts are saved in `/home/debian/gildra-raid-polish-release-20261025/original-frame-fit/`: `geometry.json`, `inputs.json`, `measure-original-frames.cjs`, `verify-frame-coverage.cjs` and `coverage-verification.json`. Run the read-only verifier with `node --experimental-strip-types --no-warnings verify-frame-coverage.cjs`. It does not edit frame assets or application files.

Unused replacement frame experiments are archived outside the website under `/home/debian/gildra-raid-polish-release-20261025/audit/unused-new-frames/`. They are absent from the runtime asset tree. Grain smoothing applies only through the frame's browser styling; the original raster pixels and alpha are unchanged.
