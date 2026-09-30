export type SignatureGlyphName =
  | "axe" | "beer" | "bird" | "bone" | "cat" | "cloud-rain" | "crosshair"
  | "dice" | "droplets" | "eclipse" | "eye" | "feather" | "flame" | "flask"
  | "gem" | "ghost" | "hand" | "heart" | "leaf" | "moon" | "mountain"
  | "orbit" | "paw" | "shield" | "skull" | "snowflake" | "sparkles" | "sun"
  | "sword" | "swords" | "target" | "tornado" | "waves" | "wind" | "zap"
  | "dragon" | "ice-dragon" | "ghoul" | "bear" | "stag" | "wolf" | "raptor"
  | "phoenix" | "serpent" | "tiger" | "ox" | "demon" | "infernal" | "cloak";

export type SignatureParticles = "blood" | "snow" | "plague" | "stars" | "leaves" | "spores" | "embers" | "mist" | "runes" | "light" | "void" | "feathers" | "dust" | "poison" | "coins" | "shadow" | "storm" | "water" | "steel" | "fel" | "brew";
export type SignatureMotion = "pulse" | "soar" | "lurch" | "orbit" | "prowl" | "breathe" | "stalk" | "surge" | "fade" | "prowl-fast";

export type SpecSignature = {
  primary: SignatureGlyphName;
  secondary: SignatureGlyphName;
  particles: SignatureParticles;
  motion: SignatureMotion;
  title: string;
};

export const SPEC_SIGNATURES: Record<string, SpecSignature> = {
  "blood-death-knight": { primary: "droplets", secondary: "heart", particles: "blood", motion: "pulse", title: "Кровавые руны" },
  "frost-death-knight": { primary: "ice-dragon", secondary: "snowflake", particles: "snow", motion: "soar", title: "Дыхание Синдрагосы" },
  "unholy-death-knight": { primary: "ghoul", secondary: "bone", particles: "plague", motion: "lurch", title: "Армия мёртвых" },

  "balance-druid": { primary: "bird", secondary: "eclipse", particles: "stars", motion: "orbit", title: "Лунный совух" },
  "feral-druid": { primary: "cat", secondary: "paw", particles: "leaves", motion: "prowl-fast", title: "Хищник чащи" },
  "guardian-druid": { primary: "bear", secondary: "shield", particles: "leaves", motion: "breathe", title: "Страж Урсока" },
  "restoration-druid": { primary: "stag", secondary: "leaf", particles: "spores", motion: "stalk", title: "Дух леса" },

  "devastation-evoker": { primary: "dragon", secondary: "flame", particles: "embers", motion: "soar", title: "Драконье пламя" },
  "preservation-evoker": { primary: "dragon", secondary: "orbit", particles: "mist", motion: "breathe", title: "Изумрудный полёт" },
  "augmentation-evoker": { primary: "dragon", secondary: "gem", particles: "runes", motion: "pulse", title: "Чешуя земли" },

  "discipline-priest": { primary: "orbit", secondary: "eye", particles: "light", motion: "orbit", title: "Свет и искупление" },
  "holy-priest": { primary: "feather", secondary: "sun", particles: "light", motion: "soar", title: "Крылья света" },
  "shadow-priest": { primary: "eye", secondary: "skull", particles: "void", motion: "fade", title: "Шёпот Бездны" },

  "beast-mastery-hunter": { primary: "wolf", secondary: "paw", particles: "dust", motion: "prowl", title: "Зов стаи" },
  "marksmanship-hunter": { primary: "bird", secondary: "crosshair", particles: "feathers", motion: "soar", title: "Соколиный прицел" },
  "survival-hunter": { primary: "raptor", secondary: "sword", particles: "dust", motion: "prowl-fast", title: "Охота вблизи" },

  "assassination-rogue": { primary: "flask", secondary: "skull", particles: "poison", motion: "pulse", title: "Смертельный яд" },
  "outlaw-rogue": { primary: "dice", secondary: "swords", particles: "coins", motion: "orbit", title: "Бросок костей" },
  "subtlety-rogue": { primary: "cloak", secondary: "eye", particles: "shadow", motion: "fade", title: "Танец теней" },

  "elemental-shaman": { primary: "tornado", secondary: "zap", particles: "storm", motion: "surge", title: "Ярость стихий" },
  "enhancement-shaman": { primary: "wolf", secondary: "axe", particles: "storm", motion: "prowl-fast", title: "Духи волков" },
  "restoration-shaman": { primary: "serpent", secondary: "waves", particles: "water", motion: "surge", title: "Исцеляющий прилив" },

  "holy-paladin": { primary: "sun", secondary: "feather", particles: "light", motion: "pulse", title: "Маяк Света" },
  "protection-paladin": { primary: "shield", secondary: "mountain", particles: "light", motion: "breathe", title: "Священный оплот" },
  "retribution-paladin": { primary: "sword", secondary: "sun", particles: "light", motion: "surge", title: "Правосудие" },

  "arcane-mage": { primary: "orbit", secondary: "sparkles", particles: "runes", motion: "orbit", title: "Тайная геометрия" },
  "fire-mage": { primary: "phoenix", secondary: "flame", particles: "embers", motion: "soar", title: "Возрождение феникса" },
  "frost-mage": { primary: "ghost", secondary: "snowflake", particles: "snow", motion: "breathe", title: "Ледяной элементаль" },

  "arms-warrior": { primary: "sword", secondary: "target", particles: "steel", motion: "surge", title: "Смертельный удар" },
  "fury-warrior": { primary: "swords", secondary: "axe", particles: "blood", motion: "pulse", title: "Неистовая ярость" },
  "protection-warrior": { primary: "shield", secondary: "mountain", particles: "steel", motion: "breathe", title: "Железная стена" },

  "affliction-warlock": { primary: "skull", secondary: "ghost", particles: "plague", motion: "fade", title: "Пожирание души" },
  "demonology-warlock": { primary: "demon", secondary: "eye", particles: "void", motion: "lurch", title: "Легион демонов" },
  "destruction-warlock": { primary: "infernal", secondary: "flame", particles: "fel", motion: "surge", title: "Огонь Хаоса" },

  "brewmaster-monk": { primary: "ox", secondary: "beer", particles: "brew", motion: "breathe", title: "Стойка Чёрного Быка" },
  "windwalker-monk": { primary: "tiger", secondary: "wind", particles: "leaves", motion: "prowl-fast", title: "Белый Тигр" },
  "mistweaver-monk": { primary: "serpent", secondary: "waves", particles: "mist", motion: "soar", title: "Нефритовая Змея" },

  "havoc-demon-hunter": { primary: "demon", secondary: "swords", particles: "fel", motion: "prowl-fast", title: "Метаморфоза" },
  "vengeance-demon-hunter": { primary: "demon", secondary: "shield", particles: "fel", motion: "pulse", title: "Демонические шипы" },
  "devourer-demon-hunter": { primary: "eye", secondary: "cloak", particles: "void", motion: "fade", title: "Голод Бездны" },
};
