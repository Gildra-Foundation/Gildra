# Self-hosted WOFF2 subsets

The WOFF2 files in `atlas/` and `grimoire/` are the Latin, Latin Extended,
Cyrillic, and Cyrillic Extended subsets published by the official
[Google Fonts CSS2 API](https://fonts.googleapis.com/css2?family=Kurale&family=PT+Serif:wght@400;700&display=swap).
Their family, style, and font-version metadata matches the bundled full TTF
files. The full SIL Open Font License 1.1 texts remain in the corresponding
`atlas/OFL.md` and `grimoire/OFL.md` directories.

Devanagari subsets are not included because the site does not use that script.
The CSS declares the full Latin and Cyrillic unicode ranges and keeps the TTF
files as a fallback for browsers without WOFF2 support.

`azeroth/azeroth-cyrillic.woff2` is the owner's `azeroth/azeroth-cyrillic.ttf`
(SHA-256 `49df6b7f…c33eed`) in the WOFF2 container, made with fontTools 4.68
(`TTFont(...).flavor = "woff2"`, 2026-11-12): the same 175 glyphs, outlines,
metrics and character map (compared glyph by glyph after decoding), 22 036 bytes
against 25 527 for the TTF over a compressed connection. The TTF stays as the
source and as the fallback of the `@font-face` rule.
