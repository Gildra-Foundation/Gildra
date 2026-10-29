import type { RaidPullPlan } from "./raidPullTypes";

// Authored gathering points for the recommended pull order, not NPC spawns.
// Patrols move; the schematic and arena use their own coordinate plane.
const gatheringPoints = [
  { floor: "16340-0", x: 34, y: 79 },
  { floor: "16340-0", x: 39, y: 54 },
  { floor: "16340-0", x: 32, y: 40 },
  { floor: "16340-0", x: 51, y: 68 },
  { floor: "16340-0", x: 51, y: 54 },
  { floor: "16340-0", x: 65, y: 39 },
  { floor: "16340-1", x: 47, y: 72 },
];

// Waypoints include the required boss stops and the return from each wing.
const floorPaths: Record<string, string> = {
  "16340-0": "M 28 86 L 34 79 L 39.8 68.5 L 44 61 L 39 54 L 32 40 L 42.5 35.2 L 44 49 L 46 60 L 51 68 L 58 70 L 65.6 76.4 L 58 65 L 51 54 L 55.4 46 L 61 43 L 65 39 L 67 32 L 75.8 17.3",
  "16340-1": "M 47 90 L 47 72 L 47.2 51.3",
};

export function raidPullRouteModel(plan: RaidPullPlan, background: "map" | "arena", imageId: string) {
  if (plan.slug !== "the-voidspire" || plan.encounter) return undefined;
  const markers = plan.pulls.flatMap((pull, index) => {
    const point = gatheringPoints[index];
    if (!point || background === "map" && point.floor !== imageId) return [];
    // Spread the schematic markers over the wide arena image for clear targets.
    return [{ index, x: background === "map" ? point.x : 12 + index * 12.5, y: background === "map" ? point.y : index % 2 ? 62 : 35 }];
  });
  return {
    markers,
    path: background === "map" ? floorPaths[imageId] ?? "" : markers.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "),
    schematic: background === "arena",
  };
}
