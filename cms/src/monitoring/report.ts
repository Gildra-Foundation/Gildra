import type { AfterErrorHook } from "payload";

import { captureError } from "./sentry";

/**
 * Payload `afterError` hook: report server faults (5xx) only. Validation
 * failures, 401/403 and lockouts are expected traffic, not incidents.
 */
export const reportRequestError: AfterErrorHook = ({ error, collection, req }) => {
  const status = (error as { status?: number }).status ?? 500;
  if (status < 500) return;
  captureError(error, { collection: collection?.slug, method: req?.method, path: req?.pathname });
};
