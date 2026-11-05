# Page backgrounds 2026-11-06 — Codex image_gen task (skill gildra-asset-imagegen, template §9 «Сцена»)

Owner: «сделай с gpt image более красивые фоны, кроме рейдов и мифик+, чтобы они не были как ИИ-слоп, а качественный арт по World of Warcraft».

Executor: Codex built-in `image_gen` (gpt-image), one background per `codex exec` run (`/home/debian/gildra-art-20261106/run-scene.sh <key>`),
three separate calls with the same prompt, `transparent_background: false`, **no reference images** (the old scenes were the problem; Blizzard art is never an input).
Native 16:9 output is 1672×941; the pack step only encodes (and crops the auction phone variant) — no upscaling, retouching or compositing.
Prompts are built from `scenes.json` by `scenes.py` in the task folder (shared STYLE / COMPOSITION / EXCLUDE blocks, per-scene SCENE / LIGHT / palette).

## talents

| Where | Canvas | Native | Codex |
|---|---|---|---|
| /talents/<spec> (TalentBackdrop), routeArt preload | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/talents-candidate-{1,2,3}.png` → `talents-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Talents (talent calculator for every class) page on the Gildra World of Warcraft fan site.
SCENE: the trainers' hall of a heroic order: a tall vaulted hall of warm sandstone with massive rounded arches and dark oak beams; along the right wall heavy weapon racks hold a greatsword, a war hammer, a staff, a longbow and a round shield; in the focal point a broad stone dais with a carved oak lectern holding a large open tome, lit by a tall arched window behind it through which warm late-afternoon light pours; stacked old books and a brass brazier near the dais; the left side is the shadowed stone wall of the hall with one tall plain hanging cloth banner.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 38% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; warm golden window light against cool violet-grey stone shadow; the open tome glows faintly. Palette anchors: shadow #15121c, stone #6b5a4a, light #f0cf8e, accent #8a6fc4. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## classes

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scene `classes`: /wow/classes, /wow/rotation/<spec> | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/classes-candidate-{1,2,3}.png` → `classes-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Classes and specializations page on the Gildra World of Warcraft fan site.
SCENE: a great hall of heroes: a long nave of pale stone with thick round columns; on both sides stand colossal stone statues of armoured champions on plinths — a knight with a greatsword, a robed mage with a staff, a hunter with a bow, a priest with a mace — seen in three-quarter view, all wearing closed helms or deep hoods so no faces show; at the far end, at the focal point, a tall arched doorway of light with a broad stair leading up to it; long plain cloth banners in deep blue, crimson and gold hang between the columns.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 68% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: the only figures are the stone statues; no living people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; a warm shaft of light from the far doorway and the upper-left clerestory against cool blue-violet shadow along the nave. Palette anchors: shadow #12141f, stone #5f6070, light #f2dca6, accent #7c66c8. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no living people, no visible faces (every statue wears a closed helm or a deep hood), no crowds, no creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## characters

