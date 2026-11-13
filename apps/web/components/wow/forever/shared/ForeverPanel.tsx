import type { ComponentProps, ReactNode } from "react";
import Image from "next/image";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { FOREVER_KIT } from "../foreverKit";
import styles from "./forever.module.css";

type PlaqueProps = Omit<ComponentProps<typeof MaterialPlaque>, "kit" | "title">;

/**
 * The one panel of the section: the Forever plaque around live HTML. Every block of a Forever
 * page that needs a surface sits on it; panels are never nested (inside — glass rows and lists).
 */
export function ForeverPanel({ title, headingLevel = 3, children, ...plaque }: PlaqueProps & { title?: ReactNode; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <MaterialPlaque kit={FOREVER_KIT} {...plaque}>
    {title ? <Heading className={materialStyles.title}>{title}</Heading> : null}
    {children}
  </MaterialPlaque>;
}

/** Heading and quiet text set on the panel, and the section's quiet text link. */
export const foreverPanelStyles = { ...materialStyles, link: styles.link } as const;

/** The blocks of one section (a panel, a grid, rows) one under another with the section's step. */
export function ForeverStack({ children, gap = "normal", className }: { children: ReactNode; gap?: "normal" | "wide"; className?: string }) {
  return <div className={className ? `${styles.stack} ${className}` : styles.stack} data-gap={gap === "wide" ? "wide" : undefined}>{children}</div>;
}

/** A game icon (class, spell, item, profession) in the section's painted frame. Decor next to its name: alt stays empty. */
export function ForeverIcon({ src, size = 52, alt = "" }: { src: string; size?: number; alt?: string }) {
  return <span className={materialStyles.iconFrame} style={materialIconFrameStyle(FOREVER_KIT, size)}>
    <Image src={src} alt={alt} width={size} height={size} unoptimized />
  </span>;
}

/** The frame's variables for a component that draws the icon itself (LibraryRecordCard `iconFrameStyle`). */
export const foreverIconFrame = (size = 52) => materialIconFrameStyle(FOREVER_KIT, size);
