import { foreverRecordPath } from "@/lib/forever/database/contract";
export function foreverItemPath(id: number, locale: "en" | "ru") {
  return foreverRecordPath("item", id, locale);
}
