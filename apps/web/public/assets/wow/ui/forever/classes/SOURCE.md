# Game interface textures on the Forever class pages

World of Warcraft interface textures (Blizzard Entertainment), cut from the mirror
https://github.com/Gethe/wow-ui-textures, branch `live`, commit `d23deaf8f44a7d280dc974a5c9d5321c013db59b`
(patch 9.2.7). Local archive: `/home/debian/wow-assets/wow-ui-textures`.

## `trees/` — the classic paintings of the talent trees

The background of each talent tree as the game draws it behind the tree: four quarters (256 × 256, 64 × 256,
256 × 128, 64 × 128) joined into one 320 × 384 sheet. The painting fills 300 × 331 of the sheet; its soft dark rim is
cut (284 × 315 at 8,8), the picture is doubled to 568 × 630 (Lanczos, light sharpen) and saved as WebP, quality 74.
Used as the art of the tree cards on `/wow/forever/classes/<class>` (components/wow/forever/classes/classParts.tsx).
Script: `/home/debian/gildra-forever-design-20261113/classes/tools/export-trees.cjs`.

| File | Archive paths |
| --- | --- |
| `druid-balance.webp` | `TALENTFRAME/DruidBalance-TopLeft.PNG`, `TALENTFRAME/DruidBalance-TopRight.PNG`, `TALENTFRAME/DruidBalance-BottomLeft.PNG`, `TALENTFRAME/DruidBalance-BottomRight.PNG` |
| `druid-feral-combat.webp` | `TALENTFRAME/DruidFeralCombat-TopLeft.PNG`, `TALENTFRAME/DruidFeralCombat-TopRight.PNG`, `TALENTFRAME/DruidFeralCombat-BottomLeft.PNG`, `TALENTFRAME/DruidFeralCombat-BottomRight.PNG` |
| `druid-restoration.webp` | `TALENTFRAME/DruidRestoration-TopLeft.PNG`, `TALENTFRAME/DruidRestoration-TopRight.PNG`, `TALENTFRAME/DruidRestoration-BottomLeft.PNG`, `TALENTFRAME/DruidRestoration-BottomRight.PNG` |
| `hunter-beast-mastery.webp` | `TALENTFRAME/HunterBeastMastery-TopLeft.PNG`, `TALENTFRAME/HunterBeastMastery-TopRight.PNG`, `TALENTFRAME/HunterBeastMastery-BottomLeft.PNG`, `TALENTFRAME/HunterBeastMastery-BottomRight.PNG` |
| `hunter-marksmanship.webp` | `TALENTFRAME/HunterMarksmanship-TopLeft.PNG`, `TALENTFRAME/HunterMarksmanship-TopRight.PNG`, `TALENTFRAME/HunterMarksmanship-BottomLeft.PNG`, `TALENTFRAME/HunterMarksmanship-BottomRight.PNG` |
| `hunter-survival.webp` | `TALENTFRAME/HunterSurvival-TopLeft.PNG`, `TALENTFRAME/HunterSurvival-TopRight.PNG`, `TALENTFRAME/HunterSurvival-BottomLeft.PNG`, `TALENTFRAME/HunterSurvival-BottomRight.PNG` |
| `mage-arcane.webp` | `TALENTFRAME/MageArcane-TopLeft.PNG`, `TALENTFRAME/MageArcane-TopRight.PNG`, `TALENTFRAME/MageArcane-BottomLeft.PNG`, `TALENTFRAME/MageArcane-BottomRight.PNG` |
| `mage-fire.webp` | `TALENTFRAME/MageFire-TopLeft.PNG`, `TALENTFRAME/MageFire-TopRight.PNG`, `TALENTFRAME/MageFire-BottomLeft.PNG`, `TALENTFRAME/MageFire-BottomRight.PNG` |
| `mage-frost.webp` | `TALENTFRAME/MageFrost-TopLeft.PNG`, `TALENTFRAME/MageFrost-TopRight.PNG`, `TALENTFRAME/MageFrost-BottomLeft.PNG`, `TALENTFRAME/MageFrost-BottomRight.PNG` |
| `paladin-holy.webp` | `TALENTFRAME/PALADINHOLY-TOPLEFT.PNG`, `TALENTFRAME/PALADINHOLY-TOPRIGHT.PNG`, `TALENTFRAME/PALADINHOLY-BOTTOMLEFT.PNG`, `TALENTFRAME/PALADINHOLY-BOTTOMRIGHT.PNG` |
| `paladin-protection.webp` | `TALENTFRAME/PALADINPROTECTION-TOPLEFT.PNG`, `TALENTFRAME/PALADINPROTECTION-TOPRIGHT.PNG`, `TALENTFRAME/PALADINPROTECTION-BOTTOMLEFT.PNG`, `TALENTFRAME/PALADINPROTECTION-BOTTOMRIGHT.PNG` |
| `paladin-retribution.webp` | `TALENTFRAME/PALADINCOMBAT-TOPLEFT.PNG`, `TALENTFRAME/PALADINCOMBAT-TOPRIGHT.PNG`, `TALENTFRAME/PALADINCOMBAT-BOTTOMLEFT.PNG`, `TALENTFRAME/PALADINCOMBAT-BOTTOMRIGHT.PNG` |
| `priest-discipline.webp` | `TALENTFRAME/PriestDiscipline-TopLeft.PNG`, `TALENTFRAME/PriestDiscipline-TopRight.PNG`, `TALENTFRAME/PriestDiscipline-BottomLeft.PNG`, `TALENTFRAME/PriestDiscipline-BottomRight.PNG` |
| `priest-holy.webp` | `TALENTFRAME/PriestHoly-TopLeft.PNG`, `TALENTFRAME/PriestHoly-TopRight.PNG`, `TALENTFRAME/PriestHoly-BottomLeft.PNG`, `TALENTFRAME/PriestHoly-BottomRight.PNG` |
| `priest-shadow.webp` | `TALENTFRAME/PriestShadow-TopLeft.PNG`, `TALENTFRAME/PriestShadow-TopRight.PNG`, `TALENTFRAME/PriestShadow-BottomLeft.PNG`, `TALENTFRAME/PriestShadow-BottomRight.PNG` |
| `rogue-assassination.webp` | `TALENTFRAME/RogueAssassination-TopLeft.PNG`, `TALENTFRAME/RogueAssassination-TopRight.PNG`, `TALENTFRAME/RogueAssassination-BottomLeft.PNG`, `TALENTFRAME/RogueAssassination-BottomRight.PNG` |
| `rogue-combat.webp` | `TALENTFRAME/RogueCombat-TopLeft.PNG`, `TALENTFRAME/RogueCombat-TopRight.PNG`, `TALENTFRAME/RogueCombat-BottomLeft.PNG`, `TALENTFRAME/RogueCombat-BottomRight.PNG` |
| `rogue-subtlety.webp` | `TALENTFRAME/RogueSubtlety-TopLeft.PNG`, `TALENTFRAME/RogueSubtlety-TopRight.PNG`, `TALENTFRAME/RogueSubtlety-BottomLeft.PNG`, `TALENTFRAME/RogueSubtlety-BottomRight.PNG` |
| `shaman-elemental.webp` | `TALENTFRAME/ShamanElementalCombat-TopLeft.PNG`, `TALENTFRAME/ShamanElementalCombat-TopRight.PNG`, `TALENTFRAME/ShamanElementalCombat-BottomLeft.PNG`, `TALENTFRAME/ShamanElementalCombat-BottomRight.PNG` |
| `shaman-enhancement.webp` | `TALENTFRAME/ShamanEnhancement-TopLeft.PNG`, `TALENTFRAME/ShamanEnhancement-TopRight.PNG`, `TALENTFRAME/ShamanEnhancement-BottomLeft.PNG`, `TALENTFRAME/ShamanEnhancement-BottomRight.PNG` |
| `shaman-restoration.webp` | `TALENTFRAME/ShamanRestoration-TopLeft.PNG`, `TALENTFRAME/ShamanRestoration-TopRight.PNG`, `TALENTFRAME/ShamanRestoration-BottomLeft.PNG`, `TALENTFRAME/ShamanRestoration-BottomRight.PNG` |
| `warlock-affliction.webp` | `TALENTFRAME/WarlockCurses-TopLeft.PNG`, `TALENTFRAME/WarlockCurses-TopRight.PNG`, `TALENTFRAME/WarlockCurses-BottomLeft.PNG`, `TALENTFRAME/WarlockCurses-BottomRight.PNG` |
| `warlock-demonology.webp` | `TALENTFRAME/WarlockSummoning-TopLeft.PNG`, `TALENTFRAME/WarlockSummoning-TopRight.PNG`, `TALENTFRAME/WarlockSummoning-BottomLeft.PNG`, `TALENTFRAME/WarlockSummoning-BottomRight.PNG` |
| `warlock-destruction.webp` | `TALENTFRAME/WarlockDestruction-TopLeft.PNG`, `TALENTFRAME/WarlockDestruction-TopRight.PNG`, `TALENTFRAME/WarlockDestruction-BottomLeft.PNG`, `TALENTFRAME/WarlockDestruction-BottomRight.PNG` |
| `warrior-arms.webp` | `TALENTFRAME/WarriorArms-TopLeft.PNG`, `TALENTFRAME/WarriorArms-TopRight.PNG`, `TALENTFRAME/WarriorArms-BottomLeft.PNG`, `TALENTFRAME/WarriorArms-BottomRight.PNG` |
| `warrior-fury.webp` | `TALENTFRAME/WarriorFury-TopLeft.PNG`, `TALENTFRAME/WarriorFury-TopRight.PNG`, `TALENTFRAME/WarriorFury-BottomLeft.PNG`, `TALENTFRAME/WarriorFury-BottomRight.PNG` |
| `warrior-protection.webp` | `TALENTFRAME/WarriorProtection-TopLeft.PNG`, `TALENTFRAME/WarriorProtection-TopRight.PNG`, `TALENTFRAME/WarriorProtection-BottomLeft.PNG`, `TALENTFRAME/WarriorProtection-BottomRight.PNG` |

Looked at and left: `TALENTFRAME/bg-<class>-<spec>.PNG` (512 px spec paintings of a later expansion) show its playable
races (worgen, draenei), so the classic tree paintings were taken instead.
