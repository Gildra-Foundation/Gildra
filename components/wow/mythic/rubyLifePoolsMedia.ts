import seasonTwoAbilityMedia from "./seasonTwoMedia.json";
import seasonTwoEnemyMedia from "./seasonTwoEnemyMedia.json";

export type EnemyMedia = {
  npcId?: number;
  portraitUrl?: string;
  portraitScale?: number;
  portraitY?: string;
  identityVerified?: boolean;
  identitySourceUrl?: string;
  identityLastVerifiedAt?: string;
  portraitVerified?: boolean;
  portraitStatus?: "model_unavailable";
  portraitSourceUrl?: string;
  portraitLastVerifiedAt?: string;
};

export type AbilityMedia = {
  spellId?: number;
  iconId?: number;
  iconUrl: string;
  iconName: string;
  identitySourceUrl?: string;
  iconMappingSourceUrl?: string;
  actorEvidenceUrl?: string;
  lastVerifiedAt?: string;
};

function officialSpellIcon(iconName: string) {
  return `https://render.worldofwarcraft.com/us/icons/56/${encodeURIComponent(iconName.toLowerCase())}.jpg`;
}

// NPC IDs follow the live Ruby Life Pools data set. Portraits are lightweight
// local crops so opening combat intel never waits on full-size external images.
// Spell icons are served by Gildra's content-addressed catalog media cache.
export const enemyMedia: Record<string, EnemyMedia> = {
  "Primal Juggernaut": { npcId: 188244, portraitUrl: "/assets/wow/mythic/npcs/thumbs/primal-juggernaut.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=188244/primal-juggernaut", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/89/101209.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Deepstone Earthshaper": { npcId: 187969, portraitUrl: "/assets/wow/mythic/npcs/thumbs/deepstone-earthshaper.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=187969/deepstone-earthshaper", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/43/102955.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Earthbound Guardian": { npcId: 188011, portraitUrl: "/assets/wow/mythic/npcs/thumbs/earthbound-guardian.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=188011/earthbound-guardian", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/184/79800.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Flashfrost Chillweaver": { npcId: 188067, portraitUrl: "/assets/wow/mythic/npcs/thumbs/flashfrost-chillweaver.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=188067/flashfrost-chillweaver", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/133/107397.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Infused Whelp": { npcId: 187894, portraitUrl: "/assets/wow/mythic/npcs/thumbs/infused-whelp.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=187894/infused-whelp", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/41/110633.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Defier Draghar": { npcId: 187897, portraitUrl: "/assets/wow/mythic/npcs/thumbs/defier-draghar.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=187897/defier-draghar", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/98/107106.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Melidrussa Chillworn": { npcId: 188252, portraitUrl: "/assets/wow/mythic/npcs/thumbs/melidrussa-chillworn.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=188252/melidrussa-chillworn", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/139/106891.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Scorchling": { npcId: 190205, portraitUrl: "/assets/wow/mythic/npcs/thumbs/scorchling.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=190205/scorchling", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/135/102535.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Thunderhead": { npcId: 197698, portraitUrl: "/assets/wow/mythic/npcs/thumbs/thunderhead.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=197698/thunderhead", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/195/106435.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Primalist Cinderweaver": { npcId: 190207, portraitUrl: "/assets/wow/mythic/npcs/thumbs/primalist-cinderweaver.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=190207/primalist-cinderweaver", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/230/102886.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Blazebound Destroyer": { npcId: 190034, portraitUrl: "/assets/wow/mythic/npcs/thumbs/blazebound-destroyer.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=190034/blazebound-destroyer", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/105/102505.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Ashseer Flamelasher": { npcId: 190206, portraitUrl: "/assets/wow/mythic/npcs/thumbs/ashseer-flamelasher.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=190206/ashseer-flamelasher", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/57/102969.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Flamegullet": { npcId: 197697, portraitUrl: "/assets/wow/mythic/npcs/thumbs/flamegullet.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=197697/flamegullet", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/39/106023.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Kokia Blazehoof": { npcId: 189232, portraitUrl: "/assets/wow/mythic/npcs/thumbs/kokia-blazehoof.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=189232/kokia-blazehoof", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/99/106851.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Blazebound Firestorm": { npcId: 189886, portraitUrl: "/assets/wow/mythic/npcs/thumbs/blazebound-firestorm.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=189886/blazebound-firestorm", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/105/102505.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Storm Warrior": { npcId: 197982, portraitUrl: "/assets/wow/mythic/npcs/thumbs/storm-warrior.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=197982/storm-warrior", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/116/110964.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Flame Channeler": { npcId: 197985, portraitUrl: "/assets/wow/mythic/npcs/thumbs/flame-channeler.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=197985/flame-channeler", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/121/110969.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Tempest Channeler": { npcId: 198047, portraitUrl: "/assets/wow/mythic/npcs/thumbs/tempest-channeler.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=198047/tempest-channeler", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/119/110967.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Primal Thundercloud": { npcId: 197509, portraitUrl: "/assets/wow/mythic/npcs/thumbs/primal-thundercloud.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=197509/primal-thundercloud", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/116/102516.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "High Channeler Ryvati": { npcId: 197535, portraitUrl: "/assets/wow/mythic/npcs/thumbs/high-channeler-ryvati.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=197535/high-channeler-ryvati", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/118/110966.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Erkhart Stormvein": { npcId: 190485, portraitUrl: "/assets/wow/mythic/npcs/thumbs/erkhart-stormvein.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=190485/erkhart-stormvein", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/30/108318.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  "Kyrakka": { npcId: 190484, portraitUrl: "/assets/wow/mythic/npcs/thumbs/kyrakka.webp", portraitScale: 1, identityVerified: true, identitySourceUrl: "https://www.wowhead.com/npc=190484/kyrakka", identityLastVerifiedAt: "2026-09-13T05:40:48.203Z", portraitVerified: true, portraitSourceUrl: "https://wow.zamimg.com/modelviewer/live/webthumbs/npc/129/107137.webp", portraitLastVerifiedAt: "2026-09-13T05:40:48.203Z" },
  ...(seasonTwoEnemyMedia as Record<string, EnemyMedia>),
};

export const abilityMedia: Record<string, AbilityMedia> = {
  "Ice Shield": { spellId: 372743, iconName: "ability_mage_coldasice", iconUrl: "/v1/media/bac713a3-b935-4f22-a307-336f83c7c862" },
  "Cold Claws": { spellId: 1305234, iconName: "ability_mage_wintersgrasp", iconUrl: "/v1/media/0b179c9f-6e8e-42c9-bd69-ed8722f05e51" },
  "Frostbolt": { spellId: 371984, iconName: "spell_frost_frostbolt02", iconUrl: "/v1/media/f91fbc97-fbb2-4025-88bb-6ae6e3b54e72" },
  "Tectonic Strike": { spellId: 1305225, iconName: "inv_axe_2h_earthendungeon_c_01", iconUrl: "/v1/media/eeb78515-85f4-4813-84b4-5bc1c55649d3" },
  "Earthbound's Imprint": { spellId: 1307205, iconName: "inv_ore_blackrock_ore", iconUrl: "/v1/media/9a0aa904-6f6e-46d1-9dd4-9c2d71a71a84" },
  "Stone Missile": { spellId: 372802, iconName: "inv_ore_blackrock_ore", iconUrl: "/v1/media/4f7b1ff8-b504-43cf-b9e6-f91b8fcf847f" },
  "Excavating Blast": { spellId: 1305201, iconName: "spell_nature_earthquake", iconUrl: "/v1/media/72feec32-71cb-4321-9502-103fe262dace" },
  "Crushing Smash": { spellId: 1305213, iconName: "spell_shaman_earthquake", iconUrl: "/v1/media/d4a916ad-363f-4167-a8a5-f42b4d703b90" },
  "Steel Barrage": { spellId: 1309705, iconName: "inv_axe_1h_deathwingraiddw_d_01", iconUrl: "/v1/media/78c3fad3-69f6-4842-9891-a708f2a01da6" },
  "Blazing Rush": { spellId: 372087, iconName: "spell_deathknight_butcher2", iconUrl: "/v1/media/c3524e6a-be23-487a-b686-c147be71b875" },
  "Molten Steel": { spellId: 385292, iconName: "inv_summerfest_firespirit", iconUrl: "/v1/media/9334fd7b-513a-48e8-a089-585c2aed10d4" },
  "Frigid Shard": { spellId: 372808, iconName: "spell_frost_iceshard", iconUrl: "/v1/media/0246faad-90f8-495c-ab95-6bcf915a775e" },
  "Chillstorm": { spellId: 372851, iconName: "spell_shadow_soulleech_2", iconUrl: "/v1/media/e60b61f5-f621-4b37-a4f7-2368b0b899e6" },
  "Frost Overload": { spellId: 373680, iconName: "spell_fire_blueflamering", iconUrl: "/v1/media/74f1054b-033b-49ec-b1cb-c224a07abc9a" },
  "Inferno": { spellId: 373692, iconName: "ability_warlock_inferno", iconUrl: "/v1/media/94820db0-d57a-4ff0-8480-74e0442b5c3b" },
  "Fiery Blast": { spellId: 1305955, iconName: "ability_mage_greaterpyroblast", iconUrl: "/v1/media/c0961ae6-ffaf-47be-adc7-ac6a80f15380" },
  "Cinderbolt": { spellId: 384194, iconName: "spell_fire_firebolt", iconUrl: "/v1/media/fbbd736c-3d07-4056-a95c-6b22f759950f" },
  "Burnout": { spellId: 373614, iconName: "spell_fire_selfdestruct", iconUrl: "/v1/media/cf177505-d923-438f-8e0c-ab49503a5a07" },
  "Storm Breath": { spellId: 391726, iconName: "inv_misc_stormlordsfavor", iconUrl: "/v1/media/997abf2e-c8e5-4568-8736-9a52289038eb" },
  "Thunder Jaw": { spellId: 392395, iconName: "inv_misc_stormdragonpale", iconUrl: "/v1/media/432ac660-2b3b-4074-931a-fe1f08f77265" },
  "Rolling Thunder": { spellId: 392640, iconName: "spell_nature_lightningoverload", iconUrl: "/v1/media/c6d3003e-16ca-4f94-9c55-1a723bebbc5c" },
  "Flame Breath": { spellId: 391723, iconName: "ability_mage_firestarter", iconUrl: "/v1/media/a685eb4d-01a8-490c-b619-b9bceef69cef" },
  "Fire Maw": { spellId: 392394, iconName: "ability_warrior_dragonroar", iconUrl: "/v1/media/da3266dc-f3cf-4833-b3de-dd0d8a779c60" },
  "Molten Blood": { spellId: 392569, iconName: "spell_nzinsanity_floorislava", iconUrl: "/v1/media/086882d5-1eee-4c1b-b58e-c08368c2e4c8" },
  "Flaming Barrage": { spellId: 385536, iconName: "ability_warlock_burningembers", iconUrl: "/v1/media/ce6cff6d-c67a-4256-9bb6-c37720522563" },
  "Blaze of Glory": { spellId: 373972, iconName: "inv_ember", iconUrl: "/v1/media/9a6e95d9-a26b-4d81-a08e-82a5b12a8f6a" },
  "Ritual of Blazebinding": { spellId: 1309540, iconName: "spell_fire_totemofwrath", iconUrl: "/v1/media/425f7a8f-3c41-4ad2-8554-d72e01008f6d" },
  "Blaze Volley": { spellId: 373017, iconName: "spell_fire_flamebolt", iconUrl: "/v1/media/11a9fb65-82a9-48a5-a142-171d2108e0dd" },
  "Molten Boulder": { spellId: 1306272, iconName: "spell_mage_flameorb", iconUrl: "/v1/media/0ab240f0-8134-48ba-8acc-d8433f01e590" },
  "Searing Blows": { spellId: 372858, iconName: "ability_shaman_lavalash", iconUrl: "/v1/media/e516c9a1-bcf8-4e39-9842-fb80fb814d1e" },
  "Thunderous Stomp": { spellId: 392406, iconName: "ability_thunderclap", iconUrl: "https://render.worldofwarcraft.com/us/icons/56/ability_thunderclap.jpg" },
  "Flashfire": { spellId: 392451, iconName: "spell_fire_felflamering_red", iconUrl: "/v1/media/3aafea1c-a8ba-4b98-8930-e68557d1fa53" },
  "Thunder Stomper": { spellId: 1307476, iconName: "ability_thunderclap", iconUrl: "/v1/media/5dbcf376-2156-4601-b4c9-f6f891172066" },
  "Thunder Blast": { spellId: 392576, iconName: "inv_misc_stormlordsfavor", iconUrl: "https://render.worldofwarcraft.com/us/icons/56/inv_misc_stormlordsfavor.jpg" },
  "Lightning Storm": { spellId: 392488, iconName: "spell_shaman_thunderstorm", iconUrl: "/v1/media/501a095e-75e0-4c56-a633-fe8843460f49" },
  "Stormcloud Barrier": { spellId: 391031, iconName: "spell_mage_temporalshield", iconUrl: "https://render.worldofwarcraft.com/us/icons/56/spell_mage_temporalshield.jpg" },
  "Tempest Stormshield": { spellId: 1310355, iconName: "inv_10_worlddroplevelingoptionalreagent_misc_orb_air", iconUrl: "/v1/media/899f0bb8-01a0-4895-8c0f-722084ae0a9d" },
  "Shock Blast": { spellId: 392924, iconName: "spell_nature_stormreach", iconUrl: "/v1/media/94051bf6-3c8a-462f-9d05-9dedb9fe6f22" },
  "Roaring Firebreath": { spellId: 381525, iconName: "ability_warlock_inferno", iconUrl: "/v1/media/ea9c54c3-ed42-45d0-97b9-4809c8a2b687" },
  "Interrupting Cloudburst": { spellId: 381516, iconName: "spell_nature_cyclone", iconUrl: "/v1/media/25242564-53c2-42f7-8bb2-52eceeee5201" },
  "Inferno Spit": { spellId: 381602, iconName: "spell_fire_firebolt", iconUrl: "/v1/media/eb627cdb-75be-4f2e-ba1f-021eb2bd6fdc" },
  "Stormslam": { spellId: 381512, iconName: "ability_shaman_stormstrike", iconUrl: "/v1/media/b0c2d119-eb93-413f-b935-0df13018b8bc" },
  "Winds of Change": { spellId: 381517, iconName: "spell_nature_purge", iconUrl: "/v1/media/f20a9e9b-9aa8-4e4f-874c-61e7f238591d" },
  ...(seasonTwoAbilityMedia as Record<string, AbilityMedia>),
};

export function resolveAbilityMedia(name: string, _action?: string): { media: AbilityMedia; exact: boolean } | undefined {
  const exact = abilityMedia[name];
  if (exact) {
    return {
      media: {
        ...exact,
        // Content-addressed catalog UUIDs change when media is re-imported.
        // The official Blizzard CDN path is stable for a verified icon name.
        iconUrl: exact.iconUrl.startsWith("/v1/media/") ? officialSpellIcon(exact.iconName) : exact.iconUrl,
      },
      exact: true,
    };
  }
  // A neutral component placeholder is safer than a semantically wrong spell
  // icon. Never rotate a generic action icon into an unrelated mechanic.
  return undefined;
}
