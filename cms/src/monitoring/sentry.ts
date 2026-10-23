/**
 * Error reporting to the self-hosted GlitchTip (Sentry-compatible), shared by the
 * CMS server and the jobs worker. Off unless SENTRY_DSN is set; with no DSN the
 * SDK is never loaded, so there is no cost and nothing leaves the host.
 */
type SentryNode = typeof import("@sentry/node");

let sdk: Promise<SentryNode | null> | undefined;

export const monitoringEnabled = (): boolean => Boolean(process.env.SENTRY_DSN);

function load(): Promise<SentryNode | null> {
  if (!monitoringEnabled()) return Promise.resolve(null);
  sdk ??= import("@sentry/node")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
        release: process.env.SENTRY_RELEASE || undefined,
        serverName: process.env.CMS_ROLE || "cms",
        // Tracing is opt-in: GlitchTip stores every transaction.
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
        sendDefaultPii: false,
        // Credentials and session tokens never belong in an event.
        beforeSend(event) {
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
            delete event.request.data;
          }
          return event;
        },
      });
      return Sentry;
    })
    .catch(() => null);
  return sdk;
}

export const initMonitoring = (): Promise<unknown> => load();

/** Fire-and-forget: reporting must never break or slow the request that failed. */
export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!monitoringEnabled()) return;
  void load().then((Sentry) => {
    if (!Sentry) return;
    Sentry.withScope((scope) => {
      scope.setContext("cms", context);
      Sentry.captureException(error);
    });
  });
}

export function captureMessage(message: string, context: Record<string, unknown> = {}): void {
  if (!monitoringEnabled()) return;
  void load().then((Sentry) => {
    if (!Sentry) return;
    Sentry.withScope((scope) => {
      scope.setContext("cms", context);
      scope.setLevel("error");
      Sentry.captureMessage(message);
    });
  });
}

/** Flush before a short-lived process exits. */
export async function flushMonitoring(timeoutMs = 2000): Promise<void> {
  const Sentry = await load();
  await Sentry?.flush(timeoutMs);
}
