import type { Instrumentation } from "next";

// Loaded once per server process. Without SENTRY_DSN nothing is imported.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const { initMonitoring } = await import("./monitoring/sentry");
    await initMonitoring();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (!process.env.SENTRY_DSN) return;
  const { captureError } = await import("./monitoring/sentry");
  captureError(error, { path: request.path, method: request.method });
};
