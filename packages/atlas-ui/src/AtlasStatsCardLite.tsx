import type { ComponentPropsWithoutRef, ReactNode } from "react";
import clsx from "clsx";
import "./valyro-ui/data-display/StatsCard.css";

/**
 * The Valyro stats card as AtlasStats uses it: a label and a ready value, the
 * same markup and styles. Valyro's card builds two Intl.NumberFormat objects on
 * every render for deltas and numeric values AtlasStats never passes; the first
 * one on a page starts the browser's ICU data (≈125 ms, ≈500 ms on a phone with
 * 4× slower CPU — measured 2026-11-07), which landed in the hubs' hydration.
 */
export function AtlasStatsCardLite({ label, value, className, ...rest }: { label: ReactNode; value: ReactNode } & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  return (
    <div className={clsx("ui-stats-card ui-panel", className)} data-tone="neutral" {...rest}>
      <div className="ui-stats-card__header">
        <span className="ui-stats-card__label">{label}</span>
      </div>
      <div className="ui-stats-card__body">
        <div className="ui-stats-card__main">
          <span className="ui-stats-card__value">{value}</span>
        </div>
      </div>
    </div>
  );
}
