"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { specIcon } from "@/lib/gameAssets";
import type { TierSpecNames } from "@/components/TierSection";
import type { Lang } from "@/lib/i18n-paths";
import type { TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { tierBoardCopy } from "./tierBoardCopy";
import styles from "./tierWorkspace.module.css";

// The Pro board (drag and drop, export) loads only when it is about to scroll into view.
const AtlasTierBoard = dynamic(() => import("@gildra/atlas-ui/AtlasTierBoard").then((module) => module.AtlasTierBoard), { ssr: false });

const ROLES: TierRole[] = ["dps", "healer", "tank"];
const ORDER = ["S+", "S", "A+", "A", "B+", "B", "C", "D"];
const COLORS = { s: "red", a: "orange", b: "amber", c: "green", d: "teal" } as const;

/** The Mythic+ tiers of the table above as a Valyro tier board, with a "your order" mode. */
export function TierBoard({ lang, roles, specNames, sample }: { lang: Lang; roles: Record<TierRole, TierEntry[]>; specNames: TierSpecNames; sample: boolean }) {
  const copy = tierBoardCopy[lang];
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNear(true);
      observer.disconnect();
    }, { rootMargin: "200px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const board = useMemo(() => {
    const entries = ROLES.flatMap((role) => roles[role] ?? []);
    const items = entries.map((entry) => {
      const names = specNames[entry.specSlug] ?? specNames[`${entry.specSlug}-${entry.classSlug}`];
      const name = names ? `${names.specName} ${names.className}` : `${entry.specName} ${entry.className}`;
      return { id: `${entry.role}:${entry.classSlug}:${entry.specSlug}`, name, image: specIcon(entry.specName, entry.classSlug, entry.specSlug) ?? undefined, role: entry.role, tier: entry.tier };
    });
    const rank = (tier: string) => (ORDER.includes(tier) ? ORDER.indexOf(tier) : ORDER.length);
    const tierIds = [...new Set(items.map((item) => item.tier))].sort((a, b) => rank(a) - rank(b));
    const placement = Object.fromEntries(tierIds.map((tier) => [tier, items.filter((item) => item.tier === tier).map((item) => item.id)]));
    const tiers = tierIds.map((id) => ({ id, label: id, color: COLORS[id.charAt(0).toLowerCase() as keyof typeof COLORS] ?? "gray" }));
    const usedRoles = ROLES.filter((role) => items.some((item) => item.role === role)).map((role) => ({ id: role, label: copy.roles[role], short: copy.short[role] }));
    return { items: items.map(({ tier: _tier, ...item }) => item), tiers, placement, roles: usedRoles };
  }, [roles, specNames, copy]);

  if (!board.items.length) return null;
  return (
    <section ref={ref} className={styles.board}>
      {near ? (
        <AtlasTierBoard
          locale={lang}
          items={board.items}
          tiers={board.tiers}
          roles={board.roles}
          defaultValue={board.placement}
          title={copy.title}
          caption={sample ? copy.sample : copy.live}
          headingLevel={2}
          exportName="gildra-mythic-plus-tier-list"
        />
      ) : <div className={styles.boardPlaceholder} aria-hidden="true" />}
    </section>
  );
}
