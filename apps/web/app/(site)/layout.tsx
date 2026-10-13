import type { ReactNode } from "react";
import { RootDocument, rootMetadataFor } from "../root-document";

export const metadata = rootMetadataFor("en");

/** Root layout of the English site (everything outside /ru). */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <RootDocument lang="en">{children}</RootDocument>;
}
