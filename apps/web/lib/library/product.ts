export const LIBRARY_PRODUCTS = ["wow", "wow_classic", "wow_classic_era", "wow_classic_hardcore"] as const;
export function libraryProduct(value?: string) {
  return !value ? "wow" : LIBRARY_PRODUCTS.includes(value as typeof LIBRARY_PRODUCTS[number]) ? value : undefined;
}
export function libraryProductPath(path: string, product: string) {
  return product === "wow" ? path : `${path}?product=${encodeURIComponent(product)}`;
}
export function emptyProductDataset(head: { entityCount?: number }) { return head.entityCount === 0; }
