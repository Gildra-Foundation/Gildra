# Pointer motion preference audit — 22 October 2026

Baseline: `8af3dcdb`, production `/ru/wow/lairs` in Chromium headless at 1440 × 900 and touch 390 × 844.

`AtlasPointerLight` read `lessMotion()` only on mount. Enabling the site's reduced-motion setting while hovering a boss portrait left the inline tilt active. Subsequent pointer movement continued changing it even though the general animation census reported no running animations. The OS preference had the same stale snapshot problem.

Instrumentation around `requestAnimationFrame`, spotlight geometry reads and CSS custom-property writes measured the following for 60 pointer moves over one portrait:

| State | Geometry reads | Spotlight writes | Tilt writes |
| --- | ---: | ---: | ---: |
| Baseline normal | 60 | 120 | 120 |
| Baseline site reduced after mount | 60 | 120 | 120 |
| Updated normal, actual React component fixture | 60 | 120 | 120 |
| Updated site reduced after mount, component fixture | 0 | 0 | 0 |
| Updated OS reduced after mount, component fixture | 0 | 0 | 0 |

Normal idle and touch already performed zero pointer work and retain that behavior. This is a preference-correctness and unnecessary-work fix, not a claim of a general frame-rate improvement. The pre-change three-route scroll audit (`/ru/wow/lairs`, `/ru/wow/mythic-plus`, `/ru/wow/raids/the-voidspire`) passed at 4× CPU: 8/9/7 ambient animations, zero non-compositor animations, 0/0/12 ms blocking, and zero running animations under either reduced setting.

The controller now listens for site preference, OS motion, pointer capability and visibility changes. Disabling it removes the pointer listener, cancels queued work and clears the current tilt. Enabling it restores the same normal pointer effect. Unmounting removes all listeners and pending work.

A browser fixture compiling the actual React component verified initial normal/reduced/touch modes, live site and OS switches in both directions, immediate tilt reset, cancellation of a queued pointer frame, and no work after unmount. Integration regression is available for the final built candidate:

```sh
node apps/web/scripts/qa-pointer-motion.mjs --base http://127.0.0.1:3150
```

It exercises both locales, desktop and touch, and fails on the original production implementation. Raw baseline and fixture evidence is in the task's `.artifacts/motion/` directory; fixture measurements do not substitute for that final candidate check.
