import type { EmptyProps } from "@/lib/blocks/types";

/** Instance props — must stay JSON-serialisable (a CMS may emit them). */
export type ExampleProps = EmptyProps & {
  /** Example optional prop. */
  compact?: boolean;
};

/** Data resolved by data.ts and passed to the component. */
export type ExampleData = {
  title: string;
  items: readonly string[];
};
