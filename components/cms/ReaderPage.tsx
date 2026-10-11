import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/layout/PageShell";
import { isReaderEnabled } from "@/lib/cms/config";
import type { Lang } from "@/lib/i18n";
import { ReaderApp } from "./ReaderApp";

/** Opt-in reader pages: 404 unless CMS_READERS_ENABLED=1 and the CMS is configured. */
export const readerMetadata: Metadata = { robots: { index: false, follow: false } };

export function ReaderPage({ lang, mode }: { lang: Lang; mode: "account" | "verify" | "reset" }) {
  if (!isReaderEnabled()) notFound();
  return (
    <PageShell lang={lang} game="wow">
      <ReaderApp lang={lang} mode={mode} signInHref={lang === "ru" ? "/ru/reader" : "/reader"} />
    </PageShell>
  );
}
