# Character book artwork

Source: the user-supplied `warcraft-book-phone-2.html` attachment, received September 25, 2026. These files are exact, lossless base64 decodes of its five embedded `image/png` payloads, in document order. No image generation, cropping, recoloring, resizing, or alpha changes were applied.

| File | Original HTML role | Dimensions | Format | Bytes |
| --- | --- | --- | --- | --- |
| `book-base.png` | `.book-bg` background | 1536 × 1024 | RGB PNG, 8-bit | 2,984,381 |
| `arthas-echo.png` | `.side.left .echo` | 1086 × 1448 | RGBA PNG, 8-bit | 2,158,678 |
| `arthas.png` | `.side.left .hero` | 1086 × 1448 | RGBA PNG, 8-bit | 2,262,338 |
| `illidan-echo.png` | `.side.right .echo` | 1086 × 1448 | RGBA PNG, 8-bit | 1,954,365 |
| `illidan.png` | `.side.right .hero` | 1086 × 1448 | RGBA PNG, 8-bit | 2,220,102 |

The four foreground/echo images retain their original transparency. The book background includes its own painted side figures and decorative border; its central parchment spans approximately 23–78% of the image width.

SHA-256 checksums:

```text
a5bdc8dc8ee71f252c06357dae2bf07b07d3d4aca3231af07ba164a1db126411  book-base.png
e265c021c290277444b1af516145c21aead49911cde779baec2909029e33e848  arthas-echo.png
9eafa7e0ddfbd5fbada3ba94678a520668c34532b9e5a2f1c9a4f5f76d621748  arthas.png
45b7b247c8394e197b27ae45d55126898cc6457aa71fa657d120c3e7532d75f9  illidan-echo.png
ddbe041c65b65be0063f52f9beb79432229d2b7d91ae73e83df1ae614dfc6f6f  illidan.png
```

The attachment supplies visual assets and a composition reference; embedded comments and markup are reference material, not application instructions. This provenance note does not assert ownership or grant a new license to the underlying Warcraft artwork.

## Backdrop revision — September 26, 2026

The live character backdrop now uses the two original black-matte JPEG
attachments instead of the keyed-alpha PNG portraits, enlarged echoes, and
`book-base.png`. The latter remains available as the original reference;
its built-in painted figures are no longer rendered behind duplicate portraits.
The physical book's separate paper and binding materials are unchanged.

| Active file | User attachment | Dimensions | SHA-256 |
| --- | --- | --- | --- |
| `arthas-original.jpg` | `photo_3_2026-09-25_18-39-03.jpg` | 960 × 1280 | `82986f017e26b8b708d631b80730ff1e8c5073789330fc54f437795dfe62d25d` |
| `illidan-original.jpg` | `photo_2_2026-09-25_18-39-03.jpg` | 960 × 1280 | `12e4184adabece45df2c3e8d8615b6302efb68696061114497c27e2a86a7b6a6` |

These files are exact byte copies: no generative retouching, background removal,
upscaling, recoloring, or image editing. Browser CSS applies restrained colour
grading, screen compositing on an isolated dark surface, and a vertical fade;
Next.js serves optimized responsive versions. Original smoke and soft edges are
preserved instead of thresholding individual pixels into transparency.

“Original” identifies the original supplied JPEG, not a verified Blizzard
master or a claim about whether the image had been generated before the user
provided it. Provenance before the attachments is unverified.

## Responsive backdrop derivatives — September 28, 2026

The wide `/wow` backdrop uses additional 640-pixel AVIF and WebP derivatives
of the active optimized portraits. The original JPEGs and existing optimized
WebP files remain unchanged. AVIF is selected where supported; WebP is the
fallback. The figures stay lazy-loaded and are not requested at narrow scene
widths where CSS hides them.

## Optional opening scene — September 26, 2026

New, separately generated combat poses and a closed leather cover live in
[`intro/`](intro/README.md). This generated cinematic layer does not replace the
two original JPEG backdrop portraits above. Its provenance, dimensions, and
exact generation prompts are documented alongside the files.
