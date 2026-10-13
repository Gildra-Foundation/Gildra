/**
 * Block registry — the only place that maps a `type` string to a block.
 * Server-only: block loaders touch the data layer. Client code may import
 * `typeof registry` types via lib/blocks/page.ts.
 *
 * Adding a block: create its folder (copy components/blocks/_template),
 * import its definition here, and it becomes available in every page config.
 * Keys: shared blocks are plain ("columns"), game blocks are "<game>.<name>".
 */
import "server-only";
import { sharedRegistry } from "./registries/shared";
import { wowRegistry } from "./registries/wow";
import { leagueRegistry } from "./registries/league";

// Full registry remains available to the block gallery and type-level schema.
export const registry = { ...sharedRegistry, ...wowRegistry, ...leagueRegistry };

export type Registry = typeof registry;
