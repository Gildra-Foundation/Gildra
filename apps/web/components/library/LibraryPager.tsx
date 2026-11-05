"use client";

import type { ComponentProps } from "react";
import { AtlasPagination } from "@gildra/atlas-ui/AtlasPagination";
import { materialButtonStyle } from "@/components/wow/shared/materialAtlas";
import { libraryKit } from "@/components/library/libraryKit";
import paint from "./libraryMaterial.module.css";

/**
 * Paging of a library list on the kit's painted buttons. Rendered on the client side of the
 * boundary so the paging links reach the Valyro `asChild` slot as plain elements (a server-passed
 * child can arrive as a lazy reference, and the slot would then wrap the link in a <button>).
 */
export function LibraryPager(props: ComponentProps<typeof AtlasPagination>) {
  return (
    <div className={`${paint.painted} ${paint.pager}`} style={materialButtonStyle(libraryKit)}>
      <AtlasPagination {...props} />
    </div>
  );
}
