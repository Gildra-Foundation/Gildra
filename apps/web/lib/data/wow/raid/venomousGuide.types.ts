import type { GuideText } from './voidspireVideoGuide';
import type { SporefallGuide, SporefallMechanic } from './sporefallGuide';

export type VenomousGuideBoss = Omit<SporefallGuide, 'mechanics' | 'diagram'> & {
  id: string;
  image?: string;
  mechanics: (SporefallMechanic & { targetId?: string })[];
  diagram: Omit<SporefallGuide['diagram'], 'steps'> & {
    title: GuideText;
    steps: { id: string; title: GuideText; body: GuideText }[];
  };
};
