'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UsersRound } from 'lucide-react';
import { AtlasValyroSelect } from '@gildra/atlas-ui/AtlasValyroSelect';
import { AtlasValyroScope } from '@gildra/atlas-ui/AtlasValyroScope';
import { PortalContainerContext, useIsClient } from '@gildra/atlas-ui/valyro-ui/primitives/Portal';
import { raidGuideMaterial } from './raidGuideMaterial';
import type { RaidHubSlug } from './raidHubData';
import { guideRole, guideSpecs } from './voidspireGuideCounters';
import { voidspireSpecIcon } from './voidspireSpecIcons';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import { guideClassForSpec, guideSpecForClass, voidspireClasses, voidspirePickerCopy } from './voidspirePickerState';
import styles from './voidspireSpecPicker.module.css';


/** Separate class and spec listboxes retain the kit's keyboard, touch and focus behaviour. */
export function VoidspireSpecPicker({ value, onChange, locale, raid = 'the-voidspire' }: {
  raid?: RaidHubSlug; value: number; onChange: (value: number) => void; locale: 'ru' | 'en';
}) {
  const material = raidGuideMaterial(raid);
  const t = voidspireGuideCopy[locale], copy = voidspirePickerCopy[locale];
  const isClient = useIsClient();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const classId = guideClassForSpec(value);
  const classOptions = [
    { value: '0', label: t.examples, icon: <UsersRound aria-hidden="true" /> },
    ...[...voidspireClasses].sort((a,b) => a.name[locale].localeCompare(b.name[locale], locale)).map(entry => ({
      value: String(entry.id), label: entry.name[locale],
      icon: <Image className={styles.icon} src={entry.icon} width={30} height={30} alt="" />,
    })),
  ];
  const specOptions = guideSpecs.filter(spec => spec.classId === classId).map(spec => ({
    value: String(spec.id), label: spec.name[locale], description: t.roles[guideRole(spec.id)!],
    icon: <Image className={styles.icon} src={voidspireSpecIcon(spec.id)!} width={30} height={30} alt="" />,
  }));
  return <PortalContainerContext.Provider value={container}>
    <div className={styles.fields} data-guide-player-picker>
      <div className={styles.field}>
        <label htmlFor="guide-class">{copy.classLabel}</label>
        <AtlasValyroSelect id="guide-class" className={styles.trigger} style={material} size="lg" aria-label={copy.classLabel}
          value={String(classId)} options={classOptions} onValueChange={next => onChange(guideSpecForClass(Number(next), value))} />
      </div>
      <div className={styles.field}>
        <label htmlFor="guide-spec">{copy.specLabel}{classId !== 0 && <span> · {t.roles[guideRole(value)!]}</span>}</label>
        <AtlasValyroSelect id="guide-spec" className={styles.trigger} style={material} size="lg" aria-label={copy.specLabel}
          placeholder={copy.chooseClass} disabled={!classId} value={classId ? String(value) : ''} options={specOptions}
          onValueChange={next => { if (specOptions.some(option => option.value === next)) onChange(Number(next)); }} />
      </div>
    </div>
    {isClient && createPortal(<AtlasValyroScope locale={locale} className={styles.menu}>
      <div ref={setContainer} data-guide-spec-layer />
    </AtlasValyroScope>, document.body)}
  </PortalContainerContext.Provider>;
}