| Where | Canvas | Native | Codex |
|---|---|---|---|
| /wow/characters and profile states (CharacterAtlasBackdrop, object-position 74% top), routeArt | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/characters-candidate-{1,2,3}.png` → `characters-native.png` (candidate 1) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Account characters (Frost theme, Icecrown) page on the Gildra World of Warcraft fan site.
SCENE: Icecrown Citadel seen from the frozen glacier below: the jagged dark saronite spires of the citadel rise on a sheer cliff of blue ice, the tallest central spire — the Frozen Throne — topped by a faint cold blue light; huge curved saronite spikes and chains frame the fortress walls; wind-driven snow, a broken glacier and a few toppled saronite spikes form the calm foreground; storm clouds part around the spire.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 72% from the left and 34% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; cold moonlit ice-blue light on the spire against deep midnight-blue shadow; the only warm note is absent — the scene is cold. Palette anchors: shadow #0a1220, saronite #3b4658, light #d8e6f2, accent #8fb8e0. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## auction

| Where | Canvas | Native | Codex |
|---|---|---|---|
| /wow/auction (AuctionBackdrop), routeArt | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/auction-candidate-{1,2,3}.png` → `auction-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Auction House (Orgrimmar, goblin-run trading hall) page on the Gildra World of Warcraft fan site.
SCENE: the interior of the Orgrimmar auction house: a big hall of rough red-brown timber and hide with massive curved bone tusks and iron spikes holding up the roof, wide spiked iron braces and riveted metal plates; at the focal point a long goblin auctioneer's counter of dark wood with a big brass balance scale, stacked coin chests, sacks of goods and crates; above it a round opening in the roof lets warm light in; brass oil lanterns hang from chains; the left side is a shadowed timber wall with a stack of crates.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; warm copper-orange lantern and roof light against deep bottle-green shadow. Palette anchors: shadow #0a1712, iron #4a4c4e, light #e0b277, accent #3f9a6a. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## transmog

| Where | Canvas | Native | Codex |
|---|---|---|---|
| new scene `transmog`: /wow/transmog; /wow hub transmog card | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/transmog-candidate-{1,2,3}.png` → `transmog-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Transmog Studio (appearance wardrobe) page on the Gildra World of Warcraft fan site.
SCENE: the ethereal transmogrifier's wardrobe hall: a tall round hall of dark violet stone with brass trim; along the curved walls stand tall arched alcoves, each displaying an empty set of armour on a headless mannequin stand — gleaming plate, a mage robe, leather hunter armour — with folded cloaks and plain tabards on racks; at the focal point a tall freestanding arch of brass and violet crystal with a softly swirling teal-and-violet void mirror inside it; a pair of empty mannequin stands near it.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; soft teal-violet light from the void mirror and warm brass lamplight against deep indigo shadow. Palette anchors: shadow #120e22, brass #8a6a3a, light #e7d2a0, accent #5fc6c2. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## library

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scenes `archive`, `archiveDeep`, `library`: /library, /library/*, /search, /database/*, legal pages, nav menu, /wow hub card | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/library-candidate-{1,2,3}.png` → `library-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the World of Warcraft Library (items, spells, records) page on the Gildra World of Warcraft fan site.
SCENE: the great library inside the Violet Citadel of Dalaran: a tall round chamber with curved bookshelves of dark wood climbing three storeys, connected by narrow wooden galleries and ladders; violet slate floor with gold inlay; at the focal point a tall arched window of leaded glass with violet-blue arcane light, before it a large brass orrery on a pedestal and a reading desk with open tomes and a single candle; the left side is a tall dark bookcase in shadow.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 38% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; cool violet-blue arcane window light and a few warm candle accents against deep ink-blue shadow. Palette anchors: shadow #0b1220, wood #5a4228, light #d9b98a, accent #6fa8d8. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## tierLists

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scene `tierLists`: nav menu realm and /wow hub card (the /tier-lists page keeps the fixed M+ gateway hero) | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/tierLists-candidate-{1,2,3}.png` → `tierLists-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Tier lists (specialization rankings) page on the Gildra World of Warcraft fan site.
SCENE: a commander's war room in a stone keep: a massive oak war table covered by a hand-painted map of a continent with coastlines, forests and mountains but no writing; carved wooden unit markers and small pinned flags stand on the map; tall plain heraldic banners without emblems in crimson, deep blue and gold hang from the beams in descending order of length like a ranking; a weapon rack and a tall arched window with dusk light behind the table at the focal point; the left side is a dark stone wall.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; warm dusk window light and a brazier glow against cool teal-grey stone shadow. Palette anchors: shadow #0e1418, stone #4f5458, light #e8c27c, accent #3faa96. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## whatsNew

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scene `articles`: /wow/whats-new, nav "What's new" | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/whatsNew-candidate-{1,2,3}.png` → `whatsNew-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the What's new (site news; World of Warcraft: Midnight era) page on the Gildra World of Warcraft fan site.
SCENE: Silvermoon City in Quel'Thalas seen from a high elven terrace at early morning: graceful white-and-gold elven spires with sweeping crimson-and-gold roofs, curved arching bridges, golden-red Eversong trees; far away a pillar of golden light rises from the Sunwell on the Isle of Quel'Danas over the sea; in the left foreground a shadowed carved white-stone balustrade and a hanging crimson cloth.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 72% from the left and 36% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; soft golden sunrise light against cool lavender-blue shadow. Palette anchors: shadow #161226, stone #8a7a6a, light #f6dca0, accent #c24a3c. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## season2

| Where | Canvas | Native | Codex |
|---|---|---|---|
| /wow/midnight/season-2 hero (SeasonTwoHub) | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/season2-candidate-{1,2,3}.png` → `season2-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Midnight Season 2 overview page on the Gildra World of Warcraft fan site.
SCENE: the Isle of Quel'Danas at twilight during the Midnight war: the Sunwell plateau's golden elven spires rise on the island, a tall pillar of golden light shoots up from the Sunwell, while above it a huge dark violet void rift tears open the evening sky with purple storm clouds; the sea below reflects both gold and violet; elven ruins and a broken white-stone arch in the calm, shadowed foreground.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 36% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; golden Sunwell light against violet void storm light and deep indigo shadow. Palette anchors: shadow #120c22, stone #6c5f78, light #f4d58c, accent #8f5bdd. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## prey

| Where | Canvas | Native | Codex |
|---|---|---|---|
| Season 2 hub "Prey" card | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/prey-candidate-{1,2,3}.png` → `prey-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Prey (Midnight open-world hunts) card page on the Gildra World of Warcraft fan site.
SCENE: a hunter's ambush point in the twilight forests of Eversong: a narrow forest path between tall golden-red elven trees, deep fresh claw marks gouged into a large trunk, a sprung iron hunting trap with a chain on the path, an arrow stuck in a tree, a hooded hunting cloak caught on a branch; at the focal point a small hanging lantern by the claw-marked tree; mist low on the ground.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 66% from the left and 42% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; a single warm lantern and the last orange sunset light against deep violet forest shadow. Palette anchors: shadow #140f1c, bark #5a3b2a, light #f0b86a, accent #b0432e. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## lairs

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scene `lairs`: /wow/lairs hero, /wow hub card | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/lairs-candidate-{1,2,3}.png` → `lairs-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the Lairs and world bosses (the Coiled Isle, Tidebound Grotto) page on the Gildra World of Warcraft fan site.
SCENE: a vast sea cave lair on a tropical isle — the Tidebound Grotto: jade-green stone walls, ruined naga architecture with curved serpent-like arches and old bronze fittings covered in coral and barnacles; a shallow tidal pool with bioluminescent teal water at the centre; at the focal point a broken naga altar on a raised rock with a coiled serpent statue made of jade stone; a shaft of moonlight falls through a hole in the cave ceiling onto the altar; seaweed and wet rocks in the calm foreground.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; a cool moonbeam and teal bioluminescent water against deep jade-black shadow, one small warm bronze glint. Palette anchors: shadow #08281a, bronze #80551a, light #cfe8d8, accent #4fd0b0. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## lost

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scene `lost`: 404 | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/lost-candidate-{1,2,3}.png` → `lost-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the 404 — page not found ("this page fell in battle") page on the Gildra World of Warcraft fan site.
SCENE: a ruined battlefield at dusk after the battle: churned muddy ground with abandoned shields, broken spears and a smashed wooden catapult; a tattered plain red banner hangs from a broken pole; at the focal point on a low hill a ruined stone watchtower still smoulders with a thin column of smoke; dark storm clouds with a band of red-orange sunset behind.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; red-orange sunset glow and ember light against cold grey-brown shadow. Palette anchors: shadow #140e0c, earth #4a3a2e, light #f0a060, accent #c8462e. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```

## wow

| Where | Canvas | Native | Codex |
|---|---|---|---|
| scene `wow`: /wow hub hero, nav menu | wide 16:9 | `/home/debian/gildra-art-20261106/asset-sources/scenes/wow-candidate-{1,2,3}.png` → `wow-native.png` (candidate 2) | 3 × image_gen, no references |

```text
ASSET: one opaque painted environment background for the hero of the World of Warcraft hub (overview of Azeroth) page on the Gildra World of Warcraft fan site.
SCENE: a sweeping vista of Azeroth at sunrise from a high rocky overlook: a winding road leads down into a wide green valley with forests and a river; on a lakeshore in the middle distance rises a great white-walled human city with tall blue-roofed towers and a central keep; snowy mountain peaks beyond; on the overlook in the left foreground an old weathered stone waymarker without carvings and a lone pine in shadow.
CANVAS: wide 16:9 landscape.
COMPOSITION: the focal point sits at about 70% from the left and 40% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes (wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.
STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.
LIGHT: the main light falls from the upper left; warm golden sunrise light on the city and the peaks against cool blue morning shadow in the valley. Palette anchors: shadow #10161e, stone #5c5a54, light #f4d79a, accent #3d6fae. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.
DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.
EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.
```
