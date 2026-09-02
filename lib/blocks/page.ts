/**
 * Page config types. Type-only imports from the (server-only) registry, so
 * this module is safe to import from client components.
 */
import type { Lang } from "@/lib/i18n";
import type { GameSlug } from "@/lib/games/registry";
import type { BlockDef } from "./types";
import type { registry } from "./registry";

type Registry = typeof registry;

export type BlockType = keyof Registry;

export type PropsOf<K extends BlockType> =
  Registry[K] extends BlockDef<infer P, infer _D, infer _C> ? P : never;

type IsContainer<K extends BlockType> =
  Registry[K] extends BlockDef<infer _P, infer _D, infer C> ? C : false;

export type Visibility = { langs?: Lang[]; games?: GameSlug[] };

/** Discriminated by `type`: `props` and `children` narrow per block. */
export type BlockInstance = {
  [K in BlockType]: {
    type: K;
    /** Stable key when the same block type appears twice in one list. */
    id?: string;
    props?: PropsOf<K>;
    visibility?: Visibility;
    children?: IsContainer<K> extends true ? BlockInstance[] : never;
  };
}[BlockType];

export type PageConfig = {
  /** "<game>/<page>", e.g. "wow/home". */
  id: string;
  game: GameSlug;
  /** Canonical EN, game-relative path. RU mirror = `p("ru", …)`. */
  path: string;
  /** "default" = TopNav + .app/.main + Footer; "bare" = TopNav only (404-style). */
  layout: "default" | "bare";
  shell?: { reveal?: boolean; footer?: boolean };
  blocks: BlockInstance[];
};

export const definePageConfig = (config: PageConfig) => config;
