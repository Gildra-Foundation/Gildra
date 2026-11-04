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
    } : raid === 'the-dreamrift' ? {
      '--guide-accent': 'var(--atlas-dungeon-vale-accent)',
      '--guide-accent-strong': 'var(--atlas-dungeon-vale-accent-strong)',
      '--guide-hint-frame-x': '26.496px',
      '--guide-hint-frame-y': '33.12px',
      '--guide-portrait-frame-x': '19.2px',
      '--guide-portrait-frame-y': '24px',
      '--guide-picker-frame-x': '23.552px',
      '--guide-picker-frame-y': '29.44px',
    } : raid === 'march-on-queldanas' ? {
      '--guide-accent': 'var(--atlas-dungeon-kings-accent)',
      '--guide-accent-strong': 'var(--atlas-dungeon-kings-accent-strong)',
      '--guide-hint-frame-x': '29.808px',
      '--guide-hint-frame-y': '33.12px',
      '--guide-portrait-frame-x': '21.6px',
      '--guide-portrait-frame-y': '24px',
      '--guide-picker-frame-x': '26.496px',
      '--guide-picker-frame-y': '29.44px',
    } : raid === 'venomous-abyss' ? {
      '--guide-accent': 'var(--atlas-dungeon-altar-accent)',
      '--guide-accent-strong': 'var(--atlas-dungeon-altar-accent-strong)',
      '--guide-hint-frame-x': '29.808px',
      '--guide-hint-frame-y': '34.776px',
      '--guide-hint-frame-bottom': '29.808px',
      '--guide-portrait-frame-x': '21.6px',
      '--guide-portrait-frame-y': '25.2px',
      '--guide-portrait-frame-bottom': '21.6px',
      '--guide-picker-frame-x': '26.496px',
      '--guide-picker-frame-y': '30.912px',
      '--guide-picker-frame-bottom': '26.496px',
    } : {}),
  } as CSSProperties;
}
