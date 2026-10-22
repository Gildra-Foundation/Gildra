import type { components } from "../api/schema";

type Overview = components["schemas"]["AnalyticsOverview"];
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** An unavailable or malformed response must never look like zero activity. */
export async function fetchAnalyticsOverview(
  apiURL: string,
  hours: number,
  request: typeof fetch = fetch,
): Promise<Overview | null> {
  try {
    const response = await request(`${apiURL}/v1/analytics/overview?hours=${hours}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    if (!count(data.hours) || data.hours === 0 || !count(data.events) || !count(data.uniqueUsers)
      || !count(data.activeSubscriptions) || !Array.isArray(data.series)) return null;
    if (!data.series.every((point: unknown) => {
      if (!point || typeof point !== "object") return false;
      const row = point as Record<string, unknown>;
      return typeof row.hour === "string" && Number.isFinite(Date.parse(row.hour)) && count(row.events) && count(row.uniqueUsers);
    })) return null;
    return data as Overview;
  } catch {
    return null;
  }
}
