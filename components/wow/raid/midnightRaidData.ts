import seasonOnePublication from "@/data/wow/midnight-season-one-publication.json";

export const raidSlugs = ["the-voidspire", "the-dreamrift", "march-on-queldanas"] as const;

export type RaidSlug = (typeof raidSlugs)[number];
export type RaidAudience = "raid" | "tank" | "healer" | "dps";

export type RaidMechanic = {
  enc: number;
  spellId: number;
  role: RaidAudience;
  nameEn: string;
  nameRu: string;
  description: string;
  descriptionEn: string;
  descriptionSourceUrlEn: string;
  descriptionSourceUrlRu: string;
  descriptionVerifiedAt: string;
  descriptionBuild: string;
  iconName: string;
  localIcon: string;
};

export type RaidBoss = {
  slug: string;
  encounterId: number;
  entityId: string;
  nameEn: string;
  nameRu: string;
  descriptionEn: string;
  descriptionRu: string;
  artwork: string;
  mechanics: RaidMechanic[];
  abilityCoverage?: {
    recordedAbilities: number;
    publicationSafeAbilities: number;
    withheldAbilities: number;
  };
};

export type RaidDefinition = {
  slug: RaidSlug;
  instanceId: number;
  entityId: string;
  nameEn: string;
  nameRu: string;
  locationEn: string;
  locationRu: string;
  descriptionEn: string;
  descriptionRu: string;
  artwork: string;
  accent: string;
  bosses: RaidBoss[];
};

const spellRows = seasonOnePublication.abilities.map((ability) => ({
  enc: ability.encounterId,
  spellId: ability.spellId,
  role: ability.role as RaidAudience,
  nameEn: ability.nameEn,
  nameRu: ability.nameRu,
  description: ability.descriptionRu,
  descriptionEn: ability.descriptionEn,
  iconName: ability.iconName,
  localIcon: ability.iconUrl,
  descriptionSourceUrlEn: ability.descriptionSourceUrlEn,
  descriptionSourceUrlRu: ability.descriptionSourceUrlRu,
  descriptionVerifiedAt: ability.descriptionVerifiedAt,
  descriptionBuild: ability.descriptionBuild,
})) satisfies RaidMechanic[];
const mechanicsFor = (encounterId: number) => spellRows.filter((spell) => spell.enc === encounterId);
const coverageByEncounterId = new Map(seasonOnePublication.encounterCoverage.map((coverage) => [coverage.encounterId, coverage]));

