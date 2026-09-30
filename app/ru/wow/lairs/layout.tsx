import { preload } from "react-dom";
import "../../../wow/lairs/lairs-journal.css";

export default function LairsLayout({ children }: { children: React.ReactNode }) {
  preload("/assets/wow/ui-textures/character/ui-background-rock-optimized.webp", { as: "image", type: "image/webp", fetchPriority: "high" });
  return children;
}
