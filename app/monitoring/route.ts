import { envelopeTarget, maxEnvelopeBytes, parseDsn, upstreamEnvelopeUrl } from "@/lib/observability/sentryTunnel";

// Browser error envelopes → GlitchTip on the internal network (see lib/observability/sentryTunnel.ts).
export async function POST(request: Request) {
  const allowed = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!allowed) return new Response(null, { status: 404 });
  if (Number(request.headers.get("content-length") ?? 0) > maxEnvelopeBytes) return new Response(null, { status: 413 });
  const envelope = await request.text();
  if (envelope.length > maxEnvelopeBytes) return new Response(null, { status: 413 });
  const target = envelopeTarget(envelope, allowed);
  if (!target) return new Response(null, { status: 400 });
  try {
    const upstream = await fetch(upstreamEnvelopeUrl(process.env.SENTRY_TUNNEL_UPSTREAM ?? "http://glitchtip:8000", target), {
      method: "POST",
      body: envelope,
      headers: { "content-type": "application/x-sentry-envelope" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return new Response(null, { status: upstream.ok ? 200 : 502 });
  } catch {
    return new Response(null, { status: 502 });
  }
}
