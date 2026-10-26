import {
  backgrounds, frameFormats, poses, transmogRaces, transmogSlots,
  type FrameFormatId, type Pose, type TransmogGender, type TransmogRace, type TransmogSlot,
} from "./model";

/** Everything a share link restores. Looks are ItemModifiedAppearanceIDs. */
export type TransmogState = {
  race: TransmogRace;
  gender: TransmogGender;
  looks: Partial<Record<TransmogSlot, number>>;
  hidden: TransmogSlot[];
  format: FrameFormatId;
  background: string;
  pose: Pose;
  title: string;
  subtitle: string;
  mark: boolean;
};

export const defaultTransmogState: TransmogState = {
  race: "human", gender: "m", looks: {}, hidden: [], format: "4x5", background: "vault", pose: "Stand", title: "", subtitle: "", mark: true,
};

const MAX_TEXT = 48;
const isSlot = (value: string): value is TransmogSlot => (transmogSlots as string[]).includes(value);

/** Reads a share link; unknown or broken parts fall back to defaults. */
export function parseTransmogState(params: URLSearchParams): TransmogState {
  const state: TransmogState = { ...defaultTransmogState, looks: {}, hidden: [] };
  const race = params.get("race");
  if (race && transmogRaces.some((entry) => entry.id === race)) state.race = race as TransmogRace;
  if (params.get("g") === "f") state.gender = "f";
  for (const part of (params.get("s") ?? "").split("~")) {
    const [slot, raw] = part.split(".");
    const id = Number(raw);
    if (slot && isSlot(slot) && Number.isSafeInteger(id) && id > 0) state.looks[slot] = id;
  }
  state.hidden = (params.get("hide") ?? "").split("~").filter(isSlot);
  const format = params.get("f");
  if (format && frameFormats.some((entry) => entry.id === format)) state.format = format as FrameFormatId;
  const bg = params.get("bg");
  if (bg && backgrounds.some((entry) => entry.id === bg)) state.background = bg;
  const pose = params.get("pose");
  if (pose && (poses as readonly string[]).includes(pose)) state.pose = pose as Pose;
  state.title = (params.get("t") ?? "").slice(0, MAX_TEXT);
  state.subtitle = (params.get("n") ?? "").slice(0, MAX_TEXT);
  if (params.get("mark") === "0") state.mark = false;
  return state;
}

/** Compact query string of a state; defaults are left out. */
export function serializeTransmogState(state: TransmogState): string {
  const params = new URLSearchParams();
  if (state.race !== defaultTransmogState.race) params.set("race", state.race);
  if (state.gender === "f") params.set("g", "f");
  const looks = transmogSlots.filter((slot) => state.looks[slot]).map((slot) => `${slot}.${state.looks[slot]}`);
  if (looks.length) params.set("s", looks.join("~"));
  if (state.hidden.length) params.set("hide", state.hidden.join("~"));
  if (state.format !== defaultTransmogState.format) params.set("f", state.format);
  if (state.background !== defaultTransmogState.background) params.set("bg", state.background);
  if (state.pose !== defaultTransmogState.pose) params.set("pose", state.pose);
  if (state.title) params.set("t", state.title.slice(0, MAX_TEXT));
  if (state.subtitle) params.set("n", state.subtitle.slice(0, MAX_TEXT));
  if (!state.mark) params.set("mark", "0");
  return params.toString();
}

export const transmogTextLimit = MAX_TEXT;
