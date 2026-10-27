import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { materialPlaqueStyle, type MaterialKit } from "./materialKit";
import styles from "./material.module.css";

type Props = Omit<HTMLAttributes<HTMLElement>, "style"> & {
  kit: MaterialKit;
  children: ReactNode;
  /** Element of the plaque: a section with its own heading, a div inside one, a form… */
  as?: ElementType;
  style?: CSSProperties;
};

/** A painted nine-slice plaque of one kit around live HTML (design.md §4.2). Never nest plaques. */
export function MaterialPlaque({ kit, children, as: Element = "div", className, style, ...rest }: Props) {
  return <Element {...rest} className={clsx(styles.plaque, className)} style={{ ...materialPlaqueStyle(kit), ...style }}>{children}</Element>;
}

/** Heading and quiet text set on a plaque. */
export const materialStyles = { title: styles.plaqueTitle, text: styles.plaqueText, iconFrame: styles.iconFrame } as const;
