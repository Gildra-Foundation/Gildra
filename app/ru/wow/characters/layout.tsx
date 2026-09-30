import type { ReactNode } from "react";
import { preloadCharacterBookEntry } from "@/lib/wow/preloadCharacterBookEntry";

export default function CharactersLayout({ children }: { children: ReactNode }) {
  preloadCharacterBookEntry();
  return children;
}
