/**
 * Server environment of the web app (roadmap 88): every variable it reads at
 * runtime, its default and what a bad value breaks, in one place.
 * `checkServerEnv()` runs when the server starts (instrumentation.ts): errors
 * stop a production server before it serves broken pages (the deploy then
 * rolls back), warnings name features that are switched off.
 */

type Kind = "url" | "secret" | "text" | "bool" | "enum" | "rate" | "indexnow";

type Variable = {
  key: string;
  kind: Kind;
  default?: string;
  values?: readonly string[];
  /** Warn when unset: the feature it enables is off without it. */
  warnUnset?: string;
};

export const serverEnvSchema: readonly Variable[] = [
  { key: "API_INTERNAL_URL", kind: "url", default: "http://api:8080" },
  { key: "CMS_INTERNAL_URL", kind: "url", warnUnset: "CMS articles and page overrides are off" },
  { key: "SITE_PUBLIC_ORIGIN", kind: "url", default: "https://gildra.net" },
  { key: "ROTATION_WORKER_URL", kind: "url" },
  { key: "CATALOG_ACCESS_MODE", kind: "enum", values: ["public", "private"], warnUnset: "the library treats the catalog as private" },
  { key: "INDEXNOW_KEY", kind: "indexnow", warnUnset: "IndexNow key file (/<key>.txt) answers 404" },
  { key: "CMS_REVALIDATE_SECRET", kind: "secret", warnUnset: "CMS publish does not refresh cached pages" },
  { key: "AUTH_SECRET", kind: "secret", warnUnset: "Battle.net sign-in is reported as not configured" },
  { key: "AUTH_URL", kind: "url", warnUnset: "Warcraft Logs sign-in returns to a development address" },
  { key: "BATTLENET_CLIENT_ID", kind: "text" },
  { key: "BATTLENET_CLIENT_SECRET", kind: "secret" },
  { key: "BATTLENET_REGION", kind: "enum", values: ["eu", "us", "kr", "tw"], default: "eu" },
  { key: "WARCRAFT_LOGS_CLIENT_ID", kind: "text" },
  { key: "WARCRAFT_LOGS_CLIENT_SECRET", kind: "secret" },
  { key: "SENTRY_DSN", kind: "url", warnUnset: "server errors are not reported to GlitchTip" },
  { key: "NEXT_PUBLIC_SENTRY_DSN", kind: "url", warnUnset: "/monitoring refuses browser error reports" },
  { key: "SENTRY_TRACES_SAMPLE_RATE", kind: "rate", default: "0" },
  { key: "WOW_META_API_ENABLED", kind: "bool", default: "false" },
  { key: "PLATFORM_HOME_API_ENABLED", kind: "bool", default: "false" },
];

/** Pairs that only work together. */
const pairs: readonly (readonly [string, string, string])[] = [
  ["BATTLENET_CLIENT_ID", "BATTLENET_CLIENT_SECRET", "Battle.net sign-in"],
  ["WARCRAFT_LOGS_CLIENT_ID", "WARCRAFT_LOGS_CLIENT_SECRET", "Warcraft Logs import"],
];

type Env = Record<string, string | undefined>;

function problemWith(variable: Variable, value: string): string | null {
  switch (variable.kind) {
    case "url":
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) ? null : "must be an http(s) URL";
      } catch {
        return "must be an absolute URL";
      }
    case "enum":
      return variable.values?.includes(value.toLowerCase()) ? null : `must be one of ${variable.values?.join(", ")}`;
    case "bool":
      return value === "true" || value === "false" ? null : "must be true or false";
    case "rate": {
      const rate = Number(value);
      return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? null : "must be a number from 0 to 1";
    }
    case "indexnow":
      return /^[A-Za-z0-9-]{8,128}$/.test(value) ? null : "must be 8-128 letters, digits or dashes";
    default:
      return null;
  }
}

export function checkServerEnv(env: Env = process.env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const variable of serverEnvSchema) {
    const value = env[variable.key]?.trim();
    if (!value) {
      if (variable.warnUnset) warnings.push(`${variable.key} is not set: ${variable.warnUnset}`);
      continue;
    }
    const problem = problemWith(variable, value);
    if (problem) errors.push(`${variable.key} ${problem}`);
  }
  for (const [first, second, feature] of pairs) {
    if (Boolean(env[first]?.trim()) !== Boolean(env[second]?.trim())) {
      warnings.push(`${first} and ${second} must be set together: ${feature} is off`);
    }
  }
  return { errors, warnings };
}

function value(key: string, env: Env = process.env): string {
  const configured = env[key]?.trim();
  return configured || serverEnvSchema.find((variable) => variable.key === key)?.default || "";
}

/** Base URL of the Go API on the internal network, without a trailing slash. */
export function apiInternalUrl(env: Env = process.env): string {
  return value("API_INTERNAL_URL", env).replace(/\/+$/, "");
}
