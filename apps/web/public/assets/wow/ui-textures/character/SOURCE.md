# World of Warcraft UI textures

The PNG files in this directory are selected, unmodified interface textures from
[Gethe/wow-ui-textures](https://github.com/Gethe/wow-ui-textures), commit
`d23deaf8f44a7d280dc974a5c9d5321c013db59b` (`live` branch).

The source repository is a mirror of World of Warcraft interface textures and
does not declare an open-source license. World of Warcraft and the original art
are trademarks/copyright of Blizzard Entertainment. These files are used here
only to reproduce the visual language of the in-game interface in this fan-made
prototype; they are not project-authored assets.

Imported source paths:

- `FrameGeneral/UI-Background-Rock.PNG`
- `FrameGeneral/UIFrameMetalHorizontal.PNG`
- `FrameGeneral/UIFrameMetalVertical.PNG`
- `PaperDoll/UI-PaperDollBackground-L1.PNG`
- `PaperDoll/UI-PaperDollBackground-L2.PNG`
- `PaperDoll/UI-PaperDollBackground-R1.PNG`
- `PaperDoll/UI-PaperDollBackground-R2.PNG`
- `COMMON/portrait-ring-withbg.PNG`
- `COMMON/GoldRing.PNG`
- `DialogFrame/UI-DialogBox-Gold-Header.PNG`
- `Buttons/UI-DialogBox-Button-Up.PNG`
- `Buttons/UI-DialogBox-Button-Down.PNG`
- `Buttons/UI-DialogBox-Button-Highlight.PNG`
- `Buttons/UI-ActionButton-Border.PNG`
- `Buttons/UI-EmptySlot.PNG`
- `Buttons/ButtonHilight-Square.PNG`
- `ItemTextFrame/Book.PNG`
- `MainMenuBar/MainMenuBar.PNG`
- `MainMenuBar/UI-MainMenuBar-EndCap-Dwarf.PNG`
- `SPELLBOOK/Spellbook-Page-1.PNG`
- `SPELLBOOK/Spellbook-Page-2.PNG`

World Map / quest-journal additions from the same commit (original PNG bytes,
renamed only):

| Local file | Source path | Source size | Usable artwork / notes |
| --- | --- | --- | --- |
| `map-parchment-tile.png` | `AdventureMap/AdventureMapParchmentTile.PNG` | 512×512 | Seamless parchment tile; repeat at native scale. |
| `world-map-small-left.png` | `WorldMap/UI-WorldMapSmall-Left.PNG` | 512×512 | Left/top/bottom map frame, visible y=0–439; bottom 72 px are transparent. |
| `world-map-small-right.png` | `WorldMap/UI-WorldMapSmall-Right.PNG` | 128×512 | Right/top/bottom map frame, visible x=0–80 and y=0–439; remaining right/bottom pixels are transparent. |
| `frame-gold-corners.png` | `COMMON/UI-Goldborder.PNG` | 256×128 | Corner atlas, not a whole-frame background. |
| `frame-gold-vertical.png` | `COMMON/UI-Goldborder-!tile.PNG` | 128×128 | Repeatable vertical gold trim in the left edge of the atlas. |
| `frame-gold-horizontal.png` | `COMMON/UI-Goldborder-_tile.PNG` | 256×64 | Repeatable horizontal gold trim in the top edge of the atlas. |
| `dark-gold-button-up.png` | `COMMON/dark-goldframe-button.PNG` | 128×32 | Dark button normal state; visible y=4–27, with 4 px transparency above and below. |
| `dark-gold-button-down.png` | `COMMON/dark-goldframe-button-pressed.PNG` | 128×32 | Dark button pressed state; same bounds. |
| `quest-tab-left.png` | `QUESTFRAME/UI-QuestLogSortTab-Left.PNG` | 8×32 | Left end of a quest-log tab; visible y=6–31. |
| `quest-tab-middle.png` | `QUESTFRAME/UI-QuestLogSortTab-Middle.PNG` | 64×32 | Tile/stretch the middle of the tab; visible y=6–31. |
| `quest-tab-right.png` | `QUESTFRAME/UI-QuestLogSortTab-Right.PNG` | 8×32 | Right end of a quest-log tab; visible y=6–31. |

Do not stretch the full 512×512 / 128×512 map-frame bitmaps to fit a component:
their transparent padding and decorative edges must be cropped or assembled as
separate edge layers. Likewise, crop the transparent 4 px above and below the
new dark-gold button sprites rather than vertically stretching them. The older
red dialog-button sprites in this directory have different visible bounds:
y=0–22, with 9 px transparency below.
