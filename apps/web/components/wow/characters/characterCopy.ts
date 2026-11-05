import type { Lang } from "@/lib/i18n-paths";
/**
 * Interface copy of the account pages: sign-in, the character roster
 * (/wow/characters) and the character profile states (error, loading).
 * Game terms use original localized sources; user names are preserved.
 */
export type CharacterLocale = Lang;

export type RosterCopy = {
  searchLabel: string;
  searchPlaceholder: string;
  classLabel: string;
  allClasses: string;
  rosterTitle: string;
  /** "{total}" and "{shown}" are replaced on the client. */
  countAll: string;
  countFiltered: string;
  loadingRegions: string;
  emptyTitle: string;
  emptyText: string;
  noMatches: string;
  reset: string;
  openProfile: string;
  armory: string;
  level: string;
  stateTitle: Record<"expired" | "forbidden" | "rate-limited" | "unavailable", string>;
  stateText: Record<"expired" | "forbidden" | "rate-limited" | "unavailable", string>;
  retry: string;


};

const en = {
  wow: "World of Warcraft",
  characters: "Characters",
  signIn: "Sign in",
  breadcrumbsLabel: "Breadcrumbs",
  entry: {
    eyebrow: "Battle.net",
    title: "Account characters",
    lede: "Sign in with Battle.net to open your WoW heroes: equipment, talents and combat tools for each one.",
    passwordNote: "Your password stays with Blizzard.",
    expiredTitle: "Battle.net session expired",
    expiredText: "Connect your account again to refresh access to your character list.",
    unlocksTitle: "What opens after sign-in",
    unlocks: [
      { title: "Equipment", text: "Every slot of your hero: item level, enchants and gems, with upgrades to farm or buy." },
      { title: "Talents", text: "The hero’s active build in the talent calculator, ready to tune and compare.", href: "/wow/classes" },
      { title: "Combat tools", text: "Damage simulation for your build and a breakdown of real fights from your logs." },
    ] as { title: string; text: string; href?: string }[],
  },
  roster: {
    eyebrowConnected: "Battle.net",
    title: "Account characters",
    lede: "Choose a hero to open their equipment, talents and combat tools.",
    signOut: "Sign out",
  },
  profile: {
    eyebrow: "Battle.net profile",
    loadingTitle: "Loading the character…",
    errors: {
      expired: ["Battle.net session expired", "Reconnect your account to load this character again."],
      forbidden: ["Profile access denied", "Battle.net denied profile access. Reconnect and approve the WoW profile permission."],
      rate_limited: ["Too many requests", "Battle.net temporarily limited updates. Wait about a minute and try again."],
      incomplete: ["Profile is incomplete", "Battle.net did not return equipment or an active specialization. Log out of the game and refresh."],
      unavailable: ["Battle.net is temporarily unavailable", "Please try again in a minute."],
    },
    reconnect: "Reconnect Battle.net",
    retry: "Try again",
    backToRoster: "Back to characters",
  },
  rosterList: {
    searchLabel: "Find a character",
    searchPlaceholder: "Name, realm or class…",
    classLabel: "Class",
    allClasses: "All classes",
    rosterTitle: "Your heroes",
    countAll: "{total} characters",
    countFiltered: "{shown} of {total} characters",
    loadingRegions: "Checking Battle.net regions…",
    emptyTitle: "No characters found",
    emptyText: "No World of Warcraft characters are available to this Battle.net account in EU, US, KR or TW.",
    noMatches: "No characters match the selected filters.",
    reset: "Reset filters",
    openProfile: "Open profile",
    armory: "Armory",
    level: "Level",
    stateTitle: {
      expired: "Battle.net session expired",
      forbidden: "World of Warcraft access was not granted",
      "rate-limited": "Battle.net request limit reached",
      unavailable: "Battle.net is temporarily unavailable",
    },
    stateText: {
      expired: "Connect your account again to refresh access to your character list.",
      forbidden: "Reconnect Battle.net and confirm access to your WoW profile. If no permission screen appears, remove Gildra from Battle.net authorized applications and connect again.",
      "rate-limited": "The account is connected. Wait a minute and try loading the characters again.",
      unavailable: "The account is connected, but every regional character request failed. Please try again shortly.",
    },
    retry: "Try again",
  } satisfies RosterCopy,
};

