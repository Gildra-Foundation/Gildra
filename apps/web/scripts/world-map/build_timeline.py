"""Build apps/web/data/wow/map/events.json and eras-meta.json.

Inputs (--data DIR):
  UiMap.jsonl, UiMapAssignment.jsonl, UiMapLink.jsonl  rows of catalog_db2_rows
      (retail build 12.1.5.70575), one JSON object per line: {"locale":..,"row":{..}}, e.g.
      psql -At -c "SELECT json_build_object('locale',locale,'row',payload) FROM catalog_db2_rows
                   WHERE table_name='UiMap' AND build_id=<retail> AND locale IN ('en_US','ru_RU')"
  AreaPOI.csv  DB2 export of the current retail client (wago.tools/db2/AreaPOI/csv)
Usage (from apps/web): python3 -I scripts/world-map/build_timeline.py --data /tmp/mapt6 [--methods out.md]
"""
import argparse, csv, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from timeline_events import E  # noqa: E402

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "wow", "map"))
ERA_BY_MAJOR = {1: "vanilla", 2: "tbc", 3: "wrath", 4: "cataclysm", 5: "mop", 6: "wod", 7: "legion",
                8: "bfa", 9: "shadowlands", 10: "dragonflight", 11: "tww", 12: "midnight"}


def num(v):
    try:
        return float(v)
    except ValueError:
        return v


