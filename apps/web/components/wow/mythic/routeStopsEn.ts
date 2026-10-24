import type { DungeonSlug } from "./dungeonRoutes";

export type StopEn = {
  title: string;
  subtitle: string;
  summary: string;
  callouts: string[];
  tank?: string;
  healer?: string;
  dps?: string;
};

export type DungeonEn = { description: string; location: string; floors: string[]; stops: StopEn[] };

/** English versions of the role notes `buildStops` falls back to when a seed has no tank/healer/dps text. */
export const routeRoleDefaultsEn = {
  tank: "Stack enemies tightly, turn dangerous frontals away from the group and move to the next position only once the pull is under control.",
  healer: "Watch the marked targets, prepare healing ahead of group damage and dispel dangerous effects as assigned.",
  dps: "Hit the priority target, don't double up on interrupts and save crowd control for the marked dangerous ability.",
} as const;

/** English text of the Mythic+ routes, aligned with dungeonRoutes[slug].stops by index (translated from the Russian source). */
export const routeTextEn: Record<DungeonSlug, DungeonEn> = {
  "ruby-life-pools": {
    description: "Defeat three bosses, reach 100% enemy forces and finish the route before the timer runs out.",
    location: "Dragon Isles",
    floors: ["Lower", "Upper"],
    stops: [
      {
        title: "Entrance pack",
        subtitle: "Chillweaver + whelps",
        summary: "Safe start: gather the mobs at the entrance, but don't drag them through the eggs — extra Infused Whelps quickly overload the tank with cold stacks.",
        callouts: ["Don't step on the egg clutches.", "First Ice Shield — mage, second — hunter.", "Dispel Cold Claws before 20 stacks."],
        tank: "Gather the mobs facing away from the group and don't cross the eggs.",
        healer: "Watch Cold Claws on the tank and dispel it before the freeze.",
        dps: "Ice Shield matters more than Frostbolt; don't wake extra eggs.",
      },
      {
        title: "Incubation Hall",
        subtitle: "Earthshaper + Guardian",
        summary: "A dense pack in the western part of the hall. The earth strikes and the personal debuff can line up, so don't drag the fight out.",
        callouts: ["Spread before Tectonic Slam.", "The player with Imprint uses a personal defensive.", "Don't pull the Guardian out of cleave."],
        tank: "Don't take two Tectonic Strikes without an active defensive.",
        healer: "Top up the Earthbound's Imprint target before the next hit.",
        dps: "Focus the Earthshapers; spare interrupts go on Stone Missile.",
      },
      {
        title: "Double Juggernaut",
        subtitle: "Dangerous large pull",
        summary: "The hardest trash on the first floor. Stack the pack for AoE crowd control, but keep group defensives for Excavating Blast.",
        callouts: ["Bloodlust once the packs are gathered.", "Don't stand in the Excavating Blast circles.", "The tank alternates mitigation on Smash."],
        tank: "Gather both Juggernauts and don't move them unless you have to.",
        healer: "Group cooldown on the second Excavating Blast.",
        dps: "Use AoE crowd control before Bloodlust and kill the Chillweaver fast.",
      },
      {
        title: "Defier Draghar",
        subtitle: "Required mini-boss",
        summary: "Required guardian before Melidrussa. Stand by the wall to bait a short Blazing Rush, and don't cross the molten shards.",
        callouts: ["Stack at the wall for a short Rush.", "Big tank cooldown for Steel Barrage.", "Don't cross the Molten Steel shards."],
        tank: "Big defensive for the whole Steel Barrage channel.",
        healer: "Steel Barrage hits both the tank and the group — heal ahead of it.",
        dps: "Stand at the wall, then step aside out of the Blazing Rush line.",
      },
      {
        title: "Melidrussa Chillworn",
        subtitle: "Boss 1",
        summary: "Bait Hailburst together, then move around the room. At 66% and 33% health, kill the whelps and break Ice Bulwark to stop Frost Overload.",
        callouts: ["Move Chillstorm away from allies and resist its pull.","Save damage for the shields at 66% and 33% health."],
        tank: "Gather the whelps near the boss and help interrupt Frigid Shard.",
        healer: "Use healing cooldowns for Chillstorm and Frost Overload; dispel Cold Claws before it builds up.",
        dps: "Rotate Frigid Shard interrupts. Break Ice Bulwark quickly while cleaving the whelps.",
      },
      {
        title: "Flight to Ruby Overlook",
        subtitle: "Radiant Drake · travel",
        summary: "After the boss, activate the Radiant Drake and fly to the upper platform. Update marks and interrupt assignments during the flight.",
        callouts: ["All five players mount the drake.", "Refresh the Skull/Cross marks.", "Start the next pack once the healer is ready."],
        tank: "Check the group is ready before the next pack.",
        healer: "Regenerate mana before landing.",
        dps: "Don't start the upper pack before the tank.",
      },
      {
        title: "First Destroyer",
        subtitle: "Cinderweaver + Scorchlings",
        summary: "The first of four required Destroyers. Take Living Bomb out of the group and move away early before the Burnout explosion.",
        callouts: ["Take Living Bomb to the side.", "Defensives for Inferno.", "When the Destroyer dies, move 20 yards away."],
        tank: "Keep the Destroyer still and be ready for Fiery Blast.",
        healer: "Top the group up before Inferno and its follow-up DoT.",
        dps: "Interrupt Cinderbolt; everyone gets out of Burnout.",
      },
      {
        title: "Thunderhead",
        subtitle: "Lieutenant + second Destroyer",
        summary: "Face the drake away from the group. Dispel Rolling Thunder one at a time: an early double dispel causes lethal overlapping damage.",
        callouts: ["Thunderhead always faces away from the group.", "Dispel one Rolling Thunder, hold the second.", "Don't overlap Inferno with the double burst."],
        tank: "Mitigation for Thunder Jaw, and don't aim Storm Breath at the group.",
        healer: "Stagger the two Rolling Thunders.",
        dps: "Destroyer first, then Thunderhead; save your personal defensives.",
      },
      {
        title: "Flamegullet",
        subtitle: "Lieutenant + Flamelasher",
        summary: "Save damage for Flamegullet at 50% health: Molten Blood quickly ramps up group damage. Stop Ashseer Flamelasher's Flaming Barrage with crowd control.",
        callouts: ["Stop Flaming Barrage and purge Blaze of Glory.", "At 50%, all cooldowns into Flamegullet.", "Don't stand in front of the drake."],
        tank: "Strong defensive for Fire Maw; turn Flame Breath away.",
        healer: "Use the pre-assigned group cooldown on Molten Blood; purge Blaze of Glory.",
        dps: "Don't spend burst before 50%; stop Flaming Barrage with crowd control.",
      },
      {
        title: "Ring of Fire",
        subtitle: "Destroyer 3–4",
        summary: "Finish the last two Destroyers in separate waves. Watch for Burnout and don't stand in Blaze of Glory after a Flamelasher dies.",
        callouts: ["Don't pull both Destroyers at once.", "Purge Blaze of Glory.", "Get out of Burnout after each death."],
        tank: "Keep the second group out of combat until the first Destroyer is dead.",
        healer: "Split cooldowns across the two Infernos.",
        dps: "Interrupt Fiery Blast and stop Flaming Barrage; don't stay in melee on death.",
      },
      {
        title: "Kokia Blazehoof",
        subtitle: "Boss 2",
        summary: "The Ritual of Blazebinding target moves clear of allies while keeping the spawned add accessible. Kill it quickly and bait Molten Boulder away from the group’s next position.",
        callouts: ["Interrupt every Blaze Volley.","Move away before the add dies and explodes."],
        tank: "Bring the boss near the Firestorm for cleave; use a defensive on each Searing Blows.",
        healer: "Prepare healing cooldowns for Inferno from each summoned add.",
        dps: "Focus the add, interrupt Blaze Volley and leave its Burnout explosion.",
      },
      {
        title: "Descent to the temple",
        subtitle: "Storm Warrior pack",
        summary: "On the stairs, melee step away from Thunderous Stomp while ranged stay close, so the pack doesn't spread out and the next group isn't pulled.",
        callouts: ["Melee move out for Thunderous Stomp.", "First Flashfire interrupt — mage.", "Don't knock mobs down the stairs."],
        tank: "Gather the pack against the inner wall of the stairs.",
        healer: "Watch for players who stayed in Thunderous Stomp.",
        dps: "Flashfire is the main interrupt; avoid Thunderous Stomp by moving.",
      },
      {
        title: "Storm Channels",
        subtitle: "Channeler + Thundercloud",
        summary: "Purge Stormcloud Barrier off the summoned Thundercloud and stagger group defensives for Lightning Storm.",
        callouts: ["Interrupts by Skull/Cross marks.", "Purge Stormcloud Barrier immediately.", "Personal defensives for Lightning Storm."],
        tank: "Pick up the summoned Thundercloud as soon as it spawns.",
        healer: "Purge Barrier and prepare healing for Lightning Storm.",
        dps: "Don't double up on interrupts; swap to the Thundercloud fast.",
      },
      {
        title: "High Channeler Ryvati",
        subtitle: "Final mini-boss",
        summary: "The last percent of the route. Never let Shock Blast through, break Tempest Stormshield immediately, and the tank picks up the summoned Thundercloud.",
        callouts: ["Shock Blast — interrupt at all costs.", "Break the shield immediately.", "Check enemy forces before the final boss."],
        tank: "Pick up the Thundercloud right after the Summon.",
        healer: "Group cooldown for Lightning Storm, purge Barrier.",
        dps: "Save damage for Tempest Stormshield and don't miss Shock Blast.",
      },
      {
        title: "Kyrakka and Erkhart",
        subtitle: "Final boss",
        summary: "Drop fire at the edge and track the wind: it moves players and puddles. Phase two starts when either boss reaches 50% health; save damage and defensives, then finish Kyrakka first.",
        callouts: ["Avoid Kyrakka’s frontal breath.","Stop casting before Interrupting Cloudburst.","Place fire so the next wind pushes it away from the party."],
        tank: "Bring Erkhart near Kyrakka when she lands. Use defensives for Stormslam.",
        healer: "Dispel the Stormslam magic debuff before the next hit. Save healing cooldowns for phase two.",
        dps: "Finish Kyrakka first in phase two. Stop casting before Interrupting Cloudburst and move fire away from allies.",
      },
    ],
  },

  "altar-of-fangs": {
    description: "Fight through the ritual halls, stop the mutations and disrupt Zul'jan's final ritual.",
    location: "The Coiled Isle",
    floors: ["Altar"],
    stops: [
      {
        title: "Sacrificial Approach",
        subtitle: "Primal Serpents + Harrowers",
        summary: "The opening corridor tests your interrupt rotation and poison dispels. Gather the serpents at the first pillar and don't let two Piercing Hiss casts go off at once.",
        callouts: ["Interrupt Piercing Hiss by marks.", "Dispel Paralyzing Shots immediately.", "Don't stand in front of the harpooners."],
      },
      {
        title: "Ravenous Descendants",
        subtitle: "Ravenous Descendants",
        summary: "The Descendants ramp up their attack speed quickly. A short stun or kiting the enemy away resets the dangerous tempo and saves the tank's defensives.",
        callouts: ["Stun a Descendant as its attacks ramp up.", "Don't let two Blood Frenzy buffs overlap.", "After the crowd control, finish off the marked target."],
      },
      {
        title: "Totem Courtyard",
        subtitle: "Activate the ancient totems",
        summary: "Clear both sides of the courtyard and activate all the totems. Fight the last group closer to the boss gate so you don't lose time walking.",
        callouts: ["Activate all totems after the fight.", "Regroup at the gate after the clear."],
      },
      {
        title: "Rav'i",
        subtitle: "Boss 1",
        summary: "Move the boss away from Fresh Meat, spread for Triple Shot and walk between the Regurgitate waves. During Ssscavenging, soak the orbs and break the shield quickly.",
        callouts: ["Keep the boss away from the meat chunks.", "Triple Shot — spread out.", "Put all available damage into the shield."],
        tank: "Move the boss to a clear bone pile, away from meat.",
        healer: "Cleanse disease after Regurgitate; prepare for Ravenous Stomp.",
        dps: "Soak orbs and break the shield quickly; spread Triple Shot.",
      },
      {
        title: "Mutation Chambers",
        subtitle: "High Evolutionists",
        summary: "Don't let Evolve finish. Break the empowered Evolutionist's shield first, then use crowd control on the next mutation attempt.",
        callouts: ["Stop Evolve with crowd control.", "Break the empowered Evolutionist's shield first.", "Dispel poisons one at a time."],
      },
      {
        title: "Incubation Hall",
        subtitle: "Writhe + Evolutionists",
        summary: "A big pack before the second boss. Stagger crowd control on Evolve without dragging enemies into the next room.",
        callouts: ["Don't spend both AoE crowd controls together.", "Finish the fight before entering the boss room."],
      },
      {
        title: "The Writhing Coil",
        subtitle: "Boss 2",
        summary: "Assign all three Toxic Atrophy interrupts. On Death Rattle, each player runs away to break their tether, then gather the spawned snakes for cleave damage.",
        callouts: ["Three Toxic Atrophy casts — three assigned interrupts.", "Everyone runs on Death Rattle.", "Damage to the spawned snakes is mirrored to the boss. Dodge their shockwave lines when they return to the centre."],

    tank: "Avoid Burrowing Charge; prepare protection for Tail Scythe.",
    healer: "Prepare healing for Synchronized Venom and phase transitions.",
    dps: "Assign three Toxic Atrophy interrupts; break tethers, then kill copies.",
  },
      {
        title: "Ascendant Guardian",
        subtitle: "Ascendant Serpent",
        summary: "Required guardian after the second boss. Move the rings to the edge, interrupt Mass Envenom and save a group defensive for the second wave.",
        callouts: ["Don't let Mass Envenom through.", "Drop the rings at the outer wall."],
      },
      {
        title: "The Last Ritual",
        subtitle: "Ula'tek's Chosen",
        summary: "The last enemy forces. Interrupt Mass Envenom, spread the poison lines and don't step onto the altar until the group has recovered.",
        callouts: ["Check enemy forces before the final boss.", "Restore resources before the boss."],
      },
      {
        title: "Zul'jan",
        subtitle: "Final boss",
        summary: "Assign four positions for Ritual of the Fang in advance. Intercept the beams, clear Ritual Venom stacks with Boneslicer and dodge the returning glaives.",
        callouts: ["Assigned players block the four beams.", "Boneslicer removes all poison stacks.", "Mind Axegrinder's return path."],

    tank: "Defend against Chop Down; keep the boss out of pools.",
    healer: "Support beam interceptors and Ritual Venom targets.",
    dps: "Cover your assigned beam; clear venom with physical damage and leave pools.",
  },
    ],
  },

  "murder-row": {
    description: "Clear Silvermoon's underground quarter and stop Lithiel Cinderfury's ritual.",
    location: "Silvermoon",
    floors: ["Alley"],
    stops: [
      {
        title: "Smugglers' Entrance",
        subtitle: "Felonious crew",
        summary: "Gather the first patrol at the wall and grab the fel crystal after the fight. Fel Missiles and Seduction need separate interrupts.",
        callouts: ["Assign a separate interrupt to Seduction.", "Grab the crystal after the fight.", "Aim frontals at the wall."],
      },
      {
        title: "Fel Market",
        subtitle: "Mages + smugglers",
        summary: "The two groups can be pulled together when the team's big cooldowns are up. Fel Missiles clones must be interrupted and killed quickly.",
        callouts: ["Kill the mage clones immediately.", "Don't spread far from the tank."],
      },
      {
        title: "Kystia Manaheart",
        subtitle: "Boss 1",
        summary: "Focus Nibbles until he becomes friendly at 20% health and exposes Kystia. Interrupt or crowd-control each Mirror Image to remove it; save damage cooldowns for Destabilized.",
        callouts: ["Interrupt the Mirror Images specifically.", "Main damage goes into Destabilized.", "Each image disappears when interrupted or crowd-controlled."],

    tank: "Face Nibbles away from the group and move out of the rotating Fel Spray.",
    healer: "Dispel Corroding Spittle promptly. Prepare group healing for Destabilized and help crowd-control the images.",
    dps: "Damage Nibbles to remove the shield; interrupt images, then exploit Destabilized.",
  },
      {
        title: "Contraband Warehouse",
        subtitle: "Barrels + freight",
        summary: "Leave one barrel intact for the next boss's mechanic. Sources don't confirm separate NPC entries for the porters and smugglers of this draft pull.",
        callouts: ["Save one barrel.", "Destroy the fel cargo first."],
      },
      {
        title: "Zaen Bladesorrow",
        subtitle: "Boss 2",
        summary: "Aim Fire Bomb into Fel-Infused Freight. For Murder in a Row, each player hides behind a separate barrel until the volley ends.",
        callouts: ["Check available cover before each volley.","Stay out of the firing line."],

    tank: "Keep a barrel available for every Murder in a Row.",
    healer: "Prepare for Killing Spree; cleanse the tank’s poison.",
    dps: "Aim Fire Bomb into freight while preserving required cover.",
  },
      {
        title: "Guard Barracks",
        subtitle: "Wrathguards",
        summary: "Never let Fel Rage through: the empowered guard gains significant damage reduction. Turn the wide swings away from the stairs and keep the group together.",
        callouts: ["Fel Rage is the main interrupt.", "Health Funnel must not go through.", "Face the guards away from the group."],
      },
      {
        title: "Xathuux the Annihilator",
        subtitle: "Boss 3",
        summary: "Place Axe Toss next to the boss, avoid Legion Strike and lead Xathuux along the outer edge during Demonic Rage.",
        callouts: ["Drop the axes in close.", "Lead the boss along the outer edge.", "Don't cross the Demonic Rage trail."],

    tank: "Face Legion Strike away from allies; keep a clear arena edge.",
    healer: "Prepare healing and protection for Demonic Rage.",
    dps: "Place Axe Toss nearby and destroy axes; spread Infernal Crush.",
  },
      {
        title: "Demonic Quarter",
        subtitle: "Invokers + flayers",
        summary: "Interrupt order matters more than damage. Stop Health Funnel first, then Fel Rage; gather the summoned demons into the shared damage zone.",
        callouts: ["Interrupt Health Funnel first.", "Bring the summoned demons to the guards.", "Personal defensives for Vile Eruption."],
      },
      {
        title: "Cursed Freight",
        subtitle: "Freight gauntlet",
        summary: "Move down the corridor in small pulls. The makeup of this draft pull is hidden until the NPC IDs are checked against the source.",
        callouts: ["Mark the mages with Skull.", "Don't fall behind while moving."],
      },
      {
        title: "Lithiel's Landing",
        subtitle: "Last guard",
        summary: "The last enemy forces come in two waves. Save AoE crowd control for the second pair of casters and finish the fight with a group defensive ready.",
        callouts: ["Split the guards into two waves.", "Second wave — AoE crowd control.", "Check enemy forces before the final boss."],
      },
      {
        title: "Lithiel Cinderfury",
        subtitle: "Final boss",
        summary: "Spread Fingers of Gul’dan while keeping spawned imps close for cleave. Use the gates after Malefic Wave begins and check the exit first.",
        callouts: ["The Vilefiend dies before the next ring.", "Stack before Fingers of Gul'dan.", "Go through Malefic Wave via the gates."],

    tank: "Move Infernal away from the group and gates.",
    healer: "Recover before Malefic Wave; watch add spawns.",
    dps: "Interrupt Chaos Bolt; destroy Vilefiend and other adds.",
  },
    ],
  },

  "den-of-nalorakk": {
    description: "Gather supplies, survive the eternal winter and prove your strength before the loa of war.",
    location: "Zul'Aman",
    floors: ["Dream"],
    stops: [
      {
        title: "Gatherers' Camp",
        subtitle: "Gather supplies",
        summary: "Collect resources for the trial and crowd-control the birds. Healing Breeze heals the whole enemy pack, so it's the first interrupt.",
        callouts: ["Interrupt Healing Breeze first.", "Pick up all the supplies after the fight."],
      },
      {
        title: "Hungry Spirit",
        subtitle: "Spirit of Hunger",
        summary: "Spirit of Hunger is dangerous to pull together with other strong enemies. Dispel Insatiable Hunger and don't let the spirit attack one target for long.",
        callouts: ["Pull Spirit of Hunger on its own.", "Dispel Insatiable Hunger immediately.", "Don't stand in the leap line."],
      },
      {
        title: "The Hoardmonger",
        subtitle: "Boss 1",
        summary: "At 90%, 70% and 40%, the boss takes the nearest supplies. Use meat, bones, then mushrooms. Soak Spoiled Supplies and avoid Earthshatter Slam.",
        callouts: ["Soak the mushrooms at the outer edge.", "Get out of the Earthshatter Slam cone.", "Dispel Toxic Spores after moving."],

    tank: "Before Resourceful, position the boss by the chosen supplies.",
    healer: "Cleanse Toxic Spores; prepare for empowered attacks.",
    dps: "Soak Spoiled Supplies and avoid Earthshatter Slam.",
  },
      {
        title: "Bridge of Winds",
        subtitle: "Rising Winds",
        summary: "Cross the bridge quickly and hide behind the rocks from Rising Winds. Turn the knockback enemies toward the wall.",
        callouts: ["Cross the bridge first, then start the fight.", "Hide behind the rocks from the wind.", "Aim knockbacks into the wall."],
      },
      {
        title: "Ice Cave",
        subtitle: "Glacial Revenants",
        summary: "Drop Snowdrift along one wall and dispel Cryo Surge only once the group is stable. Don't stand between two ice cores.",
        callouts: ["Drop puddles along one wall.", "Dispel Cryo Surge one at a time.", "Finish off the cores near the edge."],
      },
      {
        title: "Sentinel of Winter",
        subtitle: "Boss 2",
        summary: "Bait tornadoes together, then move. Kill cores and interrupt Winter’s Shroud. Use a snow pile to resist Frozen Tempest’s push.",
        callouts: ["Ice makes movement slide; move early.","Assign one player to each Rimeshatter."],

    tank: "Position the boss near a snow pile for Frozen Tempest.",
    healer: "Dispel Glacial Torment; prepare healing for Frozen Tempest.",
    dps: "Interrupt Winter’s Shroud; soak Rimeshatter after the core dies.",
  },
      {
        title: "Matriarch's Territory",
        subtitle: "Matriarch + beasttamers",
        summary: "Purge Mother's Wrath before the beasts link up, and don't drag the matriarch into the next pack.",
        callouts: ["Purge Mother's Wrath immediately.", "Don't drag the matriarch into the next pack."],
      },
      {
        title: "Amani Beasttamers",
        subtitle: "Beasttamer packs",
        summary: "The two beasttamer packs are safer to pull one at a time. Purge Bestial Wrath immediately; Arc Lightning needs its own interrupt.",
        callouts: ["Pull the packs one at a time.", "Interrupt Arc Lightning first."],
      },
      {
        title: "Path of the Trial",
        subtitle: "Stormbound final packs",
        summary: "The last enemy forces. Split Arc Lightning between two assignments and don't activate the arena until healing and defensives are ready.",
        callouts: ["Two assignments on Arc Lightning.", "Check enemy forces before the final boss.", "Restore resources before the arena."],
      },
      {
        title: "Nalorakk",
        subtitle: "Final boss",
        summary: "During Overwhelming Onslaught, everyone shelters behind Zul’jarra’s shield. During Fury of the War God, intercept echoes charging towards her.",
        callouts: ["Echoing Maul — at the edge.", "Assigned players intercept the bears.", "Share Forceful Slam with the tank."],

    tank: "Keep echoes away from your back. Return for Forceful Slam after knockback.",
    healer: "Prepare healing for three hits behind Zul’jarra’s shield.",
    dps: "Place Echoing Maul near existing echoes without clipping allies.",
  },
    ],
  },

  "the-blinding-vale": {
    description: "Carve a safe path through the Lightbloom and purge the vale of its corrupted guardians.",
    location: "Harandar",
    floors: ["Vale"],
    stops: [
      {
        title: "Lightbloom Path",
        subtitle: "Spellsowers + lashers",
        summary: "The opening fork lets you pick a side. On the safe route, interrupt Light Bolt Volley.",
        callouts: ["Interrupt Volley by marks.", "Take the left path."],
      },
      {
        title: "Garden of the Trinity",
        subtitle: "Kezkitt's attendants",
        summary: "Bring the three keepers to the center, but keep the way to the Lightblossom clear. Stop Disorienting Screech with any available crowd control.",
        callouts: ["Stop Screech with crowd control.", "Don't block the Lightblossom with puddles.", "Keep the keepers together."],
      },
      {
        title: "Lightblossom Trinity",
        subtitle: "Boss 1",
        summary: "Spread before Thornblade, move away from Fan Of Thorns and don't stand in the path of Lightsower Dash. Players must block the beams in the Lightblossom.",
        callouts: ["Block the beams inside the flower.", "After the teleport, get out of Fan Of Thorns immediately.", "Don't cross the dash line."],

    tank: "Take one Lightblossom beam and maintain protection.",
    healer: "Heal Thornblade targets while keeping them apart.",
    dps: "Interrupt Light Bolt; cover the other two beams.",
  },
      {
        title: "Blood Thicket",
        subtitle: "Sporeblight Belchers",
        summary: "For this pack, only the units and the ability that could be reliably matched to the source are listed.",
        callouts: ["Stop Screech with crowd control."],
      },
      {
        title: "Ikuzz the Light Hunter",
        subtitle: "Boss 2",
        summary: "After Verdant Stomp, get back to the center quickly. On Bloodthorn Roots stack up for AoE damage, and the Bloodthirsty Gaze target runs from the boss.",
        callouts: ["Stack together on the roots.", "The fixated player runs from the boss.", "Don't land in the thicket after the knockback."],

    tank: "Plan a safe return after Verdant Stomp’s knockback.",
    healer: "Prepare group healing for Thorn Roar.",
    dps: "Break Bloodthorn Roots; kite Bloodthirsty Gaze through roots.",
  },
      {
        title: "Radiant Pass",
        subtitle: "Petalwings + wardens",
        summary: "Stay inside the path and don't knock enemies into neighboring packs. Interrupt Light Bolt Volley and save crowd control for Disorienting Screech.",
        callouts: ["Stop Screech with AoE crowd control.", "Don't cut through the neighboring path."],
      },
      {
        title: "Spore Fields",
        subtitle: "Belchers + lashers",
        summary: "This pack's ability names are awaiting source verification and are not published in the tactical draft.",
        callouts: ["Ability verification for this pack is not complete."],
      },
      {
        title: "Lightwarden Ruia",
        subtitle: "Boss 3",
        summary: "Spread Lightfire, heal Grievous Thrash targets to full and stand still with the Pulverizing Strikes cones so the other players can move away.",
        callouts: ["Cone targets stand still, everyone else moves away.", "Grievous Thrash falls off at full health.", "Interrupt Warden's Wrath."],

    tank: "In bear form, defend against Mangling Claws.",
    healer: "Heal Grievous Thrash targets to full.",
    dps: "Interrupt Warden’s Wrath; move Lightfire out and keep cone directions steady.",
  },
      {
        title: "Blooming Hollow",
        subtitle: "Final vale packs",
        summary: "Clear the lower path in two pulls and save an AoE stun for the triple Screech.",
        callouts: ["Split the section into two pulls.", "AoE crowd control for the triple Screech.", "Belcher is the first target."],
      },
      {
        title: "Lightbloom Shore",
        subtitle: "Ziekket's sentries",
        summary: "The last guard before the final arena. Interrupt Lightspore Shot and finish the fight with defensives ready.",
        callouts: ["Lightspore Shot is the main interrupt.", "Check enemy forces before the final boss.", "Restore resources before the arena."],
      },
      {
        title: "Ziekket",
        subtitle: "Final boss",
        summary: "Intercept Lightbloom’s Essence before the boss and share the damage. Kill awakened adds, then destroy their bodies with Concentrated Lightbeam.",
        callouts: ["Soak the orbs as assigned.", "Kill the adds quickly.", "Aim the beam through their bodies."],

    tank: "Fight near the edge; aim Lightbeam through defeated adds.",
    healer: "Cover sustained damage and watch players collecting orbs.",
    dps: "Interrupt Lightspore Shot; kill adds and intercept orbs.",
  },
    ],
  },

  "voidscar-arena": {
    description: "Pick a buff, defeat the arena champions and master gravity in the final fight.",
    location: "Voidstorm",
    floors: ["Arena"],
    stops: [
      {
        title: "Fighters' Gate",
        subtitle: "Brawlers + magi",
        summary: "At the fork, the route takes the left path with the Versatility buff. Demoralizing Shout and Shadowbolt Volley need separate interrupts.",
        callouts: ["Take the left path: Versatility buff.", "Volley is the main interrupt.", "Dispel Melt Armor from the tank."],
      },
      {
        title: "Left Stands",
        subtitle: "Krolusks + tuskarr",
        summary: "Face Brutok into the wall, purge Bolster and interrupt Violent Sand. The Protective Turtle takes more damage once its shield drops.",
        callouts: ["Purge Bolster immediately.", "Finish the turtle after its shield."],
      },
      {
        title: "Taz'Rah",
        subtitle: "Boss 1",
        summary: "Spread the Nether Dash lines and don't cross other players' paths. Dark Bloom spawns orbs from every puddle — keep the center clear.",
        callouts: ["Fan out the Dash lines.", "Dark Bloom puddles — at the edge.", "Don't cross someone else's line."],

    tank: "Defend against Void Blast; keep the knockback path clear.",
    healer: "Support Nether Dash targets and the tank before Void Blast.",
    dps: "Spread lines near the edge, then dodge Dark Bloom orbs.",
  },
      {
        title: "Crossing the Arena",
        subtitle: "Screamers + voidscythes",
        summary: "Stop Mad Shriek at all costs and dispel Corrosive Essence from its target. Don't stand in the Voidscythe's line.",
        callouts: ["Don't let Mad Shriek through.", "Free the Devour target quickly.", "Dispel Corrosive Essence after the charge."],
      },
      {
        title: "Poison Ring",
        subtitle: "Tarasek + voidscythes",
        summary: "Gather the group in the middle of the ring, drop the poison zones around the outer edge and dispel Melt Armor before the next hit on the tank.",
        callouts: ["Poison zones — at the edge.", "Dispel Melt Armor before the next hit.", "Interrupt Volley first."],
      },
      {
        title: "Atroxus",
        subtitle: "Boss 2",
        summary: "Kill the Toxic Creeper fast after Monstrous Roar, get out of Poison Splash and dispel Mind-Numbing Poison only after moving to safety.",
        callouts: ["Toxic Creeper is the absolute priority.", "Drop puddles at the edge.", "Dispel the poison after leaving the danger zone."],

    tank: "Kite Toxic Creeper; keep protection ready for Hulking Claw.",
    healer: "Heal Poison Splash and cleanse Mind-Numbing Poison.",
    dps: "Kill Toxic Creeper immediately; dodge Noxious Breath.",
  },
      {
        title: "Void Menagerie",
        subtitle: "Brutalizers",
        summary: "Devouring Brutalizer tries to eat one of its allies to restore health. Kill the chosen victim before Devour finishes.",
        callouts: ["Kill the Devour victim first.", "Interrupt Shriek by mark."],
      },
      {
        title: "Hall of the Mind",
        subtitle: "Voidminders",
        summary: "Never let Mending Void through. Combine the two packs only if you have AoE crowd control, and assign two interrupts in advance.",
        callouts: ["Two assignments on Mending Void.", "AoE crowd control after gathering.", "The tank marks the next target."],
      },
      {
        title: "Cosmic Threshold",
        subtitle: "Final arena guards",
        summary: "The last enemy forces. Don't combine the two pairs of casters, and finish the fight with cooldowns ready for Charonus.",
        callouts: ["Pull the caster pairs separately.", "Check enemy forces before the final boss.", "Restore resources before the boss."],
      },
      {
        title: "Charonus",
        subtitle: "Final boss",
        summary: "Destroy orbs through Unstable Singularity. Spread for Cosmic Crash; the Void Cascade target moves away while others clear the projectile path.",
        callouts: ["Assign each orb its own singularity.", "Cosmic Crash — spread out.", "Kite Void Cascade in a circle."],

    tank: "Face Dark Waves away from allies and use protection.",
    healer: "Heal singularity damage and support orb targets.",
    dps: "Kite your Gravitic Orb into a singularity without touching it.",
  },
    ],
  },

  "kings-rest": {
    description: "Make your way through the royal halls, destroy the shadows of Zul and challenge the first king.",
    location: "Zuldazar",
    floors: ["Tomb"],
    stops: [
      {
        title: "Crypt of the First King",
        subtitle: "Minions of Zul",
        summary: "This dungeon requires killing almost every enemy. A Minion of Zul can be destroyed instantly by dispelling its magic shield.",
        callouts: ["Dispel the Minion of Zul shield immediately.", "Interrupt Hex Volley by marks.", "Don't skip the side pack."],
      },
      {
        title: "Gilded Passage",
        subtitle: "Constructs + hexers",
        summary: "Gather the constructs by the stairs and keep the way to the boss clear. Drop the poison clouds along the wall.",
        callouts: ["Face the constructs away from the group.", "Clouds — along the wall.", "Kill the Hexer first."],
      },
      {
        title: "The Golden Serpent",
        subtitle: "Boss 1",
        summary: "Drop Spit Gold close by, but don't block the path. On Lucre's Call kill the Animated Gold quickly, and don't point the tail at the group.",
        callouts: ["Place Spit Gold pools close together.","Keep gold blobs from empowering the boss."],

    tank: "Keep a clear path to the Animated Gold.",
    healer: "Prepare group healing for Serpentine Gust.",
    dps: "Slow and destroy Animated Gold before it reaches the boss.",
  },
      {
        title: "Embalming Hall",
        subtitle: "Mummies + fluids",
        summary: "Interrupt Wretched Discharge; dispel Lingering Fluid after moving. Don't stand in the embalming fluid splashes.",
        callouts: ["Don't let Wretched Discharge through.", "Unholy Mending — second assignment.", "Dispel the fluid outside the danger zone."],
      },
      {
        title: "Shadow of Zul",
        subtitle: "Required mini-boss",
        summary: "Two players soak the Dark Revelation zones at all times. Dispel the spawned Minions of Zul or break their shields quickly.",
        callouts: ["Two players stand in the zones at all times.", "Dispel Minion of Zul immediately.", "Group defensive for Shadow Barrage."],
      },
      {
        title: "Mchimba the Embalmer",
        subtitle: "Boss 2",
        summary: "The trapped player shakes their sarcophagus with the extra action button; allies open it. Keep Burn Corruption pools out of paths and kill mummies promptly.",
        callouts: ["The player in the coffin pings their position.", "Open the correct sarcophagus.", "Don't cross the Burn Corruption puddles."],

    tank: "Pick up mummies and keep sarcophagi accessible.",
    healer: "After Drain Fluids, heal the target above 90%.",
    dps: "Open the shaking sarcophagus; interrupt mummies’ Wretched Discharge.",
  },
      {
        title: "Hall of the Honored Dead",
        subtitle: "Queens + seneschals",
        summary: "Bind Soul and Unholy Mending need different interrupts. Don't pull both sides of the room together without AoE crowd control.",
        callouts: ["Split the room into two sides.", "Bind Soul is the first interrupt.", "Face the Berserker toward the wall."],
      },
      {
        title: "Council of Tribes",
        subtitle: "Boss 3",
        summary: "Share Barrel Through and avoid the axes. Defeated council members keep contributing mechanics, so maintain assignments throughout.",
        callouts: ["Don't let Poison Nova through.", "Kill the Explosive Totem first.", "Backhand — strong tank defensive."],

    tank: "Kite or use strong protection after Debilitating Backhand.",
    healer: "Heal Severing Axe targets and Arc Lightning group damage.",
    dps: "Interrupt Poison Nova. Totems: Explosive → Thundering → Torrent.",
  },
      {
        title: "Gallery of Conquerors",
        subtitle: "Spectral guard",
        summary: "The phantom guards activate one at a time. Interrupt Hex and don't let two Blade Combos hit the tank without a defensive.",
        callouts: ["Activate the guards one at a time.", "Interrupt Hex first.", "Blade Combo — tank defensive."],
      },
      {
        title: "Reban and T'zala",
        subtitle: "Royal beasts",
        summary: "Interrupt Deathly Roar; dispel Savage Maul from the tank. Spread the leaps and don't bring the beasts into the final boss's hall.",
        callouts: ["Always interrupt Deathly Roar.", "Dispel Savage Maul from the tank.", "Spread the leaps."],
      },
      {
        title: "Halls of Ash",
        subtitle: "Final royal guard",
        summary: "The last guard comes in waves. Don't rush to activate the final boss, and check enemy forces before entering the final arena.",
        callouts: ["Activate the waves one at a time.", "Check enemy forces before the final boss.", "Restore resources before Dazar."],
      },
      {
        title: "King Dazar",
        subtitle: "Final boss",
        summary: "Dodge the Gilded Destruction frontal, spread for Quaking Leap and use a strong tank defensive for Blade Combo.",
        callouts: ["Dodge Impaling Spear.","Keep Quaking Leap circles apart.","Prepare protection before Blade Combo."],

    tank: "Defend against Blade Combo; face Gilded Destruction away from allies.",
    healer: "Prepare healing for Quaking Leap and Gilded Destruction.",
    dps: "Kill Reban first; interrupt Deathly Roar and spread for leaps.",
  },
    ],
  },

  "temple-of-sethraliss": {
    description: "Recover the Eye of Sethraliss, cleanse the temple and restore the fallen avatar's strength.",
    location: "Vol'dun",
    floors: ["Temple"],
    stops: [
      {
        title: "Atrium of Sethraliss",
        subtitle: "Shrouded Fangs",
        summary: "The opening pack sets up the interrupt rotation. Dispel Poisoned Cheap Shot from its target and aim frontals at the outer wall.",
        callouts: ["Cheap Shot is the first interrupt.", "Dispel Cytotoxin immediately.", "Keep the snakes facing the wall."],
      },
      {
        title: "Adderis and Aspix",
        subtitle: "Boss 1",
        summary: "Attack the boss without Storm Blessed. Spread for Gale Force, then regroup for Thunder and Lightning. Drop Tempest Winds at the edge.",
        callouts: ["Immunity transfers at 40% health.","Use a wall against the knockback; keep player lines apart."],

    tank: "Use protection during Overload; leave room for the group soak.",
    healer: "Recover the group after Gale Force before the shared hit.",
    dps: "Attack the boss without Storm Blessed; move Tempest Winds out.",
  },
      {
        title: "The Great Mother's Clutch",
        subtitle: "Vipers + riders",
        summary: "Poisonous Vipers die first. Interrupt Addle Mind and dispel Cytotoxin.",
        callouts: ["Viper is the first target.", "Interrupt Addle Mind."],
      },
      {
        title: "Merektha",
        subtitle: "Boss 2",
        summary: "Group for Knot of Snakes and free allies with crowd control. Drop Thunder Spit at the edge; during Burrow, kill the snakes and avoid charges.",
        callouts: ["Keep pools out of the group’s path.","Avoid being pushed into pools by Serpentstorm."],

    tank: "Defend against Lightning Bite; gather snakes during Burrow.",
    healer: "Prepare for Serpentstorm; cleanse poison from affected players.",
    dps: "Interrupt the snakes’ Poison Spit; defeat them to end Burrow.",
  },
      {
        title: "Sand Riders",
        subtitle: "Rider gauntlet",
        summary: "Kill the poisonous snakes first, dispel Cytotoxin and don't drag the pack to the next staircase.",
        callouts: ["Finish the Viper next.", "Don't drag the pack to the next staircase."],
      },
      {
        title: "Galvanized Grotto",
        subtitle: "Stormcallers + nimbus",
        summary: "Purge Accumulate Charge and spread out Imbued Conduction. Position the pack between the pillars, keeping the path to the beams clear.",
        callouts: ["Purge Accumulate Charge immediately.", "Spread out Conduction.", "Don't block the path to the spires."],
      },
      {
        title: "Galvazzt",
        subtitle: "Boss 3",
        summary: "Players take turns blocking the Lightning Spire. After a few stacks, swap the player taking the beam, and move the boss out of Induction.",
        callouts: ["Do not let beams reach the boss.","Full energy triggers dangerous Consume Charge damage."],

    tank: "Move the boss out of Induction; keep the spires accessible.",
    healer: "Heal beam interceptors; rotate cooldowns between waves.",
    dps: "Intercept Lightning Spire beams before the boss; rotate when damage becomes dangerous.",
  },
      {
        title: "Eye of Sethraliss",
        subtitle: "Escort the eye",
        summary: "The Eye follows the group once the Temple Disruptor is defeated. Crowd-control the Essence Disruption channel and don't leave the object far behind.",
        callouts: ["Crowd-control the Disruptor until the Eye is done.", "Don't move far from the object.", "Interrupt Addle Mind."],
      },
      {
        title: "Vestibule of the Faithless",
        subtitle: "Hexxers + disruptors",
        summary: "Split Flame Shock and Essence Disruption between players. Finish activating the Eye before the next pack.",
        callouts: ["Activate the Eye before the next fight.", "Flame Shock — two assignments.", "Crowd-control the Disruptor."],
      },
      {
        title: "Avatar's Guardians",
        subtitle: "Final temple guards",
        summary: "The last pack needs AoE crowd control and strong defensives. Interrupt Flame Shock, and leave Corrupted Lifeforce for the next phase.",
        callouts: ["AoE crowd control after gathering.", "Check enemy forces before the final boss.", "Restore resources before the Avatar."],
      },
      {
        title: "Avatar of Sethraliss",
        subtitle: "Final boss",
        summary: "Defeat guardians and casters first. Essence Defiler’s death opens the Avatar healing window; help the healer by controlling and killing tormentors.",
        callouts: ["Drop Latent Hex at the edge.","Collect Corrupted Lifeforce before it explodes."],

    tank: "Pick up guardians; help control tormentors chasing the healer.",
    healer: "After Essence Defiler dies, heal the Avatar while avoiding tormentors.",
    dps: "Soak Corrupted Lifeforce; interrupt Flame Shock and destroy tormentors.",
  },
    ],
  },
};
