# PT Serif for the character atlas

These are unmodified, self-hosted PT Serif TrueType files from the official
[Google Fonts repository](https://github.com/google/fonts/tree/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/ptserif),
commit `23e54b51ddffbc7713c583748e3bd86f62b1fa4a`.

| Local file | Original file | CSS weight/style | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| `pt-serif-regular.ttf` | `ofl/ptserif/PT_Serif-Web-Regular.ttf` | 400 normal | 359,048 bytes | `a4951fade06ff8f09b7673aa81ffb65a8cd409e24d3289a6dc670bc4dda2557a` |
| `pt-serif-bold.ttf` | `ofl/ptserif/PT_Serif-Web-Bold.ttf` | 700 normal | 339,996 bytes | `038ba7336bd7ea14f12ad155bed51a4345cac5153275d521dec3ba04021c526e` |

Both full font files include Latin and Cyrillic glyphs. The repository's
[`METADATA.pb`](https://github.com/google/fonts/blob/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/ptserif/METADATA.pb)
lists `latin`, `latin-ext`, `cyrillic`, and `cyrillic-ext`; local `fc-query` also
confirmed Basic Latin and Russian Cyrillic codepoint ranges in both files.
Using the same font files for both scripts avoids a Russian-only fallback on
Linux or Windows.

License: SIL Open Font License 1.1; see the bundled [full license](./OFL.md).
Copyright © 2010 ParaType Ltd.; reserved font names include “PT Serif”.
PT Serif is a stylistically compatible substitute, not an original World of
Warcraft/Blizzard typeface.
