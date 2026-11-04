import type { GuideText } from './voidspireVideoGuide';
import type { VenomousGuideBoss } from './venomousGuide.types';
import { venomousGuideFirst } from './venomousGuideFirst';
import { venomousGuideLast } from './venomousGuideLast';

export const venomousGuide: {
  raidName: GuideText;
  bosses: VenomousGuideBoss[];
  sources: { title: string; url: string }[];
} = {
  raidName: { ru: 'Отравленная бездна', en: 'The Venomous Abyss' },
  bosses: [...venomousGuideFirst, ...venomousGuideLast],
  sources: [
    { title: 'Blizzard · The Venomous Abyss', url: 'https://news.blizzard.com/en-us/article/24294062/curse-of-ulatek-the-venomous-abyss-raid-finder-wing-3-now-live' },
    ...[...venomousGuideFirst, ...venomousGuideLast].flatMap(boss => boss.sources),
  ],
};
