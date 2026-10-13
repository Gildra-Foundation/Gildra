export type PlatformGameId = "wow" | "genshin" | "diablo" | "league";

export type PlatformGame = {
  id: PlatformGameId;
  name: string;
  subtitle: string;
  href: string;
  accent: string;
  iconUrl: string;
};

export type PersonalMetaRow = {
  id: string;
  gameId: PlatformGameId;
  mode: string;
  focus: string;
  focusDetail: string;
  focusIconUrl: string;
  rankLabel: string;
  rankValue: string;
  rankNote: string;
  score: string;
  scoreLabel: string;
  trend: number[];
  change: string;
  changeNote: string;
  changeTone: "positive" | "negative" | "neutral";
  href: string;
};

export type ContinueItem = {
  id: string;
  gameId: PlatformGameId;
  title: string;
  subtitle: string;
  detail: string;
  activity: string;
  activityDetail: string;
  progress: number;
  imageUrl: string;
  href: string;
};

export type SavedBuild = {
  id: string;
  gameId: PlatformGameId;
  title: string;
  subtitle: string;
  updatedAt: string;
  imageUrl: string;
  href: string;
};

export type PatchGroup = {
  gameId: PlatformGameId;
  gameName: string;
  changes: Array<{
    text: string;
    kind: "buff" | "nerf" | "update";
  }>;
};

export type QuickAction = {
  id: string;
  label: string;
  icon: "compare" | "chart" | "list" | "team" | "notes" | "alerts";
  href: string;
};

export type Recommendation = {
  id: string;
  gameId: PlatformGameId;
  eyebrow: string;
  title: string;
  description: string;
  imageUrl: string;
  href: string;
  featured?: boolean;
};

export type PlatformHomeData = {
  profile: { name: string; avatarUrl?: string };
  greeting: string;
  title: string;
  games: PlatformGame[];
  personalMeta: PersonalMetaRow[];
  continueItems: ContinueItem[];
  savedBuilds: SavedBuild[];
  patchPulse: PatchGroup[];
  quickActions: QuickAction[];
  recommendations: Recommendation[];
  labels: {
    nav: { home: string; search: string; patchCenter: string; comparisonLab: string };
    searchPlaceholder: string;
    personalMeta: string;
    personalMetaColumns: string[];
    viewInsights: string;
    continueTitle: string;
    manage: string;
    resume: string;
    savedBuilds: string;
    viewAll: string;
    goToBuilds: string;
    patchPulse: string;
    quickActions: string;
    recommended: string;
  };
  updatedAt: string;
};
