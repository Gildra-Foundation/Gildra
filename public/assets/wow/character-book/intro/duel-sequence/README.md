# Six-pose character-book duel

Generated September 26, 2026 with the built-in `image_gen` tool using
reference-guided full-scene generation and edits. Exact submitted prompts and
reference paths: [`PROMPTS.json`](PROMPTS.json).

The first frame establishes both fighters, a shared stone floor and chamber.
Each subsequent generation references that frame to maintain the camera,
identities and environment while changing articulated body/weapon poses.
These are generated Warcraft-inspired illustrations, not official Blizzard
artwork, gameplay footage or extracted cinematic frames.

| File stem | Pose | Starts at | Runtime bytes |
| --- | --- | --- | --- |
| `frame-01-ready-v1` | Ready stance | 0 ms | 180,584 |
| `frame-02-windup-v1` | Coiled torso and drawn-back blade | 400 ms | 172,456 |
| `frame-03-strike-v1` | Forward rising strike | 750 ms | 174,140 |
| `frame-04-contact-v1` | Blade contact / compressed stance | 1,050 ms | 204,834 |
| `frame-05-recoil-v1` | Deflection and recoil | 1,350 ms | 182,036 |
| `frame-06-recover-v1` | Separated recovery stance | 1,750 ms | 177,834 |

Every stem has an unchanged generated PNG master (1536 × 1024) and a runtime
WebP (1200 × 800). Full-scene images are opaque. Sharp performs only runtime
resizing/encoding at quality 82 / effort 6: no additional generative edits,
compositing or alpha extraction. The six runtime frames total 1,091,884 bytes.

The active manifest is `components/wow/audit/characterBookDuelSequence.ts`.
Playback uses six illustrated poses with 85 ms dissolves, not a continuously
rigged animation or interpolated video. A common monotonic clock drives frame
selection and the 2.2 s duel; the recovery frame remains during the subsequent
book reveal. The existing closed-cover asset is reused.
