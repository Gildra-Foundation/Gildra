export const PAGE_SIZE = 25;

export function pageNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

export function searchText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function optionalID(value: unknown): string | null {
  return typeof value === "string" && /^\d{1,15}$/.test(value) ? value : null;
}

export type PageResult<T> = { rows: T[]; page: number; totalDocs: number; totalPages: number };
export type SiteChoice = { id: string; name: string };
