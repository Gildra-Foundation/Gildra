"""UiMap geometry: world <-> map coordinates through UiMapAssignment rows.

World axes: +X is north, +Y is west.  On a map, u grows to the east (left edge
= max Y) and v grows to the south (top edge = max X).  Each assignment row maps
a world box (Region = minX, minY, minZ, maxX, maxY, maxZ) on one MapID onto the
rectangle UiMin..UiMax of its UiMap.
"""

from __future__ import annotations

from collections import defaultdict


def _box(row):
    x0, y0, z0, x1, y1, z1 = row["Region"]
    return x0, y0, z0, x1, y1, z1


def ui_to_world(row, u: float, v: float) -> tuple[float, float]:
    x0, y0, _, x1, y1, _ = _box(row)
    (umin, vmin), (umax, vmax) = row["UiMin"], row["UiMax"]
    fu = (u - umin) / (umax - umin)
    fv = (v - vmin) / (vmax - vmin)
    return x1 - fv * (x1 - x0), y1 - fu * (y1 - y0)


def world_to_ui(row, wx: float, wy: float) -> tuple[float, float]:
    x0, y0, _, x1, y1, _ = _box(row)
    (umin, vmin), (umax, vmax) = row["UiMin"], row["UiMax"]
    fu = (y1 - wy) / (y1 - y0)
    fv = (x1 - wx) / (x1 - x0)
    return umin + fu * (umax - umin), vmin + fv * (vmax - vmin)


def _valid(row) -> bool:
    x0, y0, _, x1, y1, _ = _box(row)
    (umin, vmin), (umax, vmax) = row["UiMin"], row["UiMax"]
    return x1 > x0 and y1 > y0 and umax > umin and vmax > vmin


def _world_area(row) -> float:
    x0, y0, _, x1, y1, _ = _box(row)
    return (x1 - x0) * (y1 - y0)


def _overlap(a, b) -> float:
    ax0, ay0, _, ax1, ay1, _ = _box(a)
    bx0, by0, _, bx1, by1, _ = _box(b)
    w = min(ax1, bx1) - max(ax0, bx0)
    h = min(ay1, by1) - max(ay0, by0)
    return max(0.0, w) * max(0.0, h)


class Geometry:
    def __init__(self, assignments: dict[int, dict], links: dict[int, dict]):
        self.by_map: dict[int, list[dict]] = defaultdict(list)
        self.by_mapid: dict[int, list[dict]] = defaultdict(list)
        for row in assignments.values():
            if not _valid(row):
                continue
            self.by_map[row["UiMapID"]].append(row)
            self.by_mapid[row["MapID"]].append(row)
        self.links = {(l["ParentUiMapID"], l["ChildUiMapID"]): l for l in links.values()}

    def primary(self, ui_map: int):
        rows = self.by_map.get(ui_map)
        if not rows:
            return None
        def key(row):
            (umin, vmin), (umax, vmax) = row["UiMin"], row["UiMax"]
            return (-(umax - umin) * (vmax - vmin), row.get("WMOGroupID", 0) != 0, -_world_area(row), row.get("OrderIndex", 0), row["ID"])
        return min(rows, key=key)

    def rect_in_parent(self, child: int, parent: int) -> tuple[list[float] | None, str | None]:
        link = self.links.get((parent, child))
        if link:
            return [link["UiMin"][0], link["UiMin"][1], link["UiMax"][0], link["UiMax"][1]], "link"
        own = self.primary(child)
        if own is None:
            return None, None
        candidates = [row for row in self.by_map.get(parent, []) if row["MapID"] == own["MapID"]]
        if not candidates:
            return None, None
        child_area = _world_area(own)
        best = max(candidates, key=lambda row: (round(_overlap(own, row) / child_area, 4), -_world_area(row)))
        if _overlap(own, best) <= 0:
            return None, None
        corners = [ui_to_world(own, 0.0, 0.0), ui_to_world(own, 1.0, 1.0)]
        (u0, v0), (u1, v1) = (world_to_ui(best, wx, wy) for wx, wy in corners)
        return [min(u0, u1), min(v0, v1), max(u0, u1), max(v0, v1)], "assignment"

    def locate(self, map_id, wx, wy, wz, allowed: dict[int, int], prefer=(3, 6, 5, 4), areas=(), hint=None, names=None):
        """Allowed UiMap that best contains a world point -> (uiMapId, u, v).

        Rectangles of neighbouring zones overlap, so candidates are ranked by: the
        point's area chain (AreaTable parents, most specific first), a zone name
        hint (", Durotar" in a flight path name), map kind, and how central the
        point sits on the candidate map.
        """
        candidates = {}
        for row in self.by_mapid.get(map_id, []):
            ui_map = row["UiMapID"]
            if ui_map not in allowed:
                continue
            x0, y0, z0, x1, y1, z1 = _box(row)
            if not (x0 <= wx <= x1 and y0 <= wy <= y1):
                continue
            if wz is not None and not (z0 - 1 <= wz <= z1 + 1):
                continue
            u, v = world_to_ui(row, wx, wy)
            if not (0 <= u <= 1 and 0 <= v <= 1):
                continue
            centrality = max(abs(u - 0.5), abs(v - 0.5))
            previous = candidates.get(ui_map)
            if previous is None or centrality < previous[2]:
                candidates[ui_map] = (u, v, centrality, row)
        if not candidates:
            return None
        area_rank = {area: i for i, area in enumerate(areas)}
        def key(item):
            ui_map, (u, v, centrality, row) = item
            own_areas = [r["AreaID"] for r in self.by_map[ui_map] if r["MapID"] == map_id]
            area = min((area_rank[a] for a in own_areas if a in area_rank), default=len(area_rank) + 1)
            kind = allowed[ui_map]
            return (area, name_rank(ui_map), prefer.index(kind) if kind in prefer else len(prefer), round(centrality, 3), ui_map)

        def name_rank(ui_map):
            # hint = (place, zone) from "Place, Zone": a map named like the place wins,
            # then a map named like the zone
            if not hint or not names:
                return 2
            name = names.get(ui_map, "").lower()
            return 0 if name == hint[0].lower() else 1 if len(hint) > 1 and name == hint[1].lower() else 2

        best = min(candidates.items(), key=key)
        ui_map, (u, v, _, _) = best
        area_hit, named, *_ = key(best)
        return ui_map, u, v, area_hit <= len(area_rank), named
