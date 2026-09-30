import type { BattleNetSimulationSnapshot } from "../../wow/battleNetCharacterDetails";

type PublicRotationInput = {
  talentLoadout?: string;
  [key: string]: unknown;
};

/** Attach the authenticated Blizzard payload that SimulationCraft consumes. */
export function attachBattleNetArmory<T extends PublicRotationInput>(input: T, snapshot: BattleNetSimulationSnapshot) {
  return {
    ...input,
    talentLoadout: input.talentLoadout || snapshot.activeTalentLoadout,
    armory: {
      profile: snapshot.profile,
      specializations: snapshot.specializations,
      equipment: snapshot.equipment,
    },
  };
}
