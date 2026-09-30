type SentryClient = typeof import("@sentry/nextjs");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentryModule: Promise<SentryClient> | undefined;
let sentryInitialization: Promise<void> | undefined;

function loadSentry() {
  return sentryModule ??= import("@sentry/nextjs");
}

function initializeSentry() {
  if (!dsn) return Promise.resolve();
  return sentryInitialization ??= loadSentry().then((Sentry) => {
    Sentry.init({
      dsn,
      enabled: true,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      sendDefaultPii: false,
    });
  });
}

if (typeof window !== "undefined" && dsn) {
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

export function onRouterTransitionStart(href: string, navigationType: string) {
  if (!dsn) return;
  void initializeSentry().then(() => loadSentry()).then((Sentry) => {
    Sentry.captureRouterTransitionStart(href, navigationType);
  });
}
