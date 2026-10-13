export type CharacterRunKind = "talent" | "rotation" | "gear";

export type CharacterRunScenario = {
  id: string;
  durationSeconds: number;
  targets: number;
};

export type CharacterRunMetrics = {
  dps?: number;
  baselineDps?: number;
  candidateDps?: number;
  deltaDps?: number;
  deltaPercent?: number;
  aoeDps?: number;
  aoeDeltaPercent?: number;
  confidence?: number;
  iterations?: number;
};

export type CharacterRunInput = {
  kind: CharacterRunKind;
  gameBuild: string;
  profileFingerprint: string;
  scenario: CharacterRunScenario;
  engine: string;
  metrics: CharacterRunMetrics;
  label: string;
};

export type CharacterRunRecord = CharacterRunInput & {
  id: string;
  createdAt: string;
  stale: boolean;
  activeShareId?: string;
};

function runID() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `run-${crypto.randomUUID()}`;
  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function recordCharacterRun(characterSlug: string, specializationSlug: string, input: CharacterRunInput) {
  const query = new URLSearchParams({ character: characterSlug, specialization: specializationSlug });
  const response = await fetch(`/api/wow/workspace/history?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientRunId: runID(), ...input }),
  });
  if (!response.ok) return null;
  const record = await response.json() as CharacterRunRecord;
  window.dispatchEvent(new CustomEvent("gildra:character-history-updated", { detail: { characterSlug, specializationSlug } }));
  return record;
}
