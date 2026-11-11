import type { ChangeQuery } from '@/lib/data/wow/foreverClasses';
export function readChangeQuery(params: Record<string, string | string[] | undefined>): ChangeQuery {
  const one = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  return { kind: ['talent', 'spellbook'].includes(one('kind')) ? one('kind') : '', status: ['added', 'changed', 'removed'].includes(one('status')) ? one('status') : '', q: one('q').slice(0, 200), page: one('page') };
}
