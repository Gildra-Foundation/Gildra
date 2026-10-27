import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { materialButtonStyle, materialFrameArtwork, materialFrameStyle, materialPlaqueStyle } from "../../components/wow/shared/material/materialKit.ts";

const raids = ["venomous-abyss", "the-voidspire", "the-dreamrift", "march-on-queldanas", "sporefall"] as const;
const plaqueVars = ["--mythic-panel-image", "--mythic-panel-slice", "--mythic-panel-width", "--mythic-panel-width-mobile", "--material-accent"];
const buttonVars = ["--mythic-button-image", "--mythic-button-slice", "--mythic-button-width", "--mythic-button-top", "--mythic-button-left", "--mythic-button-pad-top", "--mythic-button-pad-bottom", "--mythic-button-inset"];
const frameVars = ["--frame-top", "--frame-right", "--frame-bottom", "--frame-left", "--mythic-frame-clip"];

describe("material kits", () => {
  for (const kit of ["kings-rest", ...raids] as const) {
    it(`${kit}: plaque, button and frame speak the shared variables`, () => {
      const plaque = materialPlaqueStyle(kit) as Record<string, string>;
      const button = materialButtonStyle(kit) as Record<string, string>;
      const frame = materialFrameStyle(kit) as Record<string, string>;
      for (const name of [...plaqueVars, ...buttonVars]) assert.ok(plaque[name] && !plaque[name].includes("undefined"), `${name} on the plaque`);
      for (const name of buttonVars) assert.ok(button[name] && !button[name].includes("undefined"), `${name} on the button`);
      for (const name of frameVars) assert.ok(frame[name] && !frame[name].includes("undefined"), `${name} on the frame`);
      assert.match(materialFrameArtwork(kit), /\.webp$/);
    });
  }
});
