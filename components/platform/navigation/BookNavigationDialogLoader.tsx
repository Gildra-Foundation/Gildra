export type BookNavigationDialogComponent = typeof import("./BookNavigationDialog").BookNavigationDialog;

export function loadBookNavigationDialog() {
  return import("./BookNavigationDialog");
}
