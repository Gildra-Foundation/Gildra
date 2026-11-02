/** Voidspire encounters share one document; other raids retain their boss routes. */
export function raidBossGuideHref(raid: string, boss: string, locale: 'ru' | 'en') {
  const base = `${locale === 'ru' ? '/ru' : ''}/wow/raids/${raid}`;
  return raid === 'the-voidspire' ? `${base}#boss=${boss}` : `${base}/${boss}`;
}
