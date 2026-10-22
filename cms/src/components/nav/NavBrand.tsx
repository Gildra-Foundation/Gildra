import Link from "next/link";
import React from "react";

import { Wordmark } from "../Brand";

/** Top of the sidebar, above the site selector: the GILDRA wordmark, linking to the desk. */
export function NavBrand({ i18n }: { i18n?: { language?: string } }) {
  return (
    <Link className="gd-nav-brand" href="/admin" prefetch={false}>
      <Wordmark i18n={i18n} />
    </Link>
  );
}
