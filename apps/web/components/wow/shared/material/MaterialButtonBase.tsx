"use client";

import type { CSSProperties, ComponentProps } from "react";
import clsx from "clsx";
import { AtlasButton, AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import styles from "./material.module.css";

/**
 * The painted button without the kit tables: the caller passes the kit's geometry
 * (`materialButtonStyle(kit)`, usually computed on the server). Client code that
 * only needs one fixed kit uses this, so the manifests of every kit stay out of its
 * bundle. MaterialButton / MaterialLinkButton wrap it by kit name.
 */
export type MaterialSlot = { slotStyle: CSSProperties; fit?: "block" | "stack" };

const slot = (slotStyle: CSSProperties, fit?: MaterialSlot["fit"]) => ({
  className: styles.slot, style: slotStyle,
  "data-block": fit === "block" || undefined, "data-stack": fit === "stack" || undefined,
});

export function MaterialSlotLinkButton({ slotStyle, fit, className, ...props }: MaterialSlot & ComponentProps<typeof AtlasLinkButton>) {
  return <span {...slot(slotStyle, fit)}><AtlasLinkButton {...props} className={clsx(styles.button, className)} /></span>;
}

export function MaterialSlotButton({ slotStyle, fit, className, ...props }: MaterialSlot & ComponentProps<typeof AtlasButton>) {
  return <span {...slot(slotStyle, fit)}><AtlasButton {...props} className={clsx(styles.button, className)} /></span>;
}
