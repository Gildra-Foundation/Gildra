# Raid hub painted continuation

Generated on 2026-10-25 with the built-in `image_gen` tool in default built-in mode, as one new lower environmental continuation of the existing approved vault painting. This is a decorative fantasy environment concept, not an official Blizzard screenshot, gameplay map or boss portrait.

## Reference, output and source preservation

The existing approved native `/home/debian/gildra-raid-hub-release-20261025/asset-sources/raid-vault-native.png` (1672×941) was inspected with `view_image` before generation and supplied as the reference for environmental continuity, palette and broad painterly style. The existing responsive vault assets remain unchanged.

Native output: `/home/debian/.codex/generated_images/01a17422-7c14-7813-80c8-8ab71a511079/exec-c967555a-f76f-4364-99a6-0f99ee5f461d.png` (971×1619).

Byte-exact native copy: `/home/debian/gildra-raid-polish-release-20261025/asset-sources/continuation-native.png`. The full prompt is also saved as `continuation-prompt.txt`, and encoding metadata as `continuation-encoding.json`, alongside that copy.

The continuation starts beneath the causeway and descends through a coherent jade/slate ravine with low-contrast cliff, terrace and root silhouettes. Its center is calm mist; the bottom remains actual painted stone and jungle. There are no duplicated doorway/idol focal points, UI, text, characters or creatures.

## Encoding and responsive use

Sharp 0.35.5 performed only proportional crop/resize and WebP encoding (effort 6); there was no post-generation painting or compositing.

| File | Dimensions | Quality | Bytes | Source crop |
| --- | --- | --- | --- | --- |
| `continuation.webp` | 971×1619 | 82 | 160970 | full native |
| `continuation-tablet.webp` | 768×1280 | 80 | 106662 | full native |
| `continuation-mobile.webp` | 576×1600 | 79 | 82004 | x240,y0,w583,h1619 |

A media-specific `picture` selects one lower painting per viewport: mobile through 767px, tablet through 1023px, desktop otherwise. It has low fetch priority and lazy decoding/loading; the approved hero retains its existing high-priority responsive asset. There are two paintings total per viewport (hero plus continuation), no tiles, no duplicate background preload and no optimizer request.

The continuation begins at 57% of the hero scene height, blends through a 260px mask, and covers the rest of the actual page using proportional `object-fit: cover`. The hero gently dissolves into it instead of fading the lower page to a flat background. Static 2px blur on the hero and 2.5px blur on the continuation affect only the art; real HTML and card contents stay sharp. A restrained static jade bloom, two slow CSS mist layers and eighteen seeded motes (nine on phones) accompany the painting across the page. Only transform and opacity animate; there is no JavaScript frame loop. The existing visibility handler pauses all animated atmosphere in hidden tabs. OS/site reduced motion hides ambient motion; reduced transparency hides those layers and removes art blur; forced colours hides the decorative backdrop.

## SHA-256

| File | SHA-256 |
| --- | --- |
| `continuation.webp` | `9a50338f13421d2a0acde9bd3c0c08a3ef2119dda660ed698ceed493293621c0` |
| `continuation-tablet.webp` | `23c8912b86cc5f4d89597c7e1d72afac47ffc52e0400760dd47670d1f0284c26` |
| `continuation-mobile.webp` | `b50e6c9249503ec4e869d93c5930ff224f149be1f5749753e38fc816afad37b1` |
| `continuation-native.png` | `8aacbc9e9bacb11b821ec645ead6944884e0c7d9ec2895456bb7799ebc13530d` |

## Full generation prompt

Use case: stylized-concept.
Asset type: tall vertical environmental painting for the LOWER continuation of a production fantasy website background, opaque raster artwork only.
Primary request: continue the same believable environment DOWNWARD from the lower edge of the supplied serpent-vault painting. The supplied reference is the established upper scene; match its hand-painted Warcraft style, jade/slate stone palette, soft jungle mist and restrained aged bronze. Output only the new lower continuation, not a reproduction of the vault entrance.
Scene/backdrop: we descend from the ancient cliffside causeway into the much quieter lower ravine and old temple terraces. In the TOP quarter, a few broad worn blue-grey/green stone terrace edges and the bottom of a causeway emerge from soft pale jade mist, naturally continuing the reference's lower foreground. Below are large simple ledges and the suggestion of an ancient stone stair/causeway curving gently through a deep ravine, soft masses of jungle vegetation along the outer edges, a few broad hanging vines, and distant low-contrast cliffs disappearing into green-grey mist. The lower half opens into a serene layered misty hollow with large worn stone ledges and sparse root silhouettes. A faint desaturated warm bronze dusk tint reaches only a few upper stone edges; most of the lower scene is quiet cool jade/slate.
Composition/framing: tall portrait painting approximately 1536x2560, with a deliberate long continuous vertical journey from terrace near the top to lower misty ravine at the bottom. All areas belong to one continuous place, no panels or separate scenes. Keep the center 65% unusually calm and low-detail so real website cards and text can sit over it; readable large shapes mostly near the edges. There is NO new major focal building, idol or doorway. Do not repeat the reference's serpent head, portal, entrance or stair arrangement. Do not show sky or a bright sunset horizon.
Style/medium: polished painterly WoW environmental concept art; much BROADER and quieter than the reference, confident large brush planes, very low micro-detail, moderate-to-low contrast, soft atmospheric perspective and naturally varied forms. No photorealism or 3D render. Broad simple stone areas, not hundreds of sharply outlined paving tiles. The painting should remain convincing behind a long scrolling page rather than demand attention.
Lighting/mood: calm mysterious jade mist, deep but readable slate shadows, soft low glow in the atmosphere and a little aged bronze warmth above. Gentle tonal transitions, no pure black bottom, no bright focal flare, no neon green.
Constraints: artwork only, no text/UI/cards/borders/logos/watermarks, no characters or creatures, no repeated ornamental patterns, dense tiny foliage or high-frequency scratches, arrays of gems, dense spore dots, runes resembling writing, exaggerated bloom or beams. Do not turn the image into a series of repeated steps or stacked horizontal stripes. Keep the very bottom painted and legible, not a black gradient.

