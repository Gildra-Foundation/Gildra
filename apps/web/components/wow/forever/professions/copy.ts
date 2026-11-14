export const copy = {
  en: { title: 'Forever professions', crumb: 'Professions', lede: 'Choose two primary professions; learn Cooking, Fishing and First Aid alongside them.', kinds: { crafting: 'Crafting', gathering: 'Gathering', secondary: 'Secondary' },
    recipes: 'Recipes', fresh: 'New in Forever', freshShort: 'New', recipeCount: (count: number) => `Recipes: ${count}`, freshCount: (count: number) => `New: ${count}`,
    search: 'Recipe or reagent', hint: 'Elixir, Silverleaf, bar…', skill: 'Your skill', source: 'Learn from', all: 'All', trainer: 'Trainer', recipe: 'Recipe item', automatic: 'Learned automatically', camp: 'Camping', any: 'All recipes', onlyCamp: 'Camp recipes', find: 'Find', skillAt: (skill: number) => `Skill ${skill}`,
    materials: 'Reagents', crafts: 'Number of crafts', output: 'Creates', required: 'Skill to learn', yellow: 'Turns yellow', grey: 'Turns grey', station: 'Crafting station', tools: 'Tools', acquisition: 'Learning the recipe',
    ranks: 'Skill ranks', rankNames: { Apprentice: 'Apprentice', Journeyman: 'Journeyman', Expert: 'Expert', Artisan: 'Artisan' }, specializations: 'Specializations',
    trainers: 'Trainers', alliance: 'Alliance', horde: 'Horde', neutral: 'Both factions' },
  ru: { title: 'Профессии Forever', crumb: 'Профессии', lede: 'Выберите две основные профессии; кулинарию, рыбную ловлю и первую помощь можно изучить дополнительно.', kinds: { crafting: 'Ремесло', gathering: 'Собирательство', secondary: 'Вторичные' },
    recipes: 'Рецепты', fresh: 'Новое в Forever', freshShort: 'Новое', recipeCount: (count: number) => `Рецептов: ${count}`, freshCount: (count: number) => `Новых: ${count}`,
    search: 'Рецепт или реагент', hint: 'Эликсир, сребролист, слиток…', skill: 'Ваш навык', source: 'Изучение', all: 'Все', trainer: 'Учитель', recipe: 'Предмет с рецептом', automatic: 'Изучается автоматически', camp: 'Лагерь', any: 'Все рецепты', onlyCamp: 'Рецепты лагеря', find: 'Найти', skillAt: (skill: number) => `Навык ${skill}`,
    materials: 'Реагенты', crafts: 'Количество изготовлений', output: 'Результат', required: 'Навык для изучения', yellow: 'Становится жёлтым', grey: 'Становится серым', station: 'Место изготовления', tools: 'Инструменты', acquisition: 'Изучение рецепта',
    ranks: 'Уровни мастерства', rankNames: { Apprentice: 'Ученик', Journeyman: 'Подмастерье', Expert: 'Умелец', Artisan: 'Искусник' }, specializations: 'Специализации',
    trainers: 'Учителя', alliance: 'Альянс', horde: 'Орда', neutral: 'Обе фракции' },
};
export const summaries: Record<string, { en: string; ru: string }> = {
  alchemy: { en: 'Potions, elixirs and dyes. A Mana Well helps your camp recover mana.', ru: 'Зелья, эликсиры и красители. Колодец маны помогает восстановиться в лагере.' },
  blacksmithing: { en: 'Forge weapons and armor; set up a Sharpening Wheel at camp.', ru: 'Оружие и доспехи; точильный круг для лагеря.' },
  enchanting: { en: 'Enchant equipment and salvage magical materials. Bring an Enchanted Lute to camp.', ru: 'Чары для экипировки и распыление. Зачарованная лютня усиливает лагерь.' },
  engineering: { en: 'Explosives, gadgets and a camp vendor for supplies and repairs.', ru: 'Взрывчатка, устройства и лагерный торговец для припасов и ремонта.' },
  leatherworking: { en: 'Leather armor and a tent that replenishes rested experience.', ru: 'Кожаные доспехи и палатка для восстановления опыта отдыха.' },
  tailoring: { en: 'Cloth armor, bags and a faction banner for camp.', ru: 'Тканевые доспехи, сумки и знамя фракции для лагеря.' },
  herbalism: { en: 'Gather herbs; craft incense candles for your camp.', ru: 'Сбор трав и изготовление благовоний для лагеря.' },
  mining: { en: 'Gather ore, smelt bars and build a Lodestone for camp.', ru: 'Добыча руды, выплавка слитков и магнитный камень для лагеря.' },
  skinning: { en: 'Collect hides and leather; make camp chairs.', ru: 'Сбор шкур и кожи; изготовление лагерных стульев.' },
  cooking: { en: 'Prepare food and campfires where your party can rest and craft.', ru: 'Еда и костры, у которых группа отдыхает и занимается ремеслом.' },
  'first-aid': { en: 'Bandages, healing potions and a First Aid Kit for camp.', ru: 'Бинты, лечебные зелья и аптечка для лагеря.' },
  fishing: { en: 'Catch fish for Cooking and put a Fish Bowl beside the campfire.', ru: 'Рыба для кулинарии и аквариум рядом с костром.' },
};
export const specializations: Record<string, { en: string; ru: string }> = {
  engineering: { en: 'At skill 200 and level 30, choose Gnomish or Goblin Engineering through its quest chain.', ru: 'При навыке 200 и уровне 30 цепочка заданий открывает гномскую или гоблинскую инженерию.' },
  blacksmithing: { en: 'Choose Armorsmith or Weaponsmith. Weaponsmiths can further focus on axes, hammers or swords.', ru: 'Выберите изготовление брони или оружия. Оружейники могут специализироваться на топорах, молотах или мечах.' },
  leatherworking: { en: 'Dragonscale, Elemental and Tribal Leatherworking offer different crafting paths.', ru: 'Кожевничество драконьей чешуи, стихий и традиций открывает разные направления изготовления.' },
};
