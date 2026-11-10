import { ogImage } from "@/lib/og/routes";

export const alt = "WowArcana — World of Warcraft";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
const card = ogImage("ru", "raid");
export default function Image() {
  return card({ params: Promise.resolve({ raid: "the-dreamrift" }) });
}
