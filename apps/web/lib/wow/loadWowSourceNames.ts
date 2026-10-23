import { sourceNameMap, type WowNameTable } from "./wowNameTable";

let loading: Promise<Pick<WowNameTable, "source">> | undefined;

/**
 * Source names for text that only arrives in the browser (rotation
 * simulations). A lazy chunk that only Russian pages request: English
 * pages show the original names and never need it.
 */
export function loadWowSourceNames() {
  loading ??= import("./sourceNames").then(({ sourceNames }) => ({ source: sourceNameMap(sourceNames) }));
  loading.catch(() => { loading = undefined; });
  return loading;
}
