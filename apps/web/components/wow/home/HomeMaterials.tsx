import type { ComponentProps } from "react";
import { MaterialPlaque, type SectionKit } from "@/components/wow/shared/materialAtlas";

type Kit = Extract<SectionKit, "arcana">;

/** Arcana native art with measured nine-slice geometry. */
export function HomePlaque({ kit, style, ...props }: Omit<ComponentProps<typeof MaterialPlaque>, "kit"> & { kit: Kit }) {
  return <MaterialPlaque {...props} kit={kit} style={style} />;
}
