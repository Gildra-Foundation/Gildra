"""The 40 retail specializations as the tier-list collectors name them.

Every source spells specs its own way ("Beast Mastery Hunter", "/death-knight/
unholy", "shuffle-deathknight-unholy", Blizzard spec id 252); everything is
mapped onto the slugs the API already uses (``death-knight`` / ``beast-mastery``)
so that one spec is the same key on every source tab.
"""

from __future__ import annotations

import re
from typing import Iterable, NamedTuple


class Spec(NamedTuple):
    spec_id: int
    class_slug: str
    class_name: str
    spec_slug: str
    spec_name: str
    role: str


_CLASSES = (
    ("warrior", "Warrior", ((71, "arms", "Arms", "dps"), (72, "fury", "Fury", "dps"), (73, "protection", "Protection", "tank"))),
    ("paladin", "Paladin", ((65, "holy", "Holy", "healer"), (66, "protection", "Protection", "tank"), (70, "retribution", "Retribution", "dps"))),
    ("hunter", "Hunter", ((253, "beast-mastery", "Beast Mastery", "dps"), (254, "marksmanship", "Marksmanship", "dps"), (255, "survival", "Survival", "dps"))),
    ("rogue", "Rogue", ((259, "assassination", "Assassination", "dps"), (260, "outlaw", "Outlaw", "dps"), (261, "subtlety", "Subtlety", "dps"))),
    ("priest", "Priest", ((256, "discipline", "Discipline", "healer"), (257, "holy", "Holy", "healer"), (258, "shadow", "Shadow", "dps"))),
    ("death-knight", "Death Knight", ((250, "blood", "Blood", "tank"), (251, "frost", "Frost", "dps"), (252, "unholy", "Unholy", "dps"))),
    ("shaman", "Shaman", ((262, "elemental", "Elemental", "dps"), (263, "enhancement", "Enhancement", "dps"), (264, "restoration", "Restoration", "healer"))),
    ("mage", "Mage", ((62, "arcane", "Arcane", "dps"), (63, "fire", "Fire", "dps"), (64, "frost", "Frost", "dps"))),
    ("warlock", "Warlock", ((265, "affliction", "Affliction", "dps"), (266, "demonology", "Demonology", "dps"), (267, "destruction", "Destruction", "dps"))),
    ("monk", "Monk", ((268, "brewmaster", "Brewmaster", "tank"), (269, "windwalker", "Windwalker", "dps"), (270, "mistweaver", "Mistweaver", "healer"))),
    ("druid", "Druid", ((102, "balance", "Balance", "dps"), (103, "feral", "Feral", "dps"), (104, "guardian", "Guardian", "tank"), (105, "restoration", "Restoration", "healer"))),
    ("demon-hunter", "Demon Hunter", ((577, "havoc", "Havoc", "dps"), (581, "vengeance", "Vengeance", "tank"), (1480, "devourer", "Devourer", "dps"))),
    ("evoker", "Evoker", ((1467, "devastation", "Devastation", "dps"), (1468, "preservation", "Preservation", "healer"), (1473, "augmentation", "Augmentation", "dps"))),
)

SPECS: tuple[Spec, ...] = tuple(
    Spec(spec_id, class_slug, class_name, spec_slug, spec_name, role)
    for class_slug, class_name, specs in _CLASSES
    for spec_id, spec_slug, spec_name, role in specs
)
ROLES = ("dps", "healer", "tank")
ROLE_SIZES = {role: sum(1 for spec in SPECS if spec.role == role) for role in ROLES}

_LETTERS = re.compile(r"[^a-z]+")


def compact(value: str) -> str:
    """``Death Knight`` / ``death-knight`` / ``deathknight`` → ``deathknight``."""
    return _LETTERS.sub("", value.lower())


BY_ID = {spec.spec_id: spec for spec in SPECS}
BY_SLUGS = {(spec.class_slug, spec.spec_slug): spec for spec in SPECS}
BY_COMPACT = {(compact(spec.class_slug), compact(spec.spec_slug)): spec for spec in SPECS}
# "Beast Mastery Hunter" (spec first, the way most tier lists caption a spec).
BY_FULL_NAME = {compact(f"{spec.spec_name} {spec.class_name}"): spec for spec in SPECS}


def by_full_name(name: str) -> Spec | None:
    return BY_FULL_NAME.get(compact(name))


def by_parts(class_part: str, spec_part: str) -> Spec | None:
    return BY_COMPACT.get((compact(class_part), compact(spec_part)))


def ckmeans_tiers(values: Iterable[float], labels: tuple[str, ...] = ("S", "A", "B", "C", "D")) -> list[str]:
    """Tier letters by optimal 1-D clustering (Ckmeans: least squares within
    each cluster), highest values first. Used only where a source publishes a
    ranking and a number but no tiers; the payload marks such tiers derived.
    Equal values always share a tier.
    """
    data = [float(value) for value in values]
    count = len(data)
    if count == 0:
        return []
    order = sorted(range(count), key=lambda index: -data[index])
    ordered = [data[index] for index in order]
    clusters = min(len(labels), len(set(ordered)))
    if clusters <= 1:
        return [labels[0]] * count
    prefix = [0.0]
    squares = [0.0]
    for value in ordered:
        prefix.append(prefix[-1] + value)
        squares.append(squares[-1] + value * value)

    def cost(start: int, end: int) -> float:  # inclusive indices
        size = end - start + 1
        total = prefix[end + 1] - prefix[start]
        return squares[end + 1] - squares[start] - total * total / size

    infinity = float("inf")
    best = [[infinity] * count for _ in range(clusters)]
    split = [[0] * count for _ in range(clusters)]
    for end in range(count):
        best[0][end] = cost(0, end)
    for cluster in range(1, clusters):
        for end in range(cluster, count):
            for start in range(cluster, end + 1):
                candidate = best[cluster - 1][start - 1] + cost(start, end)
                if candidate < best[cluster][end] - 1e-12:
                    best[cluster][end] = candidate
                    split[cluster][end] = start
    bounds: list[int] = []
    end = count - 1
    for cluster in range(clusters - 1, 0, -1):
        start = split[cluster][end]
        bounds.append(start)
        end = start - 1
    starts = sorted(bounds)
    tiers_by_position: list[str] = []
    cluster_index = 0
    for position in range(count):
        while cluster_index < len(starts) and position >= starts[cluster_index]:
            cluster_index += 1
        tiers_by_position.append(labels[cluster_index])
    # Ties never straddle a boundary: a value takes the best tier any equal value got.
    best_for_value: dict[float, str] = {}
    for value, tier in zip(ordered, tiers_by_position):
        best_for_value.setdefault(value, tier)
    result = [""] * count
    for position, index in enumerate(order):
        result[index] = best_for_value[ordered[position]]
    return result
