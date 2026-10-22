# Article chapter activation — 22 October 2026

Reproduced using production revision `8af3dcdb` in an isolated container with the existing dev article fixture enabled, `/dev/article?lang=ru`, 1440 × 900.

The article sidebar measured 193.09 px tall and stuck at y=110. The shared chapter spy used its bottom (303.09) +24, so it changed chapters at y=327.09. Article headings have `scroll-margin-top:110px`; the normal 8 px tolerance gives an intended reading line of y=118. The highlight therefore advanced about 209 px early. At scrollY=1330, “Выноски” was already current with its heading still at y=300.17; the next two chapters reproduced the same problem.

`AtlasAnchorSpy` now has an optional `reading` mode for the article contents. It uses each heading's existing anchor landing position, independently of sidebar height. The default horizontal-strip mode retains its previous behavior. End-of-page selection, responsive anchor margins and horizontal strip scrolling are preserved.

This is a UX correction. Forty baseline scroll steps across six headings caused 240 geometry reads and 240 computed-style reads but zero long tasks; there is no evidence warranting an offset cache.

A browser fixture compiled from the actual updated React component verified both modes, heading landing, bottom-of-page selection and clearing on scroll back to the top. The integration regression below fails the old production implementation at the first English desktop assertion. Run it on the final isolated candidate with `GILDRA_DEV_GALLERY=1`:

```sh
node apps/web/scripts/qa-article-anchors.mjs --base http://127.0.0.1:3150
```

It checks both locales at 1440 and 390 px, two heading transitions and the final chapter. Raw baseline and component fixture evidence is in the task `.artifacts/motion/` directory.
