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
will be appended when complete. Preserve content-on-shards and character-list
scope fixes from cf238c6, plus all published auction changes.

API reference: [DedicatedWorkerGlobalScope.requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/requestAnimationFrame).


The first autonomous native-RAF image f1dd647/33609b5 was rejected, never
published: only7/12 frame-stall cases passed; desktop shattering still had roughly
63ms frame gaps. A timestamp-only timer prototype passed6/6 desktop cases; a CDP
screencast check also confirmed changing pictures during the UI stall. These are
separate diagnostic prototypes, not final-image publication proof. A lower
resolution trial did not remove the native-RAF delay and was discarded. Final
textures keep their1024px cap; no quality budget was weakened to pass the test.
