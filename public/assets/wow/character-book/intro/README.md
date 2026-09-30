# Character chronicle opening — 2026-09-26

The active opening now uses **only the book**: the hinged leather cover
`chronicle-cover-v1.webp` and layered parchment pages. The cover and retained
duel illustrations were made with the built-in `image_gen` tool. They are
generated illustrations, **not Blizzard cinematic footage**.
The original user-supplied JPEG portraits in the page backdrop are untouched.

## Active loading and opening

Both real character routes (`/wow/characters/[slug]` and their `/ru` equivalents)
use the same closed-book scene while the server retrieves the authenticated
Battle.net profile. The book stays closed for the actual loading duration;
there is no timer-driven fake progress or duel.

Once the real profile is ready and the cover decodes, the same book opens
automatically over **1,400 ms**, revealing the character page. Cover preparation
is limited to **2,000 ms** and the presentation watchdog to **4,000 ms**. These
limits do not replace or time the server's Battle.net data loading.

Opening runs on each profile entry, not once per tab session. There is no replay
button or session marker. Ordinary renders and query-only changes do not restart
the book. Generic route-transition artwork is excluded for these profile routes
so it does not cover the book with a second loading animation.

Reduced motion keeps the pending book static and shows the ready page immediately.
Skip/Escape, cover failure, preparation timeout and the watchdog release the ready
page without blocking its use. Initially hidden tabs defer opening until visible;
hiding an already-running scene dismisses it without an unexpected restart.
The server-rendered cover is hidden when JavaScript is disabled, and a CSS-only
4-second fallback releases it if hydration never occurs. Authentication errors,
missing characters and profile failures retain their real route outcomes; they
do not trigger a successful opening. No authentication, character-data or DPS
logic is changed.

## Retained first-version assets

These files are preserved, but only the cover is still used by the intro:

| Asset | Master PNG | Runtime WebP | Status |
| --- | --- | --- | --- |
| `arthas-strike-v1` | 1536 × 1024 | 1200 × 800 | Retained reference; no longer rendered/preloaded |
| `illidan-parry-v1` | 1536 × 1024 | 1200 × 800 | Retained reference; no longer rendered/preloaded |
| `chronicle-cover-v1` | 1024 × 1536 | 720 × 1080 | Active hinged cover |

These original assets retain real alpha. Their PNG masters are unchanged tool
outputs; WebP copies were encoded with Sharp quality 88 / effort 6.
Their exact original prompts are in [`PROMPTS.json`](PROMPTS.json).

## Responsive homepage cover derivatives

The homepage (`/` and `/ru`) serves 320px and 640px derivatives of the existing
cover as AVIF, with matching WebP sources for browsers without AVIF support.
They were generated from `chronicle-cover-v1.webp` with Sharp at quality 60;
the original cover and quality-88 WebP remain unchanged. The desktop AVIF
transfers about 103 KB versus about 172 KB for the previous optimized response;
the 390px mobile viewport selects the 27 KB derivative.

## Retained duel experiments — not loaded by the page

The six full-scene illustrations and their exact prompts remain in
[`duel-sequence/`](duel-sequence/README.md). They are reference assets only:
the character page and loading state no longer render or preload them.

The separate [Wan 2.2 video trial](../../../../../output/video/character-duel-wan-v1/README.md)
is also retained as a preview/reference, not a live intro asset. It was produced
through the public Hugging Face ZeroGPU demo from one generated illustration
uploaded with explicit user approval. Its saved metadata records the prompt and
settings; its review documents weapon/grip artifacts. It is not requested or
played by the book-only opening.

No credentials, profile data or simulation results are embedded in these images
or were sent for the video trial.
