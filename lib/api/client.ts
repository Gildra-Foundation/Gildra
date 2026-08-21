import type { components } from "./schema";

export type AnalyticsOverview = components["schemas"]["AnalyticsOverview"];

const emptyOverview = (hours: number): AnalyticsOverview => ({
  hours,
  events: 0,
  uniqueUsers: 0,
  activeSubscriptions: 0,
  series: [],
});

export async function getAnalyticsOverview(hours = 24): Promise<AnalyticsOverview> {
  const apiURL = process.env.API_INTERNAL_URL ?? "http://api:8080";
  try {
    const response = await fetch(`${apiURL}/v1/analytics/overview?hours=${hours}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return emptyOverview(hours);
    return (await response.json()) as AnalyticsOverview;
  } catch {
    return emptyOverview(hours);
  }
}
