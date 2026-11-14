export const foreverNavigationEvent = "forever-navigation";
export function notifyForeverNavigation() {
  window.dispatchEvent(new Event(foreverNavigationEvent));
}
