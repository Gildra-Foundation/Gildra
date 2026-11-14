export type Localized = { en: string; ru: string };
export type ClassSlug = 'druid' | 'hunter' | 'mage' | 'paladin' | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';
export type ChangeStatus = 'added' | 'changed' | 'moved' | 'removed';
export type ChangeRank = {
  rank: number; spellId?: number; level?: number;
  before?: Localized; after?: Localized;
  baseline?: 'classic-69722' | 'classic-era-rank1';
  coefficient?: { before: number; after: number };
};
export type ClassChange = {
  key: string; classSlug: ClassSlug; kind: 'talent' | 'spellbook'; status: ChangeStatus;
  name: Localized; tree: Localized; ranks: ChangeRank[];
  talentId?: number; icon?: number; row?: number; column?: number; previousColumn?: number; previousTree?: string; previousRow?: number; previousMaxRank?: number;
};
export type ChangeQuery = { kind?: string; status?: string; q?: string; page?: string };
export const PAGE_SIZE = 18;
export function matchesChanges(rows: ClassChange[], classSlug: ClassSlug, query: ChangeQuery): ClassChange[] {
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/ё/g, 'е').replace(/[’']/g, '');
  const words = normalize(query.q?.trim() ?? '').split(/\s+/).filter(Boolean);
  return rows.filter(row => row.classSlug === classSlug
    && (!['talent', 'spellbook'].includes(query.kind ?? '') || row.kind === query.kind)
    && (!['added', 'changed', 'removed'].includes(query.status ?? '') || row.status === query.status || (query.status === 'changed' && row.status === 'moved'))
    && words.every(word => normalize([row.name.en, row.name.ru, row.tree.en, row.tree.ru].join(' ')).includes(word)));
}
export function pageNumber(value: string | undefined, total: number): number {
  const number = Number(value);
  return Math.max(1, Math.min(Number.isSafeInteger(number) ? number : 1, Math.max(1, Math.ceil(total / PAGE_SIZE))));
}
/** Native Forever identities only. Classic removals intentionally have no current record link. */
export function classSpellPath(id: number | undefined): string | null {
  return Number.isSafeInteger(id) && (id ?? 0) > 0 ? `/wow/forever/library/spell/${id}` : null;
}

/** Same native-file resolver as DATA; coordinator can replace with its shared helper. */
export function classChangeIconUrl(fileId: number | undefined): string | undefined {
  return Number.isSafeInteger(fileId) && (fileId ?? 0) > 0 ? `https://foreverdb.net/icons/${fileId}.webp` : undefined;
}
