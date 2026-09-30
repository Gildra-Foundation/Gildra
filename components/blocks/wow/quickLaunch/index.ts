import { defineBlock, type EmptyProps } from "@/lib/blocks/types";
import { QuickLaunch } from "./QuickLaunch";

export const quickLaunchBlock = defineBlock<EmptyProps, undefined>({
  type: "wow.quickLaunch",
  Component: QuickLaunch,
  demo: { props: {}, data: undefined },
});
