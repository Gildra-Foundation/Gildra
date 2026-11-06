import { ogImage } from "@/lib/og/routes";

export const alt = "Gildra — World of Warcraft";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
const card = ogImage("en", "raid");
export default function Image() {
  return card({ params: Promise.resolve({ raid: "march-on-queldanas" }) });
}
