// Not a client module: on a server page the kit lookup (every kit's manifest
// tables) runs on the server and only the button's geometry reaches the browser
// (MaterialButtonBase is the client part). Client code may still import it.
import type { ComponentProps } from "react";
import type { AtlasButton, AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import { materialButtonStyle, type AnyMaterialKit } from "./materialKit";
import { MaterialSlotButton, MaterialSlotLinkButton } from "./MaterialButtonBase";

/** How the button sits in its row: `block` fills the row, `stack` fills it only on phones (≤ 600 px). */
type Fit = { kit: AnyMaterialKit; fit?: "block" | "stack" };

/** A painted nine-slice link button of one kit (design.md §4.1); the label stays live HTML. */
export function MaterialLinkButton({ kit, ...props }: Fit & ComponentProps<typeof AtlasLinkButton>) {
  return <MaterialSlotLinkButton slotStyle={materialButtonStyle(kit)} {...props} />;
}

/** The same painted button as a native <button> (forms, retry, paging). */
export function MaterialButton({ kit, ...props }: Fit & ComponentProps<typeof AtlasButton>) {
  return <MaterialSlotButton slotStyle={materialButtonStyle(kit)} {...props} />;
}
