# Gildra portal artwork

Created with the built-in ImageGen tool on 22 October 2026 for the owner-selected portal concept 1. These are original generated decorative assets for the Gildra fan site; Warcraft characters and setting remain Blizzard properties. No UI text is baked into the artwork except the GILDRA brand wordmark in the crest.

- `hero-arthas.webp`: clean illustrated scene extracted/regenerated from the selected composition, 1774×887. Generation `exec-554dafbf-a185-4793-bbc6-b49861e0e776`.
- `crest.avif`: transparent black-steel/ice GILDRA crest, 800×267. Generation `exec-b9d6bacb-6270-49ad-bede-9dfcb0c2ad8f`.
- `mythic.webp`, `raids.webp`, `articles.webp`: separate 1200×480 destination illustrations. Generations `exec-bab7463d-44c5-414a-ac17-fb73e952bc19`, `exec-5fe3508a-5b33-4eb0-9065-73b3cac30262`, `exec-5cda332c-0b78-4cb9-bd83-42b9c732f7bb`.
- `button.webp`: text-free silver plate, 600×126, transparent padding trimmed.
- `divider.webp`: silver rule with central diamond, 600×33, transparent padding trimmed.
- `rail.avif`: black-steel header texture, 1000×65, transparent padding trimmed.

Generated PNG masters and prompts are preserved in the task's `.artifacts/portal-assets/` and Codex generated-image directory. Sharp performs only ordinary web delivery optimization (transparent padding removal, resize, WebP/AVIF encoding); it does not draw or replace art. Main assets are delivered by Next Image. The crisp800px crest is a9KB preencoded AVIF, served directly without a second lossy transcode; the rail is2KB AVIF. The small rail/button CSS textures are preoptimized. On narrow screens the tall hero cover crop uses the full optimized WebP through `<picture>` to avoid magnifying a viewport-width thumbnail. Existing Illidan/Garek/Varok illustrations and the archived book remain unchanged.

The visual reference and comparison are recorded in the repository root `design-qa.md`.
