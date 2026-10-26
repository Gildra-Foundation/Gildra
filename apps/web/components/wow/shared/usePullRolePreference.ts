"use client";

import { usePullRole } from "../mythic/usePullRole";
import { usePlayerProfile } from "../mythic/usePlayerProfile";

export { pullRoleCopy } from "../mythic/pullRoleCopy";

/** A manual role overrides the saved spec; profile pickers keep their own spec. */
export function usePullRolePreference() {
  const [role, setRole] = usePullRole();
  const [profile, setProfile] = usePlayerProfile();
  const selectRole = (value: string) => {
    setProfile({ ...profile, specId: null });
    setRole(value);
  };
  return { role, profile, setProfile, selectRole, setRole };
}
