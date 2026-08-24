package catalogtaxonomy

var russianSpecializationNames = map[string]string{
	"Affliction": "Колдовство", "Arcane": "Тайная магия", "Arms": "Оружие",
	"Assassination": "Ликвидация", "Augmentation": "Насыщение", "Balance": "Баланс",
	"Beast Mastery": "Повелитель зверей", "Blood": "Кровь", "Brewmaster": "Хмелевар",
	"Demonology": "Демонология", "Destruction": "Разрушение", "Devastation": "Опустошитель",
	"Devourer": "Пожиратель", "Discipline": "Послушание", "Elemental": "Стихии",
	"Enhancement": "Совершенствование", "Feral": "Сила зверя", "Fire": "Огонь",
	"Frost": "Лед", "Fury": "Неистовство", "Guardian": "Страж", "Havoc": "Истребление",
	"Holy": "Свет", "Marksmanship": "Стрельба", "Mistweaver": "Ткач туманов",
	"Outlaw": "Головорез", "Preservation": "Хранитель", "Protection": "Защита",
	"Restoration": "Исцеление", "Retribution": "Воздаяние", "Shadow": "Тьма",
	"Subtlety": "Скрытность", "Survival": "Выживание", "Unholy": "Нечестивость",
	"Vengeance": "Месть", "Windwalker": "Танцующий с ветром",
}

func localizedSpecialization(name string) string {
	if localized, ok := russianSpecializationNames[name]; ok {
		return localized
	}
	return name
}

