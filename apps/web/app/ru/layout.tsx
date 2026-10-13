import type { ReactNode } from "react";
import { RootDocument, rootMetadata } from "../root-document";

export const metadata = rootMetadata;

/** Root layout of the Russian site: the server sends <html lang="ru">. */
export default function RussianRootLayout({ children }: { children: ReactNode }) {
  return <RootDocument lang="ru">{children}</RootDocument>;
}
