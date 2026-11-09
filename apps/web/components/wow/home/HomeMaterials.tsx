import type { ComponentProps, CSSProperties } from "react";
import { MaterialPlaque, materialButtonStyle, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { MaterialSlotButton, MaterialSlotLinkButton } from "@/components/wow/shared/material/MaterialButtonBase";

type Kit = Extract<MaterialKit, "den-of-nalorakk">;
const image = (kit: Kit, kind: "panels" | "buttons") => `url("/assets/wow/home/light/${kit}-${kind}.webp")`;
const buttonStyle = (kit: Kit): CSSProperties => ({ ...materialButtonStyle(kit), "--mythic-button-image": image(kit, "buttons") } as CSSProperties);

/** Same native dimensions and measured 9-slice geometry; lighter page-local encodings. */
export function HomePlaque({ kit, style, ...props }: Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { kit: Kit }) {
  return <MaterialPlaque {...props} kit={kit} style={{ ...style, "--mythic-panel-image": image(kit, "panels") } as CSSProperties} />;
}
export function HomeLinkButton({ kit, ...props }: Omit<ComponentProps<typeof MaterialSlotLinkButton>, "slotStyle"> & { kit: Kit }) {
  return <MaterialSlotLinkButton {...props} slotStyle={buttonStyle(kit)} prefetch={false} />;
}
export function HomeButton({ kit, ...props }: Omit<ComponentProps<typeof MaterialSlotButton>, "slotStyle"> & { kit: Kit }) {
  return <MaterialSlotButton {...props} slotStyle={buttonStyle(kit)} />;
}
