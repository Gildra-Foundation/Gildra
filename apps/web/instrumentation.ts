import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Roadmap 88: a production server with a value that would break the site
    // refuses to start (the deploy's health gate then rolls back); unset
    // optional features are only named. The build does not check runtime env.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { checkServerEnv } = await import("./lib/env");
      const { errors, warnings } = checkServerEnv();
      for (const warning of warnings) console.warn(`env: ${warning}`);
      for (const error of errors) console.error(`env: ${error}`);
      if (errors.length && process.env.NODE_ENV === "production") {
        throw new Error(`invalid server environment: ${errors.join("; ")}`);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
