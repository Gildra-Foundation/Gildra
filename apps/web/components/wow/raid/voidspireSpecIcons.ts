import { talentSpecThemes } from '@/lib/talentSpecThemes';

// Official specialization portraits already used by the shared player-profile picker.
const portraits: Record<number, string> = {
  103: 'feral-druid', 104: 'guardian-druid', 105: 'restoration-druid',
  1468: 'preservation-evoker', 256: 'discipline-priest', 257: 'holy-priest',
  250: 'blood-dk', 255: 'survival-hunter', 65: 'holy-paladin', 66: 'prot-paladin',
  73: 'prot-warrior', 267: 'destro-lock', 268: 'brewmaster-monk',
  270: 'mistweaver-monk', 581: 'vengeance-dh', 1480: 'devourer-dh',
};
export function voidspireSpecIcon(id: number) {
  return portraits[id] ? `/assets/specs/${portraits[id]}.jpg` : talentSpecThemes.find(theme => theme.specId === id)?.iconUrl;
}
