"use client";

import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { IntelPopover } from "../mythic/IntelPopover";
import styles from "./wowTooltip.module.css";

type WowTooltipProps = {
  icon: string;
  title: string;
  eyebrow: string;
  description: string;
  meta?: readonly string[];
  label?: string;
  tone?: string;
  kind?: "enemy" | "ability";
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function WowTooltip({
  icon,
  title,
  eyebrow,
  description,
  meta = [],
  label,
  tone = "#a9dd46",
  kind = "ability",
  size = "md",
  className,
}: WowTooltipProps) {
  const triggerClass = [styles.trigger, label ? styles.inlineTrigger : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <IntelPopover
      tone={tone}
      kind={kind}
      content={
        <div className={styles.card}>
          <header>
            <span><Sparkles aria-hidden="true" />{eyebrow}</span>
            <b>WoW</b>
          </header>
          <div className={styles.subject}>
            <span className={styles.largeIcon}><img src={icon} alt="" /></span>
            <span><small>World of Warcraft</small><strong>{title}</strong></span>
          </div>
          <p>{description}</p>
          {meta.length > 0 ? <ul>{meta.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          <footer><span>Gildra · Midnight</span><strong>{label ?? title}</strong></footer>
        </div>
      }
    >
      {(bindings) => (
        <button
          {...bindings}
          type="button"
          className={triggerClass}
          data-size={size}
          aria-label={`${title}. ${description}`}
          style={{ "--wow-tooltip-tone": tone } as CSSProperties}
        >
          <span className={styles.iconFrame}><img src={icon} alt="" /></span>
          {label ? <span className={styles.label}>{label}</span> : null}
        </button>
      )}
    </IntelPopover>
  );
}
