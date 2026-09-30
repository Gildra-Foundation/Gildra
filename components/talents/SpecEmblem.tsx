import Image from "next/image";

/** Decorative manuscript art, never a source of talent or simulation data. */
export function SpecEmblem({ specSlug, className, size = 160 }: { specSlug: string; className?: string; size?: number }) {
  return <Image
    className={className}
    data-spec-emblem={specSlug}
    src={`/assets/wow/character-book/spec-emblems/${specSlug}-v1.png`}
    alt=""
    aria-hidden="true"
    width={256}
    height={256}
    sizes={`${size}px`}
    draggable={false}
  />;
}
