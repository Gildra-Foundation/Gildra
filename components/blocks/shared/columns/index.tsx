import { defineBlock, type BlockComponentProps } from "@/lib/blocks/types";
import type { AnchorId } from "@/lib/anchors";
import styles from "./columns.module.css";

export type ColumnsProps = {
  /** "meta" = homepage 1.75fr/1fr grid (`.cards-row`); "even" = equal columns. */
  layout: "meta" | "even";
  /** DOM id of the wrapper; with `anchor` it also appears in SectionNav. */
  id?: AnchorId | (string & {});
  /** EN nav label. */
  anchor?: string;
};

const LAYOUT_CLASS: Record<ColumnsProps["layout"], string> = {
  meta: "cards-row",
  even: styles.even,
};

/** Multi-column wrapper. Owns its `<section>` root so anchors and CSS stay
 *  exactly where the legacy markup had them. */
function Columns({ layout, id, children }: BlockComponentProps<ColumnsProps, undefined>) {
  return (
    <section id={id} className={LAYOUT_CLASS[layout]}>
      {children}
    </section>
  );
}

export const columnsBlock = defineBlock<ColumnsProps, undefined, true>({
  type: "columns",
  Component: Columns,
  container: true,
  anchorOf: (props) => (props.id && props.anchor ? { id: props.id, label: props.anchor } : undefined),
  demo: { props: { layout: "meta" }, data: undefined, note: "Layout wrapper — renders its children." },
});
