import { lookup } from "node:dns/promises";

const rawBaseUrl = process.env.API_READINESS_URL ?? process.env.API_INTERNAL_URL ?? "https://api.gildra.net";
const timeoutMs = Number(process.env.API_READINESS_TIMEOUT_MS ?? 15_000);

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  throw new Error(`API URL is invalid: ${rawBaseUrl}`);
}

if (!['http:', 'https:'].includes(baseUrl.protocol) || !baseUrl.hostname) {
  throw new Error(`API URL must use HTTP(S) and include a hostname: ${rawBaseUrl}`);
}

const addresses = await lookup(baseUrl.hostname, { all: true });
if (!addresses.length) throw new Error(`API hostname did not resolve: ${baseUrl.hostname}`);

const checks = [
  { path: "/livez", contentType: "application/json" },
  { path: "/readyz", contentType: "application/json" },
  { path: "/v1/library/datasets?product=wow&locale=en_US", contentType: "application/json" },
];

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "GildraBuildReadiness/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`API readiness check failed: ${url} returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(check.contentType)) {
    throw new Error(`API readiness check failed: ${url} returned ${contentType || "no content type"}`);
  }
  await response.body?.cancel();
}

console.log(JSON.stringify({
  status: "ready",
  baseUrl: baseUrl.origin,
  hostname: baseUrl.hostname,
  resolvedAddresses: addresses.map(({ address, family }) => ({ address, family })),
  checkedPaths: checks.map(({ path }) => path),
}, null, 2));
