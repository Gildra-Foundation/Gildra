import type { ReactNode } from "react";
import { RootDocument, rootMetadata } from "../root-document";

export const metadata = rootMetadata;

/** Root layout of the English site (everything outside /ru). */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <RootDocument lang="en">{children}</RootDocument>;
}
