import Link from "next/link";
import buttonStyles from "@/components/wow/shared/material/material.module.css";
import type { ComponentProps, CSSProperties } from "react";
import { MaterialPlaque, materialButtonStyle, type SectionKit } from "@/components/wow/shared/materialAtlas";
import { AtlasButton, AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";

type Kit = Extract<SectionKit, "arcana">;

const buttonStyle = (kit: Kit): CSSProperties => ({ ...materialButtonStyle(kit), "--mythic-button-inset": "32px", "--mythic-button-width": "12px 28px 12px 28px", "--mythic-button-pad-top": "12px", "--mythic-button-pad-bottom": "12px" } as CSSProperties);

/** Arcana native art with measured nine-slice geometry. */
export function HomePlaque({ kit, style, ...props }: Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { kit: Kit }) {
  return <MaterialPlaque {...props} kit={kit} style={style} />;
}
export function HomeButton({ kit, fit, className, ...props }: ComponentProps<typeof AtlasButton> & { kit: Kit; fit?: "block" | "stack" }) {
  return <span className={buttonStyles.slot} style={buttonStyle(kit)} data-block={fit === "block" || undefined} data-stack={fit === "stack" || undefined}><AtlasButton {...props} className={`${buttonStyles.button} ${className ?? ""}`} /></span>;
}

export function HomeSecondaryLink({ kit: _kit, fit: _fit, variant: _variant, iconAfter, children, ...props }: ComponentProps<typeof AtlasLinkButton> & { kit: Kit; fit?: "block" | "stack" }) {
  return <span data-secondary-slot="" data-block={_fit === "block" || undefined}><Link {...props} prefetch={false} data-secondary="" className={props.className}><span className="ui-button__label">{children}</span>{iconAfter}</Link></span>;
}
