import "@/app/styles/talents.css";
import "@/app/styles/talents/premium.css";
import type { ReactNode } from "react";

export default function RussianTalentsLayout({ children }: { children: ReactNode }) {
  return <>
    <link rel="preconnect" href="https://render.worldofwarcraft.com" />
    <div data-talent-route>{children}</div>
  </>;
}
