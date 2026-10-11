/**
 * Interface copy of the account pages: sign-in (/login), the character roster
 * (/wow/characters) and the character profile states (error, loading).
 * Game terms stay English; everything else is localized.
 */
export type CharacterLocale = "en" | "ru";

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
  loadingText: string;
  emptyTitle: string;
  emptyText: string;
  noMatches: string;
  reset: string;
  openProfile: string;
  armory: string;
  level: string;
  realm: string;
  stateTitle: Record<"expired" | "forbidden" | "rate-limited" | "unavailable", string>;
  stateText: Record<"expired" | "forbidden" | "rate-limited" | "unavailable", string>;
  reconnectEyebrow: string;
  retry: string;
};

const en = {
  wow: "World of Warcraft",
  characters: "Characters",
  signIn: "Sign in",
  breadcrumbsLabel: "Breadcrumbs",
  secureEyebrow: "Secure Battle.net sign-in",
  passwordNote: "Your password is entered only on Blizzard’s site.",
  scopeNote: "Only access to your WoW profile is requested.",
  entry: {
    eyebrow: "Official Blizzard profile",
    title: "Account characters",
    lede: "Sign in with Battle.net and your WoW characters load from the official profile: equipment, talents and combat tools for each hero.",
    panelTitle: "Connect your Battle.net account",
    panelText: "Gildra never shows sample characters — only the ones on your account.",
    expiredTitle: "Battle.net session expired",
    expiredText: "Connect your account again to refresh access to your character list.",
  },
  roster: {
    eyebrowConnected: "Battle.net connected",
    title: "Account characters",
    lede: "Choose a hero to open their equipment, talents and combat tools.",
    signOut: "Sign out",
  },
  login: {
    eyebrow: "Battle.net account link",
    eyebrowConnected: "Battle.net connected",
    title: "Your characters. Your war room.",
    titleConnected: "Your account is connected.",
    lede: "Connect Battle.net once and your WoW characters appear in Gildra.",
    ledeConnected: "Open your roster and choose a hero to inspect.",
    panelTitle: "Account sign in",
    panelText: "Sign in on Battle.net’s secure site; Gildra never sees your password.",
    connectedTitle: "Account connected",
    signedInAs: "Signed in as",
    connectedFallback: "Battle.net connected",
    viewCharacters: "View characters",
    notConfiguredTitle: "Sign-in is unavailable",
    notConfiguredText: "Battle.net sign-in is temporarily unavailable. Please try again later.",
  },
  profile: {
    eyebrow: "Battle.net profile",
    loadingTitle: "Loading the character…",
    loadingText: "The profile appears as soon as Battle.net returns the data.",
    errors: {
      expired: ["Battle.net session expired", "Reconnect your account to load this character again."],
      forbidden: ["Profile access denied", "Battle.net denied profile access. Reconnect and approve the WoW profile permission."],
      rate_limited: ["Too many requests", "Battle.net temporarily limited updates. Wait about a minute and try again."],
      incomplete: ["Profile is incomplete", "Battle.net did not return equipment or an active specialization. Log out of the game and refresh."],
      unavailable: ["Battle.net is temporarily unavailable", "We do not substitute demo data for your character. Please try again later."],
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
    rosterTitle: "Battle.net roster",
    countAll: "{total} characters",
    countFiltered: "{shown} of {total} characters",
    loadingRegions: "Checking Battle.net regions…",
    loadingText: "Retrieving characters from your official profile.",
    emptyTitle: "No characters found",
    emptyText: "No World of Warcraft characters are available to this Battle.net account in EU, US, KR or TW.",
    noMatches: "No characters match the selected filters.",
    reset: "Reset filters",
    openProfile: "Open profile",
    armory: "Armory",
    level: "Level",
    realm: "Realm",
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
    reconnectEyebrow: "Battle.net",
    retry: "Try again",
  } satisfies RosterCopy,
};

const ru: typeof en = {
  wow: "World of Warcraft",
  characters: "Персонажи",
  signIn: "Вход",
  breadcrumbsLabel: "Навигационная цепочка",
  secureEyebrow: "Защищённый вход Battle.net",
  passwordNote: "Пароль вводится только на сайте Blizzard.",
  scopeNote: "Запрашивается только доступ к профилю WoW.",
  entry: {
    eyebrow: "Официальный профиль Blizzard",
    title: "Персонажи аккаунта",
    lede: "Войдите через Battle.net — и персонажи WoW загрузятся из официального профиля: экипировка, таланты и боевые инструменты каждого героя.",
    panelTitle: "Подключите аккаунт Battle.net",
    panelText: "Gildra не показывает тестовых персонажей — только тех, что есть на вашем аккаунте.",
    expiredTitle: "Сессия Battle.net истекла",
    expiredText: "Подключите аккаунт заново, чтобы обновить доступ к списку персонажей.",
  },
  roster: {
    eyebrowConnected: "Battle.net подключён",
    title: "Персонажи аккаунта",
    lede: "Выберите героя, чтобы открыть его экипировку, таланты и боевые инструменты.",
    signOut: "Выйти",
  },
  login: {
    eyebrow: "Подключение Battle.net",
    eyebrowConnected: "Battle.net подключён",
    title: "Ваши персонажи. Ваш боевой штаб.",
    titleConnected: "Ваш аккаунт подключён.",
    lede: "Подключите Battle.net один раз — и персонажи WoW появятся в Gildra.",
    ledeConnected: "Откройте список персонажей и выберите героя для разбора.",
    panelTitle: "Вход в аккаунт",
    panelText: "Войдите на защищённом сайте Battle.net — пароль останется у Blizzard.",
    connectedTitle: "Аккаунт подключён",
    signedInAs: "Вы вошли как",
    connectedFallback: "Battle.net подключён",
    viewCharacters: "Показать персонажей",
    notConfiguredTitle: "Вход недоступен",
    notConfiguredText: "Вход через Battle.net временно недоступен. Попробуйте позже.",
  },
  profile: {
    eyebrow: "Профиль Battle.net",
    loadingTitle: "Загружаем персонажа…",
    loadingText: "Профиль появится, как только Battle.net вернёт данные.",
    errors: {
      expired: ["Сессия Battle.net истекла", "Переподключите аккаунт, чтобы снова получить профиль персонажа."],
      forbidden: ["Нет доступа к профилю", "Battle.net отклонил доступ. Переподключите аккаунт и подтвердите разрешение профиля WoW."],
      rate_limited: ["Слишком много запросов", "Battle.net временно ограничил обновления. Подождите около минуты и попробуйте снова."],
      incomplete: ["Профиль пока неполный", "Battle.net не вернул экипировку или активную специализацию. Выйдите персонажем из игры и обновите страницу."],
      unavailable: ["Battle.net временно недоступен", "Мы не подставляем тестовые данные вместо вашего персонажа. Попробуйте снова чуть позже."],
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
    rosterTitle: "Ростер Battle.net",
    countAll: "Персонажей: {total}",
    countFiltered: "Показано {shown} из {total}",
    loadingRegions: "Проверяем регионы Battle.net…",
    loadingText: "Получаем список героев из официального профиля.",
    emptyTitle: "Персонажи не найдены",
    emptyText: "На этом аккаунте Battle.net нет персонажей WoW в регионах EU, US, KR и TW.",
    noMatches: "По выбранным фильтрам персонажи не найдены.",
    reset: "Сбросить фильтры",
    openProfile: "Открыть профиль",
    armory: "Арсенал",
    level: "Уровень",
    realm: "Сервер",
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
    reconnectEyebrow: "Battle.net",
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
