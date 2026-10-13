// The browser half of error reporting, loaded lazily by instrumentation-client.ts.
// @sentry/browser with named imports only: `import("@sentry/nextjs")` pulled the
// whole namespace (Session Replay, rrweb, feedback, tracing), a 577 KB chunk on
// every page (2026-10-13). The Next.js-specific init only adds tracing, which
// the site does not use (traces 0).
export { captureException, init } from "@sentry/browser";
