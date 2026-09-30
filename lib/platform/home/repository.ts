import "server-only";
import type { Lang } from "@/lib/i18n";
import { fallbackPlatformHome } from "./fallback";
import { upgradePlatformHomeMedia } from "./media";
import type { PlatformHomeData } from "./types";

const apiURL = () => (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");

function isPlatformHomeData(value: unknown): value is PlatformHomeData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<PlatformHomeData>;
  return Boolean(
    data.profile &&
    typeof data.greeting === "string" &&
    typeof data.title === "string" &&
    Array.isArray(data.games) &&
    Array.isArray(data.personalMeta) &&
    Array.isArray(data.continueItems) &&
    Array.isArray(data.savedBuilds) &&
    Array.isArray(data.patchPulse) &&
    Array.isArray(data.quickActions) &&
    Array.isArray(data.recommendations) &&
    data.labels,
  );
}

/**
 * Server-side home repository. Production reads the published snapshot from
 * PostgreSQL through the Go API. The existing fixed preview remains available
 * when that optional provider is disabled or temporarily unreachable.
 */
export async function getPlatformHomeData(lang: Lang): Promise<PlatformHomeData> {
  // This endpoint is not part of the deployed OpenAPI contract yet. Keep the
  // public page honest and avoid a known 404 on every render until deployment
  // explicitly opts into a compatible API release.
  if (process.env.PLATFORM_HOME_API_ENABLED !== "true") return upgradePlatformHomeMedia(fallbackPlatformHome(lang));
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  try {
    const response = await fetch(`${apiURL()}/v1/platform/home?locale=${locale}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`platform home request failed (${response.status})`);
    const payload: unknown = await response.json();
    if (!isPlatformHomeData(payload)) throw new Error("platform home response has an invalid shape");
    return upgradePlatformHomeMedia(payload);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("platform home database snapshot unavailable; serving explicit unavailable state", error);
    }
    return upgradePlatformHomeMedia(fallbackPlatformHome(lang));
  }
}
