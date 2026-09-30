import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";

const specStyleCache = new Map<string, Promise<string>>();
const specStyleDirectories: Record<string, string> = {
  deathknight: "death-knight",
  demonhunter: "demon-hunter",
};

export function getTalentSpecStyles(theme: Pick<TalentSpecTheme, "slug" | "classKey">) {
  const cached = specStyleCache.get(theme.slug);
  if (cached) return cached;

  const directory = specStyleDirectories[theme.classKey] ?? theme.classKey;
  const suffix = `-${directory}`;
  const specStyleName = theme.slug.endsWith(suffix) ? theme.slug.slice(0, -suffix.length) : "";
  if (!specStyleName) throw new Error(`No talent styles configured for ${theme.slug}`);

  const filePath = path.join(process.cwd(), "app/styles/talents/specs", directory, `${specStyleName}.css`);
  const styles = readFile(filePath, "utf8");
  specStyleCache.set(theme.slug, styles);
  return styles;
}