func itemDefinitions() []Definition {
	definitions := []Definition{
		{EntityType: "item", Facet: "group", Slug: "equipment", Path: "equipment", NameEN: "Equipment", NameRU: "Экипировка", SortOrder: 10},
		{EntityType: "item", Facet: "group", Slug: "armor", Path: "equipment/armor", ParentPath: "equipment", NameEN: "Armor", NameRU: "Броня", SortOrder: 10},
		{EntityType: "item", Facet: "group", Slug: "weapons", Path: "equipment/weapons", ParentPath: "equipment", NameEN: "Weapons", NameRU: "Оружие", SortOrder: 20},
		{EntityType: "item", Facet: "group", Slug: "accessories", Path: "equipment/accessories", ParentPath: "equipment", NameEN: "Accessories", NameRU: "Аксессуары", SortOrder: 30},
		{EntityType: "item", Facet: "group", Slug: "slots", Path: "equipment/slots", ParentPath: "equipment", NameEN: "Equipment slots", NameRU: "Слоты экипировки", SortOrder: 40},
		{EntityType: "item", Facet: "group", Slug: "professions", Path: "professions", NameEN: "Professions", NameRU: "Профессии", SortOrder: 20},
	}
	armor := []struct {
		slug, en, ru string
		subclass     int
	}{{"cloth", "Cloth", "Ткань", 1}, {"leather", "Leather", "Кожа", 2}, {"mail", "Mail", "Кольчуга", 3}, {"plate", "Plate", "Латы", 4}, {"cosmetic", "Cosmetic", "Косметическая", 5}, {"shield", "Shields", "Щиты", 6}}
	for index, item := range armor {
		definitions = append(definitions, Definition{EntityType: "item", Facet: "armor_type", Slug: item.slug,
			Path: "equipment/armor/" + item.slug, ParentPath: "equipment/armor", NameEN: item.en, NameRU: item.ru,
			SortOrder: int16(index + 1), Attributes: map[string]any{"item_class": 4, "item_subclass": item.subclass}})
	}
	weapons := []struct {
		slug, en, ru string
		subclass     int
	}{{"axe-1h", "One-Handed Axes", "Одноручные топоры", 0}, {"axe-2h", "Two-Handed Axes", "Двуручные топоры", 1},
		{"bows", "Bows", "Луки", 2}, {"guns", "Guns", "Ружья", 3}, {"mace-1h", "One-Handed Maces", "Одноручное дробящее", 4},
		{"mace-2h", "Two-Handed Maces", "Двуручное дробящее", 5}, {"polearms", "Polearms", "Древковое", 6},
		{"sword-1h", "One-Handed Swords", "Одноручные мечи", 7}, {"sword-2h", "Two-Handed Swords", "Двуручные мечи", 8},
		{"warglaives", "Warglaives", "Боевые клинки", 9}, {"staves", "Staves", "Посохи", 10}, {"fist-weapons", "Fist Weapons", "Кистевое", 13},
		{"misc-weapons", "Miscellaneous", "Прочее оружие", 14}, {"daggers", "Daggers", "Кинжалы", 15},
		{"crossbows", "Crossbows", "Арбалеты", 18}, {"wands", "Wands", "Жезлы", 19}, {"fishing-poles", "Fishing Poles", "Удочки", 20}}
	for index, item := range weapons {
		definitions = append(definitions, Definition{EntityType: "item", Facet: "weapon_type", Slug: item.slug,
			Path: "equipment/weapons/" + item.slug, ParentPath: "equipment/weapons", NameEN: item.en, NameRU: item.ru,
			SortOrder: int16(index + 1), Attributes: map[string]any{"item_class": 2, "item_subclass": item.subclass}})
	}
	accessories := []struct {
		slug, en, ru string
		inventory    int
	}{{"neck", "Neck", "Шея", 2}, {"back", "Back", "Спина", 16}, {"finger", "Finger", "Пальцы", 11},
		{"trinkets", "Trinkets", "Аксессуары", 12}, {"off-hand", "Held in Off-hand", "Левая рука", 23}}
	for index, item := range accessories {
		definitions = append(definitions, Definition{EntityType: "item", Facet: "equipment_slot", Slug: item.slug,
			Path: "equipment/accessories/" + item.slug, ParentPath: "equipment/accessories", NameEN: item.en, NameRU: item.ru,
			SortOrder: int16(index + 1), Attributes: map[string]any{"inventory_type": item.inventory}})
	}
	armorSlots := []struct {
		slug, en, ru string
		inventory    int
	}{{"head", "Head", "Голова", 1}, {"shoulder", "Shoulder", "Плечи", 3}, {"chest", "Chest", "Грудь", 5},
		{"waist", "Waist", "Пояс", 6}, {"legs", "Legs", "Ноги", 7}, {"feet", "Feet", "Ступни", 8},
		{"wrist", "Wrist", "Запястья", 9}, {"hands", "Hands", "Кисти рук", 10}}
	for index, item := range armorSlots {
		definitions = append(definitions, Definition{EntityType: "item", Facet: "equipment_slot", Slug: item.slug,
			Path: "equipment/slots/" + item.slug, ParentPath: "equipment/slots", NameEN: item.en, NameRU: item.ru,
			SortOrder: int16(index + 1), Attributes: map[string]any{"inventory_type": item.inventory}})
	}
	professions := []struct {
		slug, en, ru string
		id           int
	}{{"alchemy", "Alchemy", "Алхимия", 171}, {"blacksmithing", "Blacksmithing", "Кузнечное дело", 164},
		{"enchanting", "Enchanting", "Наложение чар", 333}, {"engineering", "Engineering", "Инженерное дело", 202},
		{"inscription", "Inscription", "Начертание", 773}, {"jewelcrafting", "Jewelcrafting", "Ювелирное дело", 755},
		{"leatherworking", "Leatherworking", "Кожевничество", 165}, {"tailoring", "Tailoring", "Портняжное дело", 197}}
	for index, item := range professions {
		definitions = append(definitions, Definition{EntityType: "item", Facet: "profession", Slug: item.slug,
			Path: "professions/" + item.slug, ParentPath: "professions", NameEN: item.en, NameRU: item.ru,
			SortOrder: int16(index + 1), Attributes: map[string]any{"profession_id": item.id}})
	}
	definitions = append(definitions, Definition{EntityType: "item", Facet: "catalog_status", Slug: "uncategorized",
		Path: "uncategorized", NameEN: "Uncategorized", NameRU: "Без категории", SortOrder: 32000})
	return definitions
}
