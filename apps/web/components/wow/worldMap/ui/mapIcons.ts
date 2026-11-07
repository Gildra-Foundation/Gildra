import { Bird, CaseSensitive, Castle, Crown, DoorOpen, Flame, Hourglass, Mountain, Orbit, Pickaxe, Skull, Sparkles, Swords, Tent, Wind } from "lucide-react";
import type { PoiKind } from "@/lib/wow/worldMap/types";
import type { Layers } from "../mapMarkers";

/** Icons of the map's points (the markers, the legend, the place panel and the tooltips share them). */
export const KIND_ICON: Record<PoiKind, typeof Crown> = {
  capital: Crown, city: Castle, town: Tent, flight: Bird, portal: Orbit, dungeon: DoorOpen, raid: Skull, delve: Pickaxe, "zone-label": Castle,
};
/** Runes of world events by what happened: a land revealed, reshaped, a battle, an invasion, a new instance. */
export const EVENT_ICON: Record<string, typeof Crown> = { reveal: Sparkles, reshape: Mountain, battle: Swords, invasion: Flame, instance: DoorOpen };
/** The legend: each layer with the icon its points wear on the map (the kind gives the tint). */
export const LAYER_ICON: Record<keyof Layers, { icon: typeof Crown; kind?: PoiKind | "event" }> = {
  capitals: { icon: Crown, kind: "capital" }, cities: { icon: Castle, kind: "city" }, dungeons: { icon: DoorOpen, kind: "dungeon" },
  raids: { icon: Skull, kind: "raid" }, delves: { icon: Pickaxe, kind: "delve" }, flight: { icon: Bird, kind: "flight" },
  portals: { icon: Orbit, kind: "portal" }, events: { icon: Hourglass, kind: "event" }, labels: { icon: CaseSensitive }, alive: { icon: Wind },
};
