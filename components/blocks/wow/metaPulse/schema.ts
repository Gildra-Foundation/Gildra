import type { EmptyProps } from "@/lib/blocks/types";
import type { TableRow } from "@/data/site";

export type MetaPulseProps = EmptyProps;

export type MetaPulseData = {
  /** Top movers: two risers and one faller from the tier table. */
  top: readonly TableRow[];
  /** Number of specs whose rank changed. */
  changes: number;
};
