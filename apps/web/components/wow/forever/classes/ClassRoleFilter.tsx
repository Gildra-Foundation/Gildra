"use client";

import { useState } from "react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { playSwap, swapDirection } from "@gildra/atlas-ui/swapMotion";

type Value = "all" | "tank" | "healer" | "damage";

/**
 * The role filter of the class roster: it marks the roster, and CSS (classes.module.css) hides
 * the trees of other roles and the classes without them. Without JavaScript all stay.
 */
export function ClassRoleFilter({ target, label, labels }: { target: string; label: string; labels: Record<Value, string> }) {
  const [value, setValue] = useState<Value>("all");
  return <AtlasSegmented size="sm" aria-label={label} value={value}
    onValueChange={next => {
      const role = next as Value;
      const roster = document.getElementById(target);
      const fromHeight = roster?.getBoundingClientRect().height;
      setValue(role);
      roster?.setAttribute("data-role-filter", role);
      if (roster) playSwap(roster, { fromHeight, direction: swapDirection(Object.keys(labels), value, role) });
    }}
    options={(Object.keys(labels) as Value[]).map(key => ({ value: key, label: labels[key] }))} />;
}
