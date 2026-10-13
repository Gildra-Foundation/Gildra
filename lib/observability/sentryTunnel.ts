/**
 * Error-report tunnel (roadmap 96). Browsers post Sentry envelopes to
 * /monitoring on the site; the web server forwards them to the self-hosted
 * GlitchTip, which has no public route (http://glitchtip:8000 on the docker
 * network). Only envelopes built for the site's own DSN are forwarded, so the
 * route is not an open relay. @sentry/nextjs's own `tunnelRoute` only works
 * with sentry.io DSNs.
 */
export type TunnelTarget = { projectId: string; publicKey: string };

export const maxEnvelopeBytes = 512 * 1024;

export function parseDsn(dsn: string | undefined): TunnelTarget | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!url.username || !/^\d+$/.test(projectId)) return null;
    return { projectId, publicKey: decodeURIComponent(url.username) };
  } catch {
    return null;
  }
}

/** The envelope's first line is a JSON header that names the DSN it was built for. */
export function envelopeTarget(envelope: string, allowed: TunnelTarget): TunnelTarget | null {
  const newline = envelope.indexOf("\n");
  let header: unknown;
  try {
    header = JSON.parse(newline === -1 ? envelope : envelope.slice(0, newline));
  } catch {
    return null;
  }
  const dsn = header && typeof header === "object" ? (header as { dsn?: unknown }).dsn : undefined;
  const target = typeof dsn === "string" ? parseDsn(dsn) : null;
  if (!target || target.projectId !== allowed.projectId || target.publicKey !== allowed.publicKey) return null;
  return target;
}

/** GlitchTip authenticates envelopes by the key in the query, not the envelope header. */
export function upstreamEnvelopeUrl(upstream: string, target: TunnelTarget): string {
  const params = new URLSearchParams({ sentry_key: target.publicKey, sentry_version: "7" });
  return `${upstream.replace(/\/+$/, "")}/api/${target.projectId}/envelope/?${params}`;
}
