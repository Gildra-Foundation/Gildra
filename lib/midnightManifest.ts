export const midnightManifest = {
  product: "wow",
  patch: "12.1",
  clientBuild: "12.1.0.69587",
  buildNumber: 69587,
  expansionId: 11,
  manifestVersion: "2026-09-06.1",
  locale: "ru_RU",
  traitTreeId: 850,
  classId: 1,
  specId: 72,
  heroSubtreeId: 60,
  furyPvpTalentIds: [177, 179, 3528, 3533, 3735, 5373, 5548, 5624, 5678, 5702],
  sourceIds: ["raidbots-topology", "wago_tools-db2", "catalog_entity_tooltips"],
  importedAt: "2026-08-30",
  hotfixThrough: null as string | null,
} as const;

export const midnightSnapshotLabel = `Срез Midnight ${midnightManifest.clientBuild}`;
