import { defineBlock } from "@/lib/blocks/types";
import { Example } from "./Example";
import { load } from "./data";
import { demo } from "./demo";
import type { ExampleData, ExampleProps } from "./schema";

/** Register in lib/blocks/registry.ts as `"<game>.example": exampleBlock`. */
export const exampleBlock = defineBlock<ExampleProps, ExampleData>({
  type: "shared.example",
  Component: Example,
  load,
  defaults: { compact: false },
  demo,
});
