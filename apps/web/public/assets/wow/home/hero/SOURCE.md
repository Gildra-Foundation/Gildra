# WoW hub hero delivery variants

These are resized and encoded derivatives of the existing approved scene, not newly drawn artwork. The painting content, crop, colours and composition are unchanged. Sharp only downsizes and encodes; no retouching, compositing, recolouring, generative editing or upscaling.

Sources (already shipped, original generation provenance in the loading assets' source records):
- `/assets/wow/loading/wow-azeroth-vista-20261106.webp` — 1672×941.
- `/assets/wow/loading/wow-azeroth-vista-20261106-portrait.webp` — 847×941.

Recipe: `sharp(source).resize({ width, withoutEnlargement: true })`, then AVIF `effort:5, quality:40` (wide) / `quality:32` (portrait), or WebP `effort:5, quality:50` (wide) / `quality:40` (portrait). Source/output SHA-256, dimensions, bytes and exact quality per file are recorded in `manifest.json`.

Widths: wide 768/1200/1672; portrait 384/640/847. Delivery uses a native art-directed `<picture>` with AVIF first and WebP fallback, accurate `sizes="100vw"`, media-specific preload and high fetch priority. No runtime image transform and no enlargement beyond the approved source dimensions. Decorative image: empty alt; the frame's atmosphere is aria-hidden.

Acceptance: review the final EN/RU hub at1440/1920/390, including the native-width source and phone crop. These opaque scene derivatives need no alpha/9-slice geometry or new imagegen candidates; no new illustration was generated.