class Geo:
    def __init__(self, d):
        rows = lambda n: [json.loads(l) for l in open(os.path.join(d, n + ".jsonl"))]
        self.ui = {}
        for o in rows("UiMap"):
            self.ui.setdefault(int(o["row"]["ID"]), {})[o["locale"]] = o["row"]
        self.by_ui = {}
        for o in rows("UiMapAssignment"):
            a = {k: num(v) for k, v in o["row"].items()}
            self.by_ui.setdefault(int(a["UiMapID"]), []).append(a)
        self.links = {}
        for o in rows("UiMapLink"):
            r = o["row"]
            self.links.setdefault((int(r["ParentUiMapID"]), int(r["ChildUiMapID"])), r)
        self.poi = {int(r["ID"]): r for r in csv.DictReader(open(os.path.join(d, "AreaPOI.csv"), newline=""))}

    def pick(self, ui, mapid, X, Y):
        best = None
        for a in self.by_ui.get(ui, []):
            if int(a["MapID"]) != mapid or not (a["Region_0"] <= X <= a["Region_3"] and a["Region_1"] <= Y <= a["Region_4"]):
                continue
            area = (a["Region_3"] - a["Region_0"]) * (a["Region_4"] - a["Region_1"])
            if best is None or area < best[0]:
                best = (area, a)
        return best[1] if best else None

    @staticmethod
    def uv(a, X, Y):
        u = a["UiMin_0"] + (a["Region_4"] - Y) / (a["Region_4"] - a["Region_1"]) * (a["UiMax_0"] - a["UiMin_0"])
        v = a["UiMin_1"] + (a["Region_3"] - X) / (a["Region_3"] - a["Region_0"]) * (a["UiMax_1"] - a["UiMin_1"])
        return u, v

    def project(self, ui, mapid, X, Y):
        a = self.pick(ui, mapid, X, Y)
        if not a:
            raise ValueError(f"world point {mapid}:{X},{Y} is outside UiMap {ui}")
        return self.uv(a, X, Y), int(a["ID"])

    def rect(self, child, parent):
        for a in self.by_ui.get(child, []):
            if a["UiMin_0"] != 0 or a["UiMax_0"] != 1:
                continue
            p = self.pick(parent, int(a["MapID"]), (a["Region_0"] + a["Region_3"]) / 2, (a["Region_1"] + a["Region_4"]) / 2)
            if p:
                x0, y0 = self.uv(p, a["Region_3"], a["Region_4"])
                x1, y1 = self.uv(p, a["Region_0"], a["Region_1"])
                return (x0, y0, x1, y1), int(p["ID"]), int(a["ID"])
        raise ValueError(f"UiMap {child} has no rectangle inside {parent}")

    def resolve(self, mapId, anchor):
        kind = anchor[0]
        if kind == "poi":
            p = self.poi[anchor[1]]
            (x, y), aid = self.project(mapId, int(p["ContinentID"]), float(p["Pos_0"]), float(p["Pos_1"]))
            return (x, y), f"AreaPOI {anchor[1]} “{p['Name_lang']}” (map {p['ContinentID']}: {float(p['Pos_0']):.1f}, {float(p['Pos_1']):.1f}) projected through UiMapAssignment {aid}"
        if kind == "rect":
            (x0, y0, x1, y1), pid, cid = self.rect(anchor[1], mapId)
            name = self.ui[anchor[1]]["en_US"]["Name_lang"]
            return ((x0 + x1) / 2, (y0 + y1) / 2), f"centre of UiMap {anchor[1]} “{name}” (UiMapAssignment {cid}) inside UiMap {mapId} (UiMapAssignment {pid})"
        if kind == "link":
            r = self.links[(mapId, anchor[1])]
            x0, y0, x1, y1 = (float(r[k]) for k in ("UiMin_0", "UiMin_1", "UiMax_0", "UiMax_1"))
            name = self.ui[anchor[1]]["en_US"]["Name_lang"]
            return ((x0 + x1) / 2, (y0 + y1) / 2), f"centre of UiMapLink {r['ID']} (UiMap {mapId} → {anchor[1]} “{name}”)"
        if kind == "world":
            _, inst, X, Y, label = anchor
            (x, y), aid = self.project(mapId, inst, X, Y)
            return (x, y), f"{label}: map {inst} ({X:.1f}, {Y:.1f}) projected through UiMapAssignment {aid}"
        if kind == "assign":
            for a in self.by_ui[mapId]:
                if int(a["MapID"]) == anchor[1]:
                    return ((a["UiMin_0"] + a["UiMax_0"]) / 2, (a["UiMin_1"] + a["UiMax_1"]) / 2), f"centre of UiMapAssignment {int(a['ID'])} (UiMap {mapId}, instance map {anchor[1]})"
            raise ValueError(anchor)
        if kind == "mid":
            (ax, ay), am = self.resolve(mapId, anchor[1])
            (bx, by), bm = self.resolve(mapId, anchor[2])
            return ((ax + bx) / 2, (ay + by) / 2), f"midpoint of [{am}] and [{bm}]"
        raise ValueError(anchor)


