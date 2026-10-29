import type { RouteText, RouteAction } from "./midnightRaidRoutes";
import type { RaidProgression } from "./raidProgression";

export type RaidPullRole = "tank" | "healer" | "dps";
export type RaidMapImage = { id: string; name: RouteText; src: string; width: number; height: number; sourceURL?: string };
export type RaidMapPin = { bossSlug: string; x: number; y: number; coordinateKind?: string };
export type RaidMapAtlas = {
  floors: (RaidMapImage & { pins: RaidMapPin[];  })[];
  arenas: Record<string, RaidMapImage[]>;
  sources: { title: string; url: string }[];
  progression?: RaidProgression;
};
export type RaidPullEnemy = {
  name: RouteText;
  count?: number;
  npcId?: number;
  priority: "critical" | "high" | "normal" | "boss";
  note?: RouteText;
  artwork?: string;
};
export type RaidPullAbility = {
  spellId?: number;
  name: RouteText;
  icon?: string;
  caster?: RouteText;
  action?: RouteAction;
  roles: RaidPullRole[];
  effect?: RouteText;
  response?: RouteText;
  heroic?: RouteText;
  heroicOnly?: boolean;
};
export type RaidEncounterDiagram = {
  layout: "circle" | "grid" | "lane" | "split" | "ring";
  markers: { kind: "boss" | "add" | "objective" | RaidPullRole | "group"; x: number; y: number; label: RouteText }[];
  zones: { kind: "danger" | "safe" | "soak" | "wall"; x: number; y: number; width: number; height: number; label: RouteText; rotate?: number }[];
};
export type RaidPull = {
  id: string;
  kind: "trash" | "boss" | "rally";
  title: RouteText;
  area?: RouteText;
  x: number;
  y: number;
  call: RouteText;
  direction?: RouteText;
  steps: RouteText[];
  next?: RouteText;
  bossSlug?: string;
  enemies: RaidPullEnemy[];
  abilities: RaidPullAbility[];
  roles: Record<RaidPullRole, RouteText[]>;
};
export type RaidPullPlan = {
  encounter?: { bossSlug: string; summary: RouteText; diagrams: Record<string, RaidEncounterDiagram> };
  slug: string;
  name: RouteText;
  artwork: string;
  atlas?: RaidMapAtlas;
  routePath: string;
  entrance: { x: number; y: number };
  pulls: RaidPull[];
  bosses: { slug: string; name: RouteText; artwork?: string; x: number; y: number }[];
  note: RouteText;
  coverage: "route-draft" | "encounters";
  sources: { title: string; url: string }[];
};
