import type { SanitizedConfig } from "payload";

/**
 * Header actions for custom views that render Payload's DefaultTemplate
 * themselves. Payload's own views get `admin.components.actions` reversed
 * (getRouteData), so the same reversal keeps "Find…" and RU / EN in one order
 * on every screen.
 */
export function headerActions(config: SanitizedConfig) {
  return [...(config.admin.components?.actions ?? [])].reverse();
}
