import type { FarmActivity, FarmTarget } from "./types";

/** An exact reward is a farming recommendation only after a positive DPS
 * comparison whose gain exceeds the combined 95% uncertainty. */
export type ConfirmedFarmTarget = FarmTarget & {
  verification: "simulated";
  deltaDps: number;
  deltaPercent: number;
  marginPercent: number;
};
export function isConfirmedFarmUpgrade(target: FarmTarget): target is ConfirmedFarmTarget {
  return target.verification === "simulated" &&
    Number.isFinite(target.deltaDps) && Number(target.deltaDps) > 0 &&
    Number.isFinite(target.deltaPercent) && Number(target.deltaPercent) > 0 &&
    Number.isFinite(target.marginPercent) && Number(target.marginPercent) >= 0 &&
    Number(target.deltaPercent) > Number(target.marginPercent);
}

export function confirmedFarmActivities(activities: FarmActivity[]): FarmActivity[] {
  return activities.filter(activity => activity.access === "level_condition_met")
    .map(activity => ({ ...activity, targets: activity.targets.filter(isConfirmedFarmUpgrade) }))
    .filter(activity => activity.targets.length > 0);
}
