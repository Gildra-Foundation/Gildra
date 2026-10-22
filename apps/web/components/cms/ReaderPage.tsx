import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AtlasFrame } from "@/components/atlas";
import { isReaderEnabled } from "@/lib/cms/config";
import type { Lang } from "@/lib/i18n";
import { ReaderApp } from "./ReaderApp";

/** Opt-in reader pages: 404 unless CMS_READERS_ENABLED=1 and the CMS is configured. */
export const readerMetadata: Metadata = { robots: { index: false, follow: false } };

export function ReaderPage({ lang, mode }: { lang: Lang; mode: "account" | "verify" | "reset" }) {
  if (!isReaderEnabled()) notFound();
  return (
    <AtlasFrame lang={lang} scene="articles" still>
      <ReaderApp lang={lang} mode={mode} signInHref={lang === "ru" ? "/ru/reader" : "/reader"} />
    </AtlasFrame>
  );
}
