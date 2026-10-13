/**
 * Which language versions of a document are filled in. Shared by the editor
 * (language bar, article panel) and the list column; client-safe.
 */
export type LocaleState = { title: boolean; summary: boolean; content: boolean };

/** Content languages in the order the staff read them. */
export const CONTENT_LOCALES = [
  { code: "ru", short: "RU", ru: "Русский", en: "Russian" },
  { code: "en", short: "EN", ru: "Английский", en: "English" },
] as const;

/** Fields a version needs to count as complete, per collection. */
export const REQUIRED_PARTS: Record<string, (keyof LocaleState)[]> = {
  guides: ["title", "summary", "content"],
  pages: ["title"],
};

export const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Lexical document with at least one non-empty text node (or an image, block or link card). */
export function hasText(node: unknown, depth = 0): boolean {
  if (!node || typeof node !== "object" || depth > 60) return false;
  const n = node as { text?: unknown; children?: unknown[]; root?: unknown; type?: string };
  if (n.root) return hasText(n.root, depth + 1);
  if (typeof n.text === "string" && n.text.trim()) return true;
  if (n.type === "upload" || n.type === "block" || n.type === "relationship") return true;
  return Array.isArray(n.children) && n.children.some((child) => hasText(child, depth + 1));
}

export function localeState(doc: { title?: unknown; summary?: unknown; content?: unknown }): LocaleState {
  return { title: filled(doc.title), summary: filled(doc.summary), content: hasText(doc.content) };
}

/** "complete" | "partial" | "empty" for the parts `collection` requires. */
export function stateLevel(state: LocaleState | undefined, collection: string): "complete" | "partial" | "empty" {
  if (!state) return "empty";
  const parts = REQUIRED_PARTS[collection] ?? REQUIRED_PARTS.guides;
  const done = parts.filter((part) => state[part]).length;
  if (done === parts.length) return "complete";
  return done === 0 && !state.title && !state.summary && !state.content ? "empty" : "partial";
}

/** Names of the required parts that are still missing. */
export function missingParts(state: LocaleState | undefined, collection: string, lang: "ru" | "en"): string[] {
  const names = {
    ru: { title: "заголовок", summary: "описание", content: "текст" },
    en: { title: "title", summary: "summary", content: "text" },
  }[lang];
  const parts = REQUIRED_PARTS[collection] ?? REQUIRED_PARTS.guides;
  return parts.filter((part) => !state?.[part]).map((part) => names[part]);
}