const bosses: Record<string, RaidBoss> = {
  "imperator-averzian": {
    slug: "imperator-averzian",
    encounterId: 2733,
    entityId: "ea9e1666-e98d-4b1d-b128-fedd01d61c33",
    nameEn: "Imperator Averzian",
    nameRu: "Император Аверзиан",
    descriptionEn: "Imperator Averzian wages a relentless campaign, seeking not conquest, but annihilation. His entire will is bent to a singular ambition: to rend the veil between worlds and carve a breach into the Void itself. Through this wound, his infinite host shall pour forth, drowning Azeroth in darkness.",
    descriptionRu: "Император Аверзиан ведет войну, стремясь не завоевать, а уничтожить. Все свои силы он бросает на то, чтобы прорвать завесу между измерениями и открыть окно в Бездну. Через эту рану хлынет его неисчислимая рать, погружая Азерот в роковую тьму.",
    artwork: "/assets/wow/raids/midnight/bosses/imperator-averzian.jpg",
    mechanics: mechanicsFor(2733),
  },
  vorasius: {
    slug: "vorasius",
    encounterId: 2734,
    entityId: "4a8ba10d-c91f-4ffb-bddf-6f013ded7173",
    nameEn: "Vorasius",
    nameRu: "Ненасытникус",
    descriptionEn: "A colossal predator born in the wastes of the Voidstorm, Vorasius grew to an incredible size fueled by an endless hunger. Summoned to the battle raging at the base of the Voidspire by Voidlight Everdawn, this colossal monster now feasts on both sides.",
    descriptionRu: "Ненасытникус, гигантский хищник с пустошей Бури Бездны, вырос до невероятных размеров, пытаясь утолить свой неутолимый голод. Мракозария Вечный Рассвет призвала его к подножию Шпиля Бездны в разгар битвы, и этот исполинский монстр принялся пожирать солдат с обеих сторон.",
    artwork: "/assets/wow/raids/midnight/bosses/vorasius.jpg",
    mechanics: mechanicsFor(2734),
  },
  "fallen-king-salhadaar": {
    slug: "fallen-king-salhadaar",
    encounterId: 2736,
    entityId: "54f45e0b-eda8-459b-b6bd-64033a5436cd",
    nameEn: "Fallen-King Salhadaar",
    nameRu: "Павший король Салхадаар",
    descriptionEn: "After turning on Xal'atath, the fallen king Salhadaar has become a captive of the very Shadowguard he once commanded. Tortured, delirious, and infused with the Void, he awaits his death—or a chance to win his people's freedom from Xal'atath's grasp.",
    descriptionRu: "Восстав против Ксал'атат, павший король Салхадаар превратился из повелителя Темной Стражи в пленника. Пытки и заражение Бездной довели его до помешательства. Теперь он надеется лишь поскорее умереть – или получить шанс на освобождение своего народа от тирании Ксал'атат.",
    artwork: "/assets/wow/raids/midnight/bosses/fallen-king-salhadaar.jpg",
    mechanics: mechanicsFor(2736),
  },
  "vaelgor-ezzorak": {
    slug: "vaelgor-ezzorak",
    encounterId: 2735,
    entityId: "fd76ca91-d3c4-4df3-864e-96ede04c82d1",
    nameEn: "Vaelgor & Ezzorak",
    nameRu: "Ваэлгор и Эззорак",
    descriptionEn: "Born as clutchmates in the red dragonflight, Vaelgor and Ezzorak were once the guardians of all living things. Now, twisted by the dark will of Xal'atath, all that remains of their former selves is their unyielding bond to one another.",
    descriptionRu: "Красные драконы Ваэлгор и Эззорак принадлежат к одному выводку. Когда-то они защищали все живое, но пагубная магия Ксал'атат выжгла из их памяти все, кроме уз братства.",
    artwork: "/assets/wow/raids/midnight/bosses/vaelgor-ezzorak.jpg",
    mechanics: mechanicsFor(2735),
  },
  "lightblinded-vanguard": {
    slug: "lightblinded-vanguard",
    encounterId: 2737,
    entityId: "5d7457e3-2d25-48db-9b0c-642395b51404",
    nameEn: "Lightblinded Vanguard",
    nameRu: "Ослепленный авангард",
    descriptionEn: "Once paragons of the Light, Senn, Bellamy, and Lightblood have surrendered to their own blinding zealotry—their faith perverted into a ruthless fanaticism that now compels them to smite all who oppose them.",
    descriptionRu: "Сенн, Беллами и Светлая Кровь раньше беззаветно служили Свету, но стали жертвами собственного слепого фанатизма. Их вера превратилась в жестокую одержимость, и теперь три рыцаря карают смертью всех, кто посмеет им перечить.",
    artwork: "/assets/wow/raids/midnight/bosses/lightblinded-vanguard.jpg",
    mechanics: mechanicsFor(2737),
  },
  "crown-of-the-cosmos": {
    slug: "crown-of-the-cosmos",
    encounterId: 2738,
    entityId: "d4fc2d22-7395-46fe-97e9-7642af4abf49",
    nameEn: "Crown of the Cosmos",
    nameRu: "Корона космоса",
    descriptionEn: "High atop the Voidspire, Xal'atath marshals her dark army from across the Voidstorm. Aided by Turalyon, Arator, and Alleria, the mortals of Azeroth must confront her before she unleashes the might of the Voidspire against her enemies.",
    descriptionRu: "Ксал'атат командует своей темной армией с вершины Шпиля, руководя вторжением из Бури Бездны. Смертные герои Азерота, Туралион, Аратор и Аллерия должны вступить с ней в бой, пока она не успела обрушить на врагов всю мощь Шпиля.",
    artwork: "/assets/wow/raids/midnight/bosses/crown-of-the-cosmos.jpg",
    mechanics: mechanicsFor(2738),
  },
  chimaerus: {
    slug: "chimaerus",
    encounterId: 2795,
    entityId: "f4dca0b0-ef87-40bd-8722-301277ab8441",
    nameEn: "Chimaerus the Undreamt God",
    nameRu: "Химерий Неприснившийся Бог",
    descriptionEn: "When Aln'hara was taken from her Cradle, only pain and madness were left to shape the chaos of the rift. Chimaerus feasted on the void left behind, gorging itself on other nightmarish manifestations. Now it stands as the monster within the rift: a being of agony and rage.",
    descriptionRu: "Когда Альн'ару украли из колыбели, в хаосе Провала остались только боль и безумие. Химерий поглощал их, охотясь на другие кошмарные порождения. Теперь в Провале не осталось никого, кто может противостоять чудовищному слиянию ярости и агонии.",
    artwork: "/assets/wow/raids/midnight/bosses/chimaerus.jpg",
    mechanics: mechanicsFor(2795),
  },
  beloren: {
    slug: "beloren",
    encounterId: 2739,
    entityId: "fa45358c-65c3-4858-af5a-d86e4791c642",
    nameEn: "Belo'ren, Child of Al'ar",
    nameRu: "Бело'рен Дитя Ал'ара",
    descriptionEn: "One of the last clutch of Al'ar, Belo'ren was raised for the purpose of protecting the Isle of Quel'Danas. In the aftermath of the Voidspire, Belo'ren has been irradiated by Void. Confused and freshly hatched, the phoenix is focused on its sole task: keep any invaders from reaching the Sunwell.",
    descriptionRu: "Бело'рена, одного из последних птенцов Ал'ара, выращивали для защиты острова Кель'Данас. Катастрофа Шпиля Бездны заразила его излучением Великой Пустоты. Он едва вылупился из яйца и понимает только одно: ни за что не подпускать захватчиков к Солнечному Колодцу.",
    artwork: "/assets/wow/raids/midnight/bosses/beloren.jpg",
    mechanics: mechanicsFor(2739),
  },
  "midnight-falls": {
    slug: "midnight-falls",
    encounterId: 2740,
    entityId: "44d8dce1-e2ba-44b1-bd3a-ae5a32443830",
    nameEn: "Midnight Falls",
    nameRu: "Торжество Полуночи",
    descriptionEn: "Once a creature of Light, L'ura fell to the Void long ago on Argus, her essence siphoned by Alleria Windrunner in the Seat of the Triumvirate. Freed from her bindings, L'ura's dark energies now threaten the very Sunwell itself.",
    descriptionRu: "По своей природе Л'ура – создание Света, но Бездна поработила ее еще на Аргусе. Аллерия Ветрокрылая похитила сущность Л'уры в Престоле Триумвирата. Освободившись от оков, энергия темной наару угрожает захлестнуть сам Солнечный Колодец.",
    artwork: "/assets/wow/raids/midnight/bosses/midnight-falls.jpg",
    mechanics: mechanicsFor(2740),
  },
};