const ru: typeof en = {
  wow: "World of Warcraft",
  characters: "Персонажи",
  signIn: "Вход",
  breadcrumbsLabel: "Навигационная цепочка",
  entry: {
    eyebrow: "Battle.net",
    title: "Персонажи аккаунта",
    lede: "Войдите через Battle.net, чтобы открыть своих героев WoW: экипировку, таланты и боевые инструменты каждого.",
    passwordNote: "Пароль остаётся у Blizzard.",
    expiredTitle: "Сессия Battle.net истекла",
    expiredText: "Подключите аккаунт заново, чтобы обновить доступ к списку персонажей.",
    unlocksTitle: "Что откроется после входа",
    unlocks: [
      { title: "Экипировка", text: "Каждый слот героя: уровень предметов, чары и камни, а ещё улучшения, которые можно добыть или купить." },
      { title: "Таланты", text: "Активный билд героя в калькуляторе талантов — настраивайте и сравнивайте.", href: "/ru/wow/classes" },
      { title: "Боевые инструменты", text: "Симуляция урона вашего билда и разбор реальных боёв по логам." },
    ],
  },
  roster: {
    eyebrowConnected: "Battle.net",
    title: "Персонажи аккаунта",
    lede: "Выберите героя, чтобы открыть его экипировку, таланты и боевые инструменты.",
    signOut: "Выйти",
  },
  profile: {
    eyebrow: "Профиль Battle.net",
    loadingTitle: "Загружаем персонажа…",
    errors: {
      expired: ["Сессия Battle.net истекла", "Переподключите аккаунт, чтобы снова получить профиль персонажа."],
      forbidden: ["Нет доступа к профилю", "Battle.net отклонил доступ. Переподключите аккаунт и подтвердите разрешение профиля WoW."],
      rate_limited: ["Слишком много запросов", "Battle.net временно ограничил обновления. Подождите около минуты и попробуйте снова."],
      incomplete: ["Профиль пока неполный", "Battle.net не вернул экипировку или активную специализацию. Выйдите персонажем из игры и обновите страницу."],
      unavailable: ["Battle.net временно недоступен", "Попробуйте снова через минуту."],
    },
    reconnect: "Переподключить Battle.net",
    retry: "Повторить",
    backToRoster: "К списку персонажей",
  },
  rosterList: {
    searchLabel: "Найти персонажа",
    searchPlaceholder: "Имя, сервер или класс…",
    classLabel: "Класс",
    allClasses: "Все классы",
    rosterTitle: "Ваши герои",
    countAll: "Персонажей: {total}",
    countFiltered: "Показано {shown} из {total}",
    loadingRegions: "Проверяем регионы Battle.net…",
    emptyTitle: "Персонажи не найдены",
    emptyText: "На этом аккаунте Battle.net нет персонажей WoW в регионах EU, US, KR и TW.",
    noMatches: "По выбранным фильтрам персонажи не найдены.",
    reset: "Сбросить фильтры",
    openProfile: "Открыть профиль",
    armory: "Арсенал",
    level: "Уровень",
    stateTitle: {
      expired: "Сессия Battle.net истекла",
      forbidden: "Доступ к персонажам WoW не выдан",
      "rate-limited": "Battle.net ограничил число запросов",
      unavailable: "Battle.net временно недоступен",
    },
    stateText: {
      expired: "Подключите аккаунт заново, чтобы обновить доступ к списку персонажей.",
      forbidden: "Переподключите Battle.net и подтвердите доступ к профилю WoW. Если окно разрешений не появится, удалите Gildra из списка разрешённых приложений Battle.net и подключите снова.",
      "rate-limited": "Аккаунт подключён. Подождите минуту и попробуйте загрузить персонажей ещё раз.",
      unavailable: "Аккаунт подключён, но запрос списка персонажей завершился ошибкой во всех регионах. Попробуйте ещё раз чуть позже.",
    },
    retry: "Повторить",
  },
};

export const characterCopy = { en, ru } as const;

/** Trail shared by every account page: World of Warcraft → Characters → current page. */
export function characterCrumbs(locale: CharacterLocale, current?: string) {
  const copy = characterCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return [
    { label: copy.wow, href: `${prefix}/wow` },
    { label: copy.characters, href: current ? `${prefix}/wow/characters` : undefined },
    ...(current ? [{ label: current }] : []),
  ];
}
