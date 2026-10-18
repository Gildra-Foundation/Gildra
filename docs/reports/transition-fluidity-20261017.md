# Transition fluidity correction, 17 October 2026

The v5 renderer paints in a worker but requests and acknowledges every frame
through the UI event loop. A route hydration/layout task consequently stalls the
ice as well. The real live-route regression (`qa-transition-fluidity.mjs`) turned
red: a 330ms UI task produced zero worker frames during the task and a 505ms gap.

v6 owns a finite animation clock in the dedicated worker. Freezing and cracking
run as a sequence without a UI hand-off between frames. Only phase/progress
summaries and completion reach the page, at most once per120ms plus boundaries.
The worker stops its own loop at completion/disposal, with no idle loop. A finite ~60Hz worker timer advances from elapsed time with one pending tick.
Native worker RAF was rejected after actual-image tests still found owner-render
pipeline delays. Hidden documents cancel the effect, including pending capture.
Failure still cancels or falls back without trapping navigation.

The broken sheet becomes one immutable ImageBitmap for repeated cropped drawing,
closed on disposal. A trial caching18 individual fragment canvases showed no
clear gain and was discarded. No per-fragment DOM or new dependency is added.
The still viewport copy disables live backdrop sampling; real page styling is
unchanged. Fragment opacity has a smooth endpoint curve. Expensive full-screen
blur filters have not been added to a struggling renderer.

The direct regression retains the real worker implementation with timestamp-only
QA instrumentation. Worker epoch timestamps distinguish actual missing frames
from delayed delivery to a busy UI. Early standalone-route prototype repeats
painted10–12 frames during the same330ms task; live v5 painted0. Development
prototype results are diagnostics, not final production FPS measurements.

Final immutable-image comparison, functional verification and publication evidence
are recorded below. Preserve content-on-shards and character-list
scope fixes from cf238c6, plus all published auction changes.

API reference: [DedicatedWorkerGlobalScope.requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/requestAnimationFrame).


The first autonomous native-RAF image f1dd647/33609b5 was rejected, never
published: only7/12 frame-stall cases passed; desktop shattering still had roughly
63ms frame gaps. A timestamp-only timer prototype passed6/6 desktop cases; a CDP
screencast check also confirmed changing pictures during the UI stall. These are
separate diagnostic prototypes, not final-image publication proof. A lower
resolution trial did not remove the native-RAF delay and was discarded. Final
textures keep their1024px cap; no quality budget was weakened to pass the test.


## Published verification

Frozen application source: `79cfd7f1bbf573b19182085b4b5b8a0322ada20a`.

Image: `sha256:f0ff29842ac89c7081dafe54ba163054b2f1b36ca80e38a850b261b3dc585881`.

Release: `transition-fluidity-20261017-79cfd7f-r1`.

Both immutable images ran sequentially on localhost with identical Chromium156,
Site Isolation,1440×900/CPU1 and390×900/CDP CPU4, three contexts per phase/profile.
No build or other browser QA overlapped these comparisons. Worker frame epoch
timestamps distinguish actual renderer submissions from delayed parent delivery.
This is a specific330ms busy-UI regression, not field FPS or an INP measurement.

| Profile / phase | Old/new worker frames during UI stall (median) | Old/new largest worker gap (median ms) |
| --- | ---: | ---: |
| desktop / freezing | 0 / 10 | 404.9 / 48.9 |
| desktop / shattering | 0 / 14 | 331.1 / 35.4 |
| mobile / freezing | 0 / 16 | 387.4 / 22.9 |
| mobile / shattering | 0 / 14 | 332 / 31.4 |

The v5 baseline failed12/12 (zero frames inside the330ms UI task). The final
unmodified image passed12/12; it sends two finite play programs and zero UI-driven
frame requests per journey. These are worker draw timestamps, not display FPS;
separate diagnostic CDP screencasts confirmed changing fragment images during
UI work. A native-RAF candidate and resolution-reduction experiment were rejected.
No resolution reduction or expensive blur filter is in the final product.

Four additional cold-network journeys (desktop/mobile × home/raids,4Mbps down,
1Mbps up,80ms latency) carried page content on shards with bounded DOM and zero
page errors. Their timings are n1 diagnostics, not a headline speed comparison.
The actual image passed all four themes, material390/1440/2560, Escape/delayed
routes, history, cross-tab preferences, sound/mute and reduced motion. Eight
localhost authenticated70-character fixture journeys passed RU/EN ×1440/390
×scroll0/3000: actual roster → header Gildra → home, delta0px and source DOM hidden
while the worker carries source pixels. These are clearly synthetic local data.
Pixel proof390/1440 also retains real glyph/image/background pixels on fragments,
viewport pruning, abort, sandbox CSP, shared-thread refusal and idle cleanup.

Public verification passed four independent-clock cases (two profiles ×two
phases), all themes/material, eight anonymous character-entry → Gildra →home
journeys with hidden source DOM/content ready and eight asset SHA/length matches.
The120-second observation found0 web restarts/runtime errors; nine other containers
retain their identities/start times/restart counts. Web only: auction a1f93cb and
master07f5159 changes retained; rotation worker staysa98dc5d. Rollback is the prior
immutablecf238c6 web image0dc3220 plus byte-exact manifest. No schema/data changes.

Evidence, source manifest, rejected candidate proof, guarded plan, public motion
binding, raw clock records, candidate functional checks and chained ledger:
`/opt/gildra/releases/transition-fluidity-20261017-79cfd7f-r1/`.

Post-publication working-tree edits document the release and adapt screenshot
QA pacing only; they do not change the frozen application image. Physical mobile hardware,
field INP and universally guaranteed FPS remain unmeasured. Asset/bitmap failure
retains lightweight ice; page content remains transient, with no screen recording
permission or upload.


## Screenshot test pacing and capture follow-up

The first public concurrent screenshot checks missed phases on a busy browser.
The functional screenshot harness now also extends the worker's phase durations,
since extending only a UI cleanup timer no longer holds an autonomous renderer.
Sequential public material and character-entry checks passed. The actual-speed
clock regression remained byte-identical to the frozen source; its public four
cases passed before screenshot tests, without any duration or budget changes.
Executed harness hashes and diffs are archived with the release.

Visual inspection of the public homepage-to-privacy screenshot also found stray
stylesheet text near the lower edge of a source fragment. Capture serialization
is unchanged in this performance patch; its exact cause and prior-release
presence are not verified. Treat this as a separate capture-fidelity follow-up,
not a claim of pixel-perfect snapshots. Physical-device FPS remains unmeasured.
