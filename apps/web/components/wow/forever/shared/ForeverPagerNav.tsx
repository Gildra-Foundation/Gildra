"use client";

import type { ComponentProps } from "react";
import { AtlasPagination } from "@gildra/atlas-ui/AtlasPagination";

// The paging links are built inside the same client boundary as the Valyro Button:
// a server-created child can reach its `asChild` slot as a lazy reference.
export function ForeverPagerNav(props: ComponentProps<typeof AtlasPagination>) {
  return <AtlasPagination {...props} />;
}
