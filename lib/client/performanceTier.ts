export type PerformanceTier = "full" | "balanced" | "minimal";

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

type PerformanceNavigator = Navigator & {
  deviceMemory?: number;
  connection?: NetworkInformation;
};

/**
 * A deliberately conservative client-side rendering budget. It only affects
 * decorative effects; controls and talent feedback remain fully functional.
 */
export function getPerformanceTier(): PerformanceTier {
  if (typeof window === "undefined") return "balanced";
  const navigator = window.navigator as PerformanceNavigator;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memory = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  const network = navigator.connection;

  if (
    reducedMotion
    || network?.saveData
    || (typeof memory === "number" && memory <= 2)
    || cores <= 2
  ) return "minimal";

  if (
    (typeof memory === "number" && memory <= 4)
    || cores <= 4
    || window.innerWidth <= 640
    || ["slow-2g", "2g"].includes(network?.effectiveType ?? "")
  ) return "balanced";

  return "full";
}

export function elementCanAnimate(element: Element) {
  if (typeof document === "undefined" || document.hidden) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 1
    && rect.height > 1
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}