ERAS = [
    ("vanilla", "Classic", "Классика", "World of Warcraft", "1.1.0", "1.12.3", 2004, 2007, "#c8a24a",
     "Crossed Alliance lion and Horde wolf on a gold shield", "Скрещённые лев Альянса и волк Орды на золотом щите"),
    ("tbc", "The Burning Crusade", "The Burning Crusade", "The Burning Crusade", "2.0.1", "2.4.3", 2007, 2008, "#6cc24a",
     "The Dark Portal arch in fel-green light", "Арка Темного портала в зелёном свете Скверны"),
    ("wrath", "Wrath of the Lich King", "Wrath of the Lich King", "Wrath of the Lich King", "3.0.2", "3.3.5a", 2008, 2010, "#7cc4ef",
     "Frostmourne over the Helm of Domination", "Ледяная Скорбь над Шлемом Господства"),
    ("cataclysm", "Cataclysm", "Cataclysm", "Cataclysm", "4.0.1", "4.3.4", 2010, 2012, "#e0562b",
     "Deathwing's molten jaw cracking the world", "Раскалённая пасть Смертокрыла, раскалывающая мир"),
    ("mop", "Mists of Pandaria", "Mists of Pandaria", "Mists of Pandaria", "5.0.4", "5.4.8", 2012, 2014, "#3fae8c",
     "Jade serpent coiled around a pandaren lantern", "Нефритовый змей вокруг пандаренского фонаря"),
    ("wod", "Warlords of Draenor", "Warlords of Draenor", "Warlords of Draenor", "6.0.2", "6.2.4a", 2014, 2016, "#b5552f",
     "Iron Horde banner with a riveted tusk", "Знамя Железной Орды с клыком на заклёпках"),
    ("legion", "Legion", "Legion", "Legion", "7.0.3", "7.3.5", 2016, 2018, "#4fdc5f",
     "Crossed warglaives over a fel sigil", "Скрещённые боевые клинки над знаком Скверны"),
    ("bfa", "Battle for Azeroth", "Battle for Azeroth", "Battle for Azeroth", "8.0.1", "8.3.7", 2018, 2020, "#d4a63a",
     "An azerite shard splitting a blue and red crest", "Осколок азерита, раскалывающий сине-красный герб"),
    ("shadowlands", "Shadowlands", "Shadowlands", "Shadowlands", "9.0.1", "9.2.7", 2020, 2022, "#9fb3cc",
     "Oribos rings bound by the Jailer's chains", "Кольца Орибоса, скованные цепями Тюремщика"),
    ("dragonflight", "Dragonflight", "Dragonflight", "Dragonflight", "10.0.0", "10.2.7", 2022, 2024, "#e8913a",
     "Five dragonflight wings fanned around an egg", "Пять крыльев драконьих стай вокруг яйца"),
    ("tww", "The War Within", "The War Within", "The War Within", "11.0.0", "11.2.7", 2024, 2026, "#c58a4e",
     "Earthen hammer over a nerubian web", "Молот земельников над паутиной нерубов"),
    ("midnight", "Midnight", "Midnight", "Midnight", "12.0.0", None, 2026, None, "#8b6cff",
     "The Sunwell eclipsed by a void crescent", "Солнечный Колодец, затмеваемый серпом Бездны"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--methods")
    args = ap.parse_args()
    g = Geo(args.data)
    out, methods = [], []
    for e in E:
        (x, y), how = g.resolve(e["mapId"], e["anchor"])
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise SystemExit(f"{e['id']}: {x:.4f},{y:.4f} outside 0..1")
        era = ERA_BY_MAJOR[int(e["patch"].split(".")[0])]
        o = {"id": e["id"], "eraId": era, "patch": e["patch"], "year": e["year"], "kind": e["kind"],
             "title": e["title"], "summary": e["summary"], "mapId": e["mapId"], "x": round(x, 4), "y": round(y, 4)}
        for k in ("beforeEraId", "afterEraId", "changedMapIds", "links"):
            if e[k]:
                o[k] = e[k]
        out.append(o)
        name = g.ui[e["mapId"]]["en_US"]["Name_lang"]
        methods.append((e, era, name, round(x, 4), round(y, 4), how))
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "events.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    meta = [{"id": i, "name": {"en": en, "ru": ru}, "expansion": exp, "patchRange": {"from": a, "to": b},
             "years": {"from": y0, "to": y1}, "accent": acc, "emblem": {"en": em_en, "ru": em_ru}}
            for i, en, ru, exp, a, b, y0, y1, acc, em_en, em_ru in ERAS]
    with open(os.path.join(OUT, "eras-meta.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    if args.methods:
        with open(args.methods, "w") as f:
            for e, era, name, x, y, how in methods:
                f.write(f"### `{e['id']}` — {e['title']['en']} ({e['patch']}, {era})\n\n")
                f.write(f"- Position: UiMap {e['mapId']} “{name}”, x={x}, y={y} — {how}.\n")
                if e.get("note"):
                    f.write(f"- Note: {e['note']}\n")
                f.write("- Sources: " + "; ".join(f"<{s}>" for s in e["sources"]) + "\n\n")
    print(f"{len(out)} events, {len(meta)} eras")


if __name__ == "__main__":
    main()
