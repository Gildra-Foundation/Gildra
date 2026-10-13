type SentryClient = typeof import("@/lib/observability/sentryClient");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentryModule: Promise<SentryClient> | undefined;
let sentryInitialization: Promise<void> | undefined;

// Sentry loads after the page is idle, so errors thrown during hydration
// (React #418 and friends) would happen before it listens. Keep the first few
// and report them once it is up; its own handlers take over from there.
const earlyErrors: unknown[] = [];
const rememberError = (event: ErrorEvent | PromiseRejectionEvent) => {
  if (earlyErrors.length < 10) earlyErrors.push("reason" in event ? event.reason : event.error ?? event.message);
};

function loadSentry() {
  return sentryModule ??= import("@/lib/observability/sentryClient");
}

function initializeSentry() {
  if (!dsn) return Promise.resolve();
  return sentryInitialization ??= loadSentry().then((Sentry) => {
    Sentry.init({
      dsn,
      enabled: true,
      // Self-hosted GlitchTip has no public route: app/monitoring forwards the envelopes.
      tunnel: "/monitoring",
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0"),
      sendDefaultPii: false,
    });
    window.removeEventListener("error", rememberError);
    window.removeEventListener("unhandledrejection", rememberError);
    for (const error of earlyErrors.splice(0)) Sentry.captureException(error);
  });
}

if (typeof window !== "undefined" && dsn) {
  window.addEventListener("error", rememberError);
  window.addEventListener("unhandledrejection", rememberError);
  const scheduleSentry = () => {
    const requestIdle = window.requestIdleCallback;
    if (requestIdle) {
      requestIdle.call(window, () => void initializeSentry(), { timeout: 2000 });
    } else {
      globalThis.setTimeout(() => void initializeSentry(), 1200);
    }
  };

  if (document.readyState === "complete") scheduleSentry();
  else window.addEventListener("load", scheduleSentry, { once: true });
}
