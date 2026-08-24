"use client";

type CatalogEventName =
  | "catalog_search_submitted"
  | "catalog_type_selected"
  | "catalog_category_selected"
  | "catalog_tooltip_opened"
  | "catalog_detail_opened"
  | "catalog_zero_results";

function sessionID() {
  const key = "gildra-catalog-session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(key, value);
  return value;
}

export function trackCatalogEvent(
  eventName: CatalogEventName,
  locale: "en" | "ru",
  properties: Record<string, string | number | boolean | undefined> = {},
) {
  try {
    const body = JSON.stringify({
      events: [{
        eventName,
        path: `${location.pathname}${location.search}`,
        locale,
        sessionId: sessionID(),
        properties,
      }],
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Analytics must never block catalog navigation.
  }
}
