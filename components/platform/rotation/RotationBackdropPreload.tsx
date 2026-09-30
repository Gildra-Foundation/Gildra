"use client";

import { preload } from "react-dom";

const DESKTOP_ROTATION_BACKDROP = "/assets/characters/furybar-horde-hero-v1-optimized.webp";
const MOBILE_ROTATION_BACKDROP = "/assets/characters/furybar-horde-hero-v1-mobile-optimized.webp";

export function RotationBackdropPreload() {
  preload(MOBILE_ROTATION_BACKDROP, {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    media: "(max-width: 430px)",
  });
  preload(DESKTOP_ROTATION_BACKDROP, {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    media: "(min-width: 431px)",
  });

  return null;
}
