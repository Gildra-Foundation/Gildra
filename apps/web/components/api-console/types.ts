export type PanelUser = { id: string; email: string; displayName: string; role: string };
export type SystemStatus = { name: string; status: "operational" | "degraded"; latencyMs: number };
export type DatasetSummary = {
  id: string; slug: string; name: string; sourceName: string;
  lastAttemptAt: string | null; lastSuccessAt: string | null;
  lastErrorCode: string; lastErrorSummary: string;
  pageCount: number; recordCount: number; uniqueSpecCount: number; sourceFetchedAt: string | null;
};
export type DatasetListItem = {
  id: string; slug: string; name: string; sourceName: string;
  refreshIntervalSeconds: number; lastAttemptAt: string | null; lastSuccessAt: string | null;
  freshUntil: string | null; freshness: "fresh" | "stale" | "never";
  lastErrorCode: string; lastErrorSummary: string;
  pageCount: number; recordCount: number; uniqueSpecCount: number;
};
export type DatasetRun = {
  id: string; trigger: string; status: string; scheduledFor: string;
  startedAt: string | null; finishedAt: string | null; pageCount: number;
  recordCount: number; uniqueSpecCount: number; errorSummary: string;
};
export type AnalyticsPoint = { hour: string; events: number; uniqueUsers: number };
export type CatalogHealth = {
  entityCount: number; localizedCount: number; describedCount: number; tooltipCount: number;
  iconCount: number; relationshipCount: number; readModelStatus: "fresh" | "refreshing" | "stale" | "failed";
  activeBuildVersion: string;
  generation: number; refreshedAt: string | null;
  lastPipelineRunId: number | null; pipelineStatus: string; pipelineStage: string;
  publicationReady: boolean | null; pipelineStartedAt: string | null; pipelineFinishedAt: string | null;
  imports: CatalogImportStatus[];
};
export type CatalogImportStatus = {
  id: string; source: string; buildVersion: string; status: "RUNNING" | "SUCCEEDED" | "FAILED";
  entityTypes: string[]; locales: string[]; recordsSeen: number; recordsWritten: number;
  liveSourceRecords: number; startedAt: string; finishedAt: string | null;
  lastActivityAt: string | null; errorSummary: string;
};
export type CatalogReadinessCheck = {
  key: string; scope: "data" | "production"; status: "pass" | "warning" | "fail";
  count: number; message: string; blocking: boolean;
};
export type CatalogReadiness = {
  product: string; buildId: number; buildVersion: string; generatedAt: string;
  dataReady: boolean; productionReady: boolean; checks: CatalogReadinessCheck[];
};
export type DashboardData = {
  generatedAt: string; user: PanelUser; systems: SystemStatus[]; dataset: DatasetSummary;
  runs: DatasetRun[]; analytics: { hours: number; events: number; uniqueUsers: number; activeSubscriptions: number; series: AnalyticsPoint[] };
  catalog: CatalogHealth; catalogReadiness: CatalogReadiness;
  endpoints: { method: string; path: string; description: string }[];
};
export type TierlistEntry = {
  activity: string; role: string; tier: string; rankInTier: number;
  className: string; classSlug: string; specName: string; specSlug: string; badgeSlug: string;
  guideTitle: string; guideUrl: string; sourceUrl: string; description: string; descriptionParagraphs: string[];
};
export type ArchonTierAssignment = { tier: string; rank: number };
export type ArchonTierlistEntry = {
  activity: string; difficulty: string; role: string; rank: number; tier: string;
  tierAssignments: Record<string, ArchonTierAssignment>; specId: number | null;
  className: string; classSlug: string; specName: string; specSlug: string; iconSlug: string;
  buildUrl: string; sourceUrl: string; score: number | null; dps: number | null;
  hps: number | null; survivability: number | null; popularity: number | null;
  parses: number; maxKey: number | null; sourceUpdatedAt: string;
};
export type WowGGTierlistContext = {
  contextKey: string; mode: "mythic_plus" | "raid" | "pvp";
  role: "dps" | "healer" | "tank" | "dungeon_ease";
  addonId: string; addonKey: string; addonName: string;
  selectionType: "all" | "dungeon" | "raid" | "boss" | "bracket";
  selectionId: string; selectionName: string; keyType: string; raidDifficulty: string;
  pvpBracket: string; pvpRegion: string; sourceWeek: string; sourceUrl: string;
  sourceUpdatedAt: string; recordCount: number;
};
export type WowGGTierlistEntry = {
  contextKey: string; entityType: "specialization" | "dungeon";
  entityId: string; entityName: string; entitySlug: string; rank: number; tier: string;
  tierAssignments: Record<string, ArchonTierAssignment>;
  className: string | null; classSlug: string | null; specName: string | null; specSlug: string | null;
  role: string; guideUrl: string; sourceUrl: string; metaScore: number | null;
  averageDps: number | null; averageHps: number | null; topValue: number | null;
  popularity: number | null; pvpPlayers: number | null; pvpAverageRating: number | null;
  pvpMaxRating: number | null; pvpMinRating: number | null; maxKey: number | null;
  diffRank: number | null; metricValues: Record<string, number | null>;
};
export type WowGGWeek = { week: string; snapshotId: string; sourceFetchedAt: string };
export type WowGGTierlistResponse = {
  snapshotId: string; contexts: WowGGTierlistContext[]; data: WowGGTierlistEntry[];
  weeks: WowGGWeek[]; count: number;
};
export type IcyVeinsTierlistPage = {
  contextKey: string; activity: "mythic_plus" | "raid" | "pvp";
  role: "dps" | "healer" | "tank"; title: string; authorName: string;
  sourceUrl: string; sourceUpdatedAt: string; recordCount: number;
};
export type IcyVeinsTierlistEntry = {
  contextKey: string; activity: "mythic_plus" | "raid" | "pvp";
  role: "dps" | "healer" | "tank"; tier: string; rankInTier: number;
  className: string; classSlug: string; specName: string; specSlug: string;
  iconUrl: string; guideUrl: string; sourceUrl: string;
  changeDirection: "up" | "down" | "same" | "unknown";
  description: string; descriptionParagraphs: string[]; sourceUpdatedAt: string;
};
export type IcyVeinsTierlistResponse = {
  snapshotId: string; pages: IcyVeinsTierlistPage[]; data: IcyVeinsTierlistEntry[]; count: number;
};
export type PageInfo = { offset: number; limit: number; total: number; hasMore: boolean };
export type WowClassSummary = {
  className: string; classSlug: string; specCount: number; guideCount: number;
  placementCount: number; sourceCount: number; updatedAt: string;
};
export type WowSpecSummary = {
  className: string; classSlug: string; specName: string; specSlug: string;
  guideCount: number; buildCount: number; placementCount: number; sources: string[];
};
export type WowGuide = { sourceName: string; datasetSlug: string; title: string; url: string };
export type WowPlacement = {
  datasetSlug: string; sourceName: string; activity: string; role: string;
  contextKey: string; contextLabel: string; tier: string; rank: number;
  guideUrl: string; linkKind: "guide" | "build"; sourceUrl: string;
  description: string; sourceUpdatedAt: string; metricLabel: string; metricValue: number | null;
};
export type WowClassListResponse = { data: WowClassSummary[]; count: number; pagination: PageInfo };
export type WowSpecListResponse = { classSlug: string; data: WowSpecSummary[]; count: number; pagination: PageInfo };
export type WowSpecializationResponse = {
  specialization: WowSpecSummary; guides: WowGuide[]; placements: WowPlacement[]; pagination: PageInfo;
};

// Responses of the split console endpoints (see backend/internal/adminpanel/console.go).
export type SystemReport = {
  generatedAt: string; systems: SystemStatus[]; schemaVersion: number;
  recoveryPolicy: string; healthy: boolean;
};
export type CatalogHealthResponse = { generatedAt: string; catalog: CatalogHealth & { warnings?: string[] }; catalogReadiness: CatalogReadiness };
export type AnalyticsOverview = { hours: number; events: number; uniqueUsers: number; activeSubscriptions: number; series: AnalyticsPoint[] };
export type AnalyticsOverviewResponse = { generatedAt: string; analytics: AnalyticsOverview };
export type DatasetDetailResponse = { dataset: DatasetListItem; generatedAt: string };
export type DatasetFreshness = {
  slug: string; freshness: "fresh" | "stale" | "never"; freshUntil: string | null;
  lastSuccessAt: string | null; lastAttemptAt: string | null; refreshIntervalSeconds: number; generatedAt: string;
};
