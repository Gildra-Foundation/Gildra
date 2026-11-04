import type { CSSProperties } from 'react';
import { raidHubControlLayout } from './raidHubControls';
import type { RaidHubSlug } from './raidHubData';

/** Carry the raid material through portal boundaries as well as the page. */
export function raidGuideMaterial(raid: RaidHubSlug): CSSProperties {
  return {
    ...raidHubControlLayout(raid),
    ...(raid === 'sporefall' ? {
      '--guide-accent': 'var(--atlas-dungeon-altar-accent)',
      '--guide-accent-strong': 'var(--atlas-dungeon-altar-accent-strong)',
      '--guide-hint-frame-x': '26.496px',
      '--guide-hint-frame-y': '28.152px',
      '--guide-portrait-frame-x': '19.2px',
      '--guide-portrait-frame-y': '20.4px',
      '--guide-picker-frame-x': '23.552px',
      '--guide-picker-frame-y': '25.024px',
    } : {}),
  } as CSSProperties;
}
