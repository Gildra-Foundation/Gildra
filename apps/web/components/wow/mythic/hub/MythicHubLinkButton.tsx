"use client";

import type { ComponentProps } from "react";
import { AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";

/** Create the Slot's Next Link in the same client boundary as Valyro Button. */
export function MythicHubLinkButton(props: ComponentProps<typeof AtlasLinkButton>) {
  return <AtlasLinkButton {...props} />;
}
