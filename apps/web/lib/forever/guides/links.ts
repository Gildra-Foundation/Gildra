/** Matches DATA's foreverRecordPath contract. Coordinator replaces this adapter import at integration. */
export function foreverItemPath(id: number, locale: 'en' | 'ru') {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid Forever item identity');
  return `${locale === 'ru' ? '/ru' : ''}/wow/forever/library/item/${id}`;
}
