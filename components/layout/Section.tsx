import type { ReactNode } from "react";

export type SectionMeta = { id?: string; className?: string; as?: "section" | "div" };

/**
 * Optional section wrapper. Renders `<section id className>` only when
 * `meta` carries an id or className; otherwise returns children unchanged so
 * the DOM stays exactly what the block itself renders.
 */
export function Section({ meta, children }: { meta?: SectionMeta; children: ReactNode }) {
  if (!meta || (!meta.id && !meta.className)) return <>{children}</>;
  const Tag = meta.as ?? "section";
  return (
    <Tag id={meta.id} className={meta.className}>
      {children}
    </Tag>
  );
}
