import type { AnyBlockDef } from "../types";
import { sharedRegistry } from "./shared";
import { tierWorkspaceBlock } from "@/components/blocks/wow/tierWorkspace";

export const wowRegistry = {
  ...sharedRegistry,
  "wow.tierWorkspace": tierWorkspaceBlock,
} as const satisfies Record<string, AnyBlockDef>;
