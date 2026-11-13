# Game interface textures in the Forever talent calculator

World of Warcraft interface textures (Blizzard Entertainment), cut from the mirror
https://github.com/Gethe/wow-ui-textures, branch `live`, commit `d23deaf8f44a7d280dc974a5c9d5321c013db59b`
(patch 9.2.7). Local archive: `/home/debian/wow-assets/wow-ui-textures`.

## `trees/` — the backdrop of each talent tree

The classic talent frame keeps a tree's backdrop in four quarters, `TALENTFRAME/<Name>-TopLeft.PNG` (256×256),
`-TopRight` (64×256), `-BottomLeft` (256×128) and `-BottomRight` (64×128). They are put back together (320×384), cut to
the painted part (300×331 from the top left corner), enlarged twice (Lanczos) and saved as WebP, quality 76: 600×662.
Not retouched or recoloured. Used by `components/wow/forever/talents/talentArt.ts` as `<class>-<tree>.webp`.

| File | Archive name (`TALENTFRAME/…-TopLeft.PNG` and three more) |
| --- | --- |
| `warrior-arms.webp`, `warrior-fury.webp`, `warrior-protection.webp` | `WarriorArms`, `WarriorFury`, `WarriorProtection` |
| `paladin-holy.webp`, `paladin-protection.webp`, `paladin-retribution.webp` | `PALADINHOLY`, `PALADINPROTECTION`, `PALADINCOMBAT` |
| `hunter-beast-mastery.webp`, `hunter-marksmanship.webp`, `hunter-survival.webp` | `HunterBeastMastery`, `HunterMarksmanship`, `HunterSurvival` |
| `rogue-assassination.webp`, `rogue-combat.webp`, `rogue-subtlety.webp` | `RogueAssassination`, `RogueCombat`, `RogueSubtlety` |
| `priest-discipline.webp`, `priest-holy.webp`, `priest-shadow.webp` | `PriestDiscipline`, `PriestHoly`, `PriestShadow` |
| `shaman-elemental.webp`, `shaman-enhancement.webp`, `shaman-restoration.webp` | `ShamanElementalCombat`, `ShamanEnhancement`, `ShamanRestoration` |
| `mage-arcane.webp`, `mage-fire.webp`, `mage-frost.webp` | `MageArcane`, `MageFire`, `MageFrost` |
| `warlock-affliction.webp`, `warlock-demonology.webp`, `warlock-destruction.webp` | `WarlockCurses`, `WarlockSummoning`, `WarlockDestruction` |
| `druid-balance.webp`, `druid-feral-combat.webp`, `druid-restoration.webp` | `DruidBalance`, `DruidFeralCombat`, `DruidRestoration` |

Looked at and not taken: the cell frames, rank border and arrows of the same folder (`TalentFrame-Parts.PNG`,
`TalentFrame-RankBorder.PNG`, `UI-TalentArrows.PNG`, `UI-TalentBranches.PNG`) are 32–64 px sprites and blur on a
2× screen, so the frame of a cell, its rank and the arrows are drawn in CSS on the theme tokens; the later
`bg-<class>-<spec>.PNG` backdrops (512×360) show characters of a later expansion.
