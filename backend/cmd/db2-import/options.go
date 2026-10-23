package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const defaultTables = "Item,ItemSparse,ItemClass,ItemSubClass,ItemEffect,ItemXItemEffect,ItemSet,ItemSetSpell,ItemNameDescription,ItemLimitCategory,GemProperties,ItemBonus,ItemBonusList,ItemBonusListGroup,ItemBonusListGroupEntry,ItemBonusListLevelDelta,ItemBonusSeason,ItemLevelSelector,ItemLevelSelectorQuality,ItemLevelSelectorQualitySet,ItemModifiedAppearance,ItemModifiedAppearanceExtra,ItemAppearance,ItemSpec,ItemSpecOverride,ItemExtendedCost,ItemCurrencyCost,ItemSearchName,JournalInstance,JournalEncounter,JournalEncounterItem,SpellName,Spell,SpellMisc,SpellCooldowns,SpellRange,SpellCastTimes,SpellDuration,SpellRadius,SpellPower,SpellEffect,SpellItemEnchantment,SpellDescriptionVariables,SpellAuraOptions,SpellAuraRestrictions,SpellCategories,SpellClassOptions,SpellEquippedItems,SpellLevels,SpellScaling,SpellTargetRestrictions,SpellProcsPerMinute,SpellXSpellVisual,SkillLine,SkillLineAbility,SkillRaceClassInfo,TradeSkillCategory,SpellReagents,SpellReagentsCurrency,CraftingData,CraftingDataItemQuality,TraitTree,TraitSubTree,TraitNode,TraitNodeEntry,TraitDefinition,TraitDefinitionEffectPoints,TraitEdge,TraitNodeXTraitNodeEntry,PvpTalent,Creature,CreatureDisplayInfo,CreatureModelData,CreatureType,CreatureFamily,CreatureDifficulty,ChrRaces,ChrClasses,ChrSpecialization,SpecSetMember,QuestV2,QuestV2CliTask,QuestObjective,QuestLine,QuestLineXQuest,QuestPOIBlob,QuestPOIPoint,QuestPackageItem,QuestMoneyReward,QuestXP,QuestFactionReward,QuestInfo,QuestSort,Map,MapDifficulty,AreaTable,UiMap,UiMapAssignment,UiMapLink,Faction,CurrencyTypes,Mount,MountCapability,MountTypeXCapability,BattlePetSpecies,Toy,TransmogSet,TransmogSetItem,Achievement,Achievement_Category,Criteria,CriteriaTree"

var tablePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{1,63}$`)

type options struct {
	databaseURL                  string
	product                      string
	version                      string
	tables                       []string
	locales                      []string
	maxRecords                   int
	batchSize                    int
	confirm                      bool
	projectSpells                bool
	projectItems                 bool
	projectExistingItems         bool
	projectExistingQuestPackages bool
	projectItemDetailsOnly       bool
	projectProfessions           bool
	projectCreatures             bool
	projectQuests                bool
	projectPvpTalents            bool
	projectCollections           bool
	download                     bool
}

func parseOptions() (options, error) {
	var tables, locales string
	opts := options{}
	flag.StringVar(&opts.databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	flag.StringVar(&opts.product, "product", "wow", "game_products slug")
	flag.StringVar(&opts.version, "version", "", "WoW build version; auto-detected when empty")
	flag.StringVar(&tables, "tables", defaultTables, "comma-separated Wago DB2 tables")
	flag.StringVar(&locales, "locales", "en_US,ru_RU", "comma-separated localized variants")
	flag.IntVar(&opts.maxRecords, "max-records", 1000, "maximum records per table; 0 imports all")
	flag.IntVar(&opts.batchSize, "batch-size", 2000, "rows per COPY batch")
	flag.BoolVar(&opts.confirm, "confirm", false, "download and store DB2 rows")
	flag.BoolVar(&opts.projectSpells, "project-spells", true, "project SpellName rows into searchable entities")
	flag.BoolVar(&opts.projectItems, "project-items", true, "project ItemSparse text and Item registry facts into item entities")
	flag.BoolVar(&opts.projectExistingItems, "project-existing-items", false, "project only item entities from an already imported complete build without creating an import run")
	flag.BoolVar(&opts.projectExistingQuestPackages, "project-existing-quest-packages", false, "project only quest reward package entities from an already imported complete build without creating an import run")
	flag.BoolVar(&opts.projectItemDetailsOnly, "project-item-details-only", false, "rebuild typed item details for an already projected build without reprojecting entities")
	flag.BoolVar(&opts.projectProfessions, "project-professions", true, "project professions, recipes, reagents, and outputs")
	flag.BoolVar(&opts.projectCreatures, "project-creatures", true, "project creatures, display models, and taxonomy")
	flag.BoolVar(&opts.projectQuests, "project-quests", true, "project quest registry, objectives, lines, and map POIs")
	flag.BoolVar(&opts.projectPvpTalents, "project-pvp-talents", true, "project PvP talents, specialization ownership, and spell links")
	flag.BoolVar(&opts.projectCollections, "project-collections", true, "project classes, specializations, currencies, mounts, pets, toys, maps, factions, transmogs, and achievements")
	flag.BoolVar(&opts.download, "download", true, "download tables before projection")
	flag.Parse()
	if opts.databaseURL == "" {
		opts.databaseURL = os.Getenv("DATABASE_URL")
	}
	if opts.projectItemDetailsOnly {
		opts.download = false
		opts.projectItems = false
		opts.projectSpells = false
		opts.projectProfessions = false
		opts.projectCreatures = false
		opts.projectQuests = false
		opts.projectPvpTalents = false
		opts.projectCollections = false
	}
	opts.tables = splitList(tables)
	opts.locales = splitList(locales)
	if opts.databaseURL == "" {
		return options{}, errors.New("DATABASE_URL or -database-url is required")
	}
	if (opts.projectExistingItems || opts.projectExistingQuestPackages) && opts.download {
		return options{}, errors.New("project-existing modes require -download=false")
	}
	if opts.projectExistingItems && opts.projectExistingQuestPackages {
		return options{}, errors.New("select only one project-existing mode")
	}
	if !validProduct(opts.product) {
		return options{}, fmt.Errorf("unsupported product %q", opts.product)
	}
	if opts.maxRecords < 0 || opts.batchSize < 100 || opts.batchSize > 10000 {
		return options{}, errors.New("invalid max-records or batch-size")
	}
	for _, table := range opts.tables {
		if !tablePattern.MatchString(table) {
			return options{}, fmt.Errorf("invalid DB2 table %q", table)
		}
	}
	for _, locale := range opts.locales {
		if locale != "en_US" && locale != "ru_RU" {
			return options{}, fmt.Errorf("unsupported locale %q", locale)
		}
	}
	return opts, nil
}

func validProduct(product string) bool {
	switch product {
	case "wow", "wow_classic", "wow_classic_era", "wow_classic_hardcore":
		return true
	default:
		return false
	}
}

func isLocalized(table string) bool {
	switch table {
	case "ItemSparse", "ItemSearchName", "Spell", "SpellName", "SpellRange", "TraitDefinition",
		"ItemClass", "ItemSubClass", "QuestV2CliTask", "QuestObjective", "QuestLine",
		"QuestInfo", "QuestSort", "ItemSet", "ItemNameDescription", "ItemLimitCategory",
		"JournalInstance", "JournalEncounter", "SkillLine", "TradeSkillCategory", "Creature",
		"CreatureType", "CreatureFamily", "ChrRaces", "ChrClasses", "ChrSpecialization",
		"Map", "AreaTable", "UiMap", "Faction", "CurrencyTypes", "Mount", "BattlePetSpecies",
		"Toy", "TransmogSet", "Achievement", "Achievement_Category", "Criteria", "PvpTalent":
		return true
	default:
		return false
	}
}

func splitList(value string) []string {
	result := make([]string, 0)
	for part := range strings.SplitSeq(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func parseBuildNumber(version string) (int, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 4 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	value, err := strconv.Atoi(parts[3])
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("invalid build version %q", version)
	}
	return value, nil
}

func contains(values []string, expected string) bool {
	return slices.Contains(values, expected)
}
