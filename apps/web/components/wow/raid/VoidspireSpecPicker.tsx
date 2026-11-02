'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UsersRound } from 'lucide-react';
import { AtlasValyroSelect } from '@gildra/atlas-ui/AtlasValyroSelect';
import { AtlasValyroScope } from '@gildra/atlas-ui/AtlasValyroScope';
import { PortalContainerContext, useIsClient } from '@gildra/atlas-ui/valyro-ui/primitives/Portal';
import { guideRole, guideSpecs } from './voidspireGuideCounters';
import { voidspireSpecIcon } from './voidspireSpecIcons';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import styles from './voidspireGuide.module.css';

/** Kit-owned grouped listbox: keyboard/type-ahead, touch, dismissal and focus return. */
export function VoidspireSpecPicker({ value, onChange, locale }: {
  value: number; onChange: (value: number) => void; locale: 'ru' | 'en';
}) {
  const t = voidspireGuideCopy[locale];
  const isClient = useIsClient();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const selected = guideSpecs.find(spec => spec.id === value);
  const classes = [...new Map(guideSpecs.map(spec => [spec.classId, spec.className])).entries()]
    .sort((a,b) => a[1][locale].localeCompare(b[1][locale], locale));
  const options = [
    { value: '0', label: t.examples, icon: <UsersRound aria-hidden="true" /> },
    ...classes.map(([id, name]) => ({ label: name[locale], options: guideSpecs.filter(spec => spec.classId === id).map(spec => ({
      value: String(spec.id), label: `${spec.className[locale]} · ${spec.name[locale]}`,
      description: t.roles[guideRole(spec.id)!],
      icon: <Image className={styles.specIcon} src={voidspireSpecIcon(spec.id)!} width={30} height={30} alt="" />,
    })) })),
  ];
  return <PortalContainerContext.Provider value={container}>
    <div className={styles.specField}>
      <label htmlFor="guide-spec">{t.spec}{selected && <span> · {t.roles[guideRole(value)!]}</span>}</label>
      <AtlasValyroSelect id="guide-spec" className={styles.specTrigger} size="lg" aria-label={t.spec}
        value={String(value)} options={options} onValueChange={next => onChange(Number(next))} />
    </div>
    {isClient && createPortal(<AtlasValyroScope locale={locale} className={styles.specMenu}>
      <div ref={setContainer} data-guide-spec-layer />
    </AtlasValyroScope>, document.body)}
  </PortalContainerContext.Provider>;
}