for (const boss of Object.values(bosses)) {
  boss.abilityCoverage = coverageByEncounterId.get(boss.encounterId) ?? {
    recordedAbilities: 0,
    publicationSafeAbilities: 0,
    withheldAbilities: 0,
  };
}

export const midnightRaids: Record<RaidSlug, RaidDefinition> = {
  "the-voidspire": {
    slug: "the-voidspire",
    instanceId: 1307,
    entityId: "c53689ab-30cd-468f-9b94-46904f9a515e",
    nameEn: "The Voidspire",
    nameRu: "Шпиль Бездны",
    locationEn: "Voidstorm",
    locationRu: "Буря Бездны",
    descriptionEn: "From high above the Voidstorm, Xal'atath has gathered the Devouring Host beneath her dark banner. The towering Voidspire looms like a spear of darkness, a citadel guarded by an army of the void. The forces of the Light must rally for one last desperate assault before all is lost.",
    descriptionRu: "В своем бастионе над Бурей Бездны Ксал'атат собрала войско слуг тьмы – Пожирающий сонм. Шпиль нависает в вышине подобно темному копью, и армия Бездны охраняет цитадель своей повелительницы. Силам Света нужно объединиться для последней отчаянной битвы.",
    artwork: "/assets/wow/raids/midnight/backgrounds/the-voidspire.png",
    accent: "#8f5ce4",
    bosses: [bosses["imperator-averzian"], bosses.vorasius, bosses["fallen-king-salhadaar"], bosses["vaelgor-ezzorak"], bosses["lightblinded-vanguard"], bosses["crown-of-the-cosmos"]],
  },
  "the-dreamrift": {
    slug: "the-dreamrift",
    instanceId: 1314,
    entityId: "06e72a6d-1c38-415b-89f6-f87de6a24f1b",
    nameEn: "The Dreamrift",
    nameRu: "Провал снов",
    locationEn: "Harandar",
    locationRu: "Харандар",
    descriptionEn: "The Dreamrift exists deep within the Rift of Aln, where the dreams of Aln'hara took form long ago. Dark manifestations have grown within the rift, devouring each other in an endless cycle.",
    descriptionRu: "Провал снов находится в самом сердце Провала Альн, где давным-давно сны богини становились явью. В отсутствие Альн'ары в Провале появились темные твари, пожирающие друг друга в бесконечном цикле.",
    artwork: "/assets/wow/raids/midnight/backgrounds/the-dreamrift.png",
    accent: "#6eba8e",
    bosses: [bosses.chimaerus],
  },
  "march-on-queldanas": {
    slug: "march-on-queldanas",
    instanceId: 1308,
    entityId: "423be006-0376-4e86-95d0-1b9ac433017f",
    nameEn: "March on Quel'Danas",
    nameRu: "Марш на Кель'Данас",
    locationEn: "Quel'Thalas",
    locationRu: "Кель'Талас",
    descriptionEn: "Darkness has eclipsed the Isle of Quel'Danas, clouding the skies above Silvermoon City. With Arator the Redeemer by their side, the Champions of Azeroth must march on the Sunwell before the light of the blood elves is lost forever.",
    descriptionRu: "Тьма охватила остров Кель'Данас, затмив небеса над Луносветом. Героям Азерота предстоит проложить путь к Солнечному Колодцу вместе с Аратором Искупителем, пока свет эльфов крови не угас навеки.",
    artwork: "/assets/wow/raids/midnight/backgrounds/march-on-queldanas.png",
    accent: "#e7a43d",
    bosses: [bosses.beloren, bosses["midnight-falls"]],
  },
};

export function getMidnightRaid(slug?: string) {
  return slug ? midnightRaids[slug as RaidSlug] : undefined;
}
