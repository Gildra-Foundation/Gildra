package rotationlab

// specReference is deliberately closed over the specializations exposed by
// Gildra. It prevents request data from ever becoming a profile path or a raw
// SimulationCraft actor declaration.
type specReference struct {
	Class       string
	Spec        string
	Race        string
	Role        string
	ProfileFile string
}

var supportedSpecs = map[string]specReference{
	"blood-death-knight":     {"deathknight", "blood", "human", "tank", "MID2_Death_Knight_Blood.simc"},
	"frost-death-knight":     {"deathknight", "frost", "human", "attack", "MID2_Death_Knight_Frost.simc"},
	"unholy-death-knight":    {"deathknight", "unholy", "human", "attack", "MID2_Death_Knight_Unholy.simc"},
	"havoc-demon-hunter":     {"demonhunter", "havoc", "night_elf", "attack", "MID2_Demon_Hunter_Havoc.simc"},
	"vengeance-demon-hunter": {"demonhunter", "vengeance", "night_elf", "tank", "MID2_Demon_Hunter_Vengeance.simc"},
	"devourer-demon-hunter":  {"demonhunter", "devourer", "night_elf", "spell", "MID2_Demon_Hunter_Devourer.simc"},
	"balance-druid":          {"druid", "balance", "night_elf", "spell", ""},
	"feral-druid":            {"druid", "feral", "night_elf", "attack", ""},
	"guardian-druid":         {"druid", "guardian", "night_elf", "tank", ""},
	"restoration-druid":      {"druid", "restoration", "night_elf", "heal", ""},
	"augmentation-evoker":    {"evoker", "augmentation", "dracthyr", "spell", ""},
	"devastation-evoker":     {"evoker", "devastation", "dracthyr", "spell", ""},
	"preservation-evoker":    {"evoker", "preservation", "dracthyr", "heal", ""},
	"beast-mastery-hunter":   {"hunter", "beast_mastery", "orc", "attack", "MID2_Hunter_Beast_Mastery.simc"},
	"marksmanship-hunter":    {"hunter", "marksmanship", "orc", "attack", "MID2_Hunter_Marksmanship.simc"},
	"survival-hunter":        {"hunter", "survival", "orc", "attack", "MID2_Hunter_Survival.simc"},
	"arcane-mage":            {"mage", "arcane", "human", "spell", "MID2_Mage_Arcane.simc"},
	"fire-mage":              {"mage", "fire", "human", "spell", "MID2_Mage_Fire.simc"},
	"frost-mage":             {"mage", "frost", "human", "spell", "MID2_Mage_Frost.simc"},
	"brewmaster-monk":        {"monk", "brewmaster", "pandaren", "tank", "MID2_Monk_Brewmaster.simc"},
	"mistweaver-monk":        {"monk", "mistweaver", "pandaren", "heal", ""},
	"windwalker-monk":        {"monk", "windwalker", "pandaren", "attack", "MID2_Monk_Windwalker.simc"},
	"holy-paladin":           {"paladin", "holy", "human", "heal", ""},
	"protection-paladin":     {"paladin", "protection", "human", "tank", "MID2_Paladin_Protection.simc"},
	"retribution-paladin":    {"paladin", "retribution", "human", "attack", "MID2_Paladin_Retribution.simc"},
	"discipline-priest":      {"priest", "discipline", "human", "heal", ""},
	"holy-priest":            {"priest", "holy", "human", "heal", ""},
	"shadow-priest":          {"priest", "shadow", "human", "spell", "MID2_Priest_Shadow.simc"},
	"assassination-rogue":    {"rogue", "assassination", "human", "attack", "MID2_Rogue_Assassination.simc"},
	"outlaw-rogue":           {"rogue", "outlaw", "human", "attack", "MID2_Rogue_Outlaw.simc"},
	"subtlety-rogue":         {"rogue", "subtlety", "human", "attack", "MID2_Rogue_Subtlety.simc"},
	"elemental-shaman":       {"shaman", "elemental", "orc", "spell", "MID2_Shaman_Elemental.simc"},
	"enhancement-shaman":     {"shaman", "enhancement", "orc", "attack", "MID2_Shaman_Enhancement.simc"},
	"restoration-shaman":     {"shaman", "restoration", "orc", "heal", ""},
	"affliction-warlock":     {"warlock", "affliction", "orc", "spell", "MID2_Warlock_Affliction.simc"},
	"demonology-warlock":     {"warlock", "demonology", "orc", "spell", "MID2_Warlock_Demonology.simc"},
	"destruction-warlock":    {"warlock", "destruction", "orc", "spell", "MID2_Warlock_Destruction.simc"},
	"arms-warrior":           {"warrior", "arms", "human", "attack", "MID2_Warrior_Arms.simc"},
	"fury-warrior":           {"warrior", "fury", "human", "attack", "MID2_Warrior_Fury.simc"},
	"protection-warrior":     {"warrior", "protection", "human", "tank", "MID2_Warrior_Protection.simc"},
}
