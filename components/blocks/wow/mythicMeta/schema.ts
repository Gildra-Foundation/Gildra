import type { EmptyProps } from "@/lib/blocks/types";
import type { LiveStats } from "@/data/site";
import type { MythicMetaData } from "@/lib/data/source";

export type MythicMetaProps = EmptyProps;

export type MythicMetaBlockData = MythicMetaData & { liveStats: LiveStats };
