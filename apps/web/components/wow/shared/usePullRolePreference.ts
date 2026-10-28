"use client";

import { usePullRole } from "../mythic/usePullRole";
import { playerSpecs } from "../mythic/playerTools";
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
  const spec = playerSpecs.find(item => item.id === profile.specId && item.classId === profile.classId);
  return { role, profile, spec, setProfile, selectRole, setRole };
}
