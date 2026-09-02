import type { ComponentType } from "react";
import { Icons } from "@/components/Icons";
import { registry } from "@/lib/blocks/registry";
import { assertGalleryEnabled, isBlockType } from "@/lib/blocks/gallery";
import { notFound } from "next/navigation";
import type { Lang } from "@/lib/i18n";

export const metadata = { robots: { index: false, follow: false } };

/**
 * One block rendered with its demo props/data — no TopNav or Footer, so the
 * gallery iframes and `design:capture -- --blocks` see the block alone.
 * `?lang=ru` switches the language.
 */
export default async function BlockPreview({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  assertGalleryEnabled();
  const { type } = await params;
  if (!isBlockType(type)) notFound();
  const lang: Lang = (await searchParams).lang === "ru" ? "ru" : "en";
  const def = registry[type];
  const Component = def.Component as ComponentType<any>;
  const el = <Component {...def.demo.props} data={def.demo.data} lang={lang} game="wow" />;

  return (
    <>
      <Icons />
      <div className="app" data-game="wow" data-block={type}>
        <main className="main">
          {def.demo.layout === "full" ? el : <div className="section">{el}</div>}
        </main>
      </div>
    </>
  );
}
