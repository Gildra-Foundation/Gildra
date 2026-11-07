/**
 * Does this device get the cross-fade between pages (a View Transition)?
 * Picturing the outgoing page and blending two layers for 200 ms is free on a
 * GPU but costs frames on a weak phone, and nothing is worth that on a metered
 * connection. Four cores or less, 4 GB of memory or less, Save-Data, or a
 * browser that composites in software (render tier "cpu": SwiftShader, llvmpipe,
 * blocklisted drivers) get the light hand-over instead: the new page is in at
 * once and its title block rises (RouteTransitionRuntime, playHeroEntrance).
 * Less motion turns both off; that is checked apart (lessMotion).
 */
export type RouteTurnDevice = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export function routeTurnDeviceAllowed(device: RouteTurnDevice, renderTier?: "gpu" | "cpu") {
  if (renderTier === "cpu") return false;
  if (device.connection?.saveData) return false;
  if (typeof device.hardwareConcurrency === "number" && device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4) return false;
  if (typeof device.deviceMemory === "number" && device.deviceMemory <= 4) return false;
  return true;
}
