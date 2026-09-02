import Link from "next/link";
import { registry } from "@/lib/blocks/registry";
import { assertGalleryEnabled, galleryBlockTypes, GALLERY_WIDTHS } from "@/lib/blocks/gallery";

export const metadata = {
  title: "Block gallery — Gildra dev",
  robots: { index: false, follow: false },
};

/**
 * Dev-only gallery: every registered block at three widths, EN or RU.
 * Blocks are embedded as iframes so their media queries respond to the
 * frame width, not the gallery page width.
 */
export default async function BlockGallery({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  assertGalleryEnabled();
  const lang = (await searchParams).lang === "ru" ? "ru" : "en";
  const types = galleryBlockTypes();

  return (
    <main className="min-h-screen bg-[var(--bg)] px-6 py-8 text-[var(--ink)]">
      <header className="mb-6 flex flex-wrap items-baseline gap-4">
        <h1 className="font-[var(--display)] text-xl font-semibold tracking-wide text-[var(--gold-2)]">
          Block gallery
        </h1>
        <span className="text-xs text-[var(--ink-3)]">
          {types.length} blocks · registry: lib/blocks/registry.ts
        </span>
        <nav className="ml-auto flex gap-3 text-xs">
          <Link href="/dev/blocks" className={lang === "en" ? "text-[var(--gold-2)]" : ""}>
            EN
          </Link>
          <Link href="/dev/blocks?lang=ru" className={lang === "ru" ? "text-[var(--gold-2)]" : ""}>
            RU
          </Link>
        </nav>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2 text-xs">
        {types.map((type) => (
          <a key={type} href={`#${type}`} className="border border-[var(--line)] px-2 py-1">
            {type}
          </a>
        ))}
      </nav>

      {types.map((type) => {
        const def = registry[type];
        const src = `/dev/blocks/${type}?lang=${lang}`;
        return (
          <section key={type} id={type} className="mb-12">
            <h2 className="mb-1 font-[var(--display)] text-sm tracking-widest text-[var(--ink-2)]">
              {type}
              <a href={src} className="ml-3 text-[11px] text-[var(--blue-2)]">
                open ↗
              </a>
            </h2>
            {def.demo.note && <p className="mb-2 text-xs text-[var(--ink-3)]">{def.demo.note}</p>}
            <div className="flex flex-wrap items-start gap-4 overflow-x-auto">
              {GALLERY_WIDTHS.map((w) => (
                <figure key={w} className="min-w-0">
                  <figcaption className="mb-1 text-[10px] uppercase tracking-widest text-[var(--ink-3)]">
                    {w}px
                  </figcaption>
                  <iframe
                    title={`${type} @ ${w}`}
                    src={src}
                    loading="lazy"
                    width={w}
                    height={def.demo.layout === "full" ? 520 : 640}
                    style={{ maxWidth: "100%", border: "1px solid var(--line)", background: "var(--bg)" }}
                  />
                </figure>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
