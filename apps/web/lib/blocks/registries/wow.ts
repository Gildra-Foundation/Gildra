import type { AnyBlockDef } from "../types";
import { sharedRegistry } from "./shared";
import { tierWorkspaceBlock } from "@/components/blocks/wow/tierWorkspace";
import { specBodyBlock } from "@/components/blocks/wow/specBody";

export const wowRegistry = {
  ...sharedRegistry,
  "wow.tierWorkspace": tierWorkspaceBlock,
  "wow.specBody": specBodyBlock,
} as const satisfies Record<string, AnyBlockDef>;
