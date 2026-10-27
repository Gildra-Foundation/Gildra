"use client";

import type { ComponentProps } from "react";
import clsx from "clsx";
import { AtlasButton, AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import { materialButtonStyle, type AnyMaterialKit } from "./materialKit";
import styles from "./material.module.css";

/** How the button sits in its row: `block` fills the row, `stack` fills it only on phones (≤ 600 px). */
type Fit = { kit: AnyMaterialKit; fit?: "block" | "stack" };
const slot = (kit: AnyMaterialKit, fit?: Fit["fit"]) => ({
  className: styles.slot, style: materialButtonStyle(kit),
  "data-block": fit === "block" || undefined, "data-stack": fit === "stack" || undefined,
});

/** A painted nine-slice link button of one kit (design.md §4.1); the label stays live HTML. */
export function MaterialLinkButton({ kit, fit, className, ...props }: Fit & ComponentProps<typeof AtlasLinkButton>) {
  return <span {...slot(kit, fit)}><AtlasLinkButton {...props} className={clsx(styles.button, className)} /></span>;
}

/** The same painted button as a native <button> (forms, retry, paging). */
export function MaterialButton({ kit, fit, className, ...props }: Fit & ComponentProps<typeof AtlasButton>) {
  return <span {...slot(kit, fit)}><AtlasButton {...props} className={clsx(styles.button, className)} /></span>;
}
