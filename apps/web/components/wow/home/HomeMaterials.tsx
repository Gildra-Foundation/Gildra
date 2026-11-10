import Link from "next/link";
import styles from "./wowHome.module.css";
import buttonStyles from "@/components/wow/shared/material/material.module.css";
import type { ComponentProps, CSSProperties } from "react";
import { MaterialPlaque, materialButtonStyle, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { AtlasButton, type AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";

type Kit = Extract<MaterialKit, "den-of-nalorakk">;
const image = (kit: Kit, kind: "panels" | "buttons") => `url("/assets/wow/home/light/${kit}-${kind}.webp")`;
const buttonStyle = (kit: Kit): CSSProperties => ({ ...materialButtonStyle(kit), "--mythic-button-image": image(kit, "buttons") } as CSSProperties);

/** Same native dimensions and measured 9-slice geometry; lighter page-local encodings. */
export function HomePlaque({ kit, style, ...props }: Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { kit: Kit }) {
  return <MaterialPlaque {...props} kit={kit} style={{ ...style, "--mythic-panel-image": image(kit, "panels") } as CSSProperties} />;
}
export function HomeButton({ kit, fit, className, ...props }: ComponentProps<typeof AtlasButton> & { kit: Kit; fit?: "block" | "stack" }) {
  return <span className={buttonStyles.slot} style={buttonStyle(kit)} data-block={fit === "block" || undefined} data-stack={fit === "stack" || undefined}><AtlasButton {...props} className={`${buttonStyles.button} ${className ?? ""}`} /></span>;
}

/** Quiet page-local surfaces; shared painted controls stay untouched. */
export function HomeSurface({ as: Tag = "div", kit: _kit, className, ...props }: Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { kit: Kit }) {
  void _kit;
  return <Tag {...props} className={`${styles.surface} ${className ?? ""}`} />;
}
export function HomeSecondaryLink({ kit: _kit, fit: _fit, variant: _variant, iconAfter, children, ...props }: ComponentProps<typeof AtlasLinkButton> & { kit: Kit; fit?: "block" | "stack" }) {
  void _kit; void _fit; void _variant;
  return <Link {...props} prefetch={false} className={styles.secondaryLink}>{children}{iconAfter}</Link>;
}
