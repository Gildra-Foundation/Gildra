import Image from 'next/image';
import type { GuideMechanic, VideoBossGuide } from '@/lib/data/wow/raid/voidspireVideoGuide';
import { guideCounters } from './voidspireGuideCounters';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import records from './voidspireBossRecords.json';
import styles from './voidspireGuide.module.css';

type Props = { guide: VideoBossGuide; locale: 'ru' | 'en'; difficulty: 'normal' | 'heroic'; specId: number };
export function VoidspireGuideMechanics({ guide, locale, difficulty, specId }: Props) {
  const t = voidspireGuideCopy[locale];
  return <section className={styles.mechanics} aria-labelledby="guide-mechanics-title">
    <h3 id="guide-mechanics-title">{t.mechanics}</h3>
    <ol className={styles.rows}>{guide.mechanics.map(mechanic => <li key={mechanic.id} data-guide-mechanic={mechanic.id}>
      <div className={styles.signal}>
        <div className={styles.spellHeading}>
          {mechanic.spellId && String(mechanic.spellId) in records.spells && <Image src={`/assets/wow/raids/reviewed-mechanics/${mechanic.spellId}.jpg`} width={30} height={30} alt="" />}
          <h4>{mechanic.name[locale]}</h4>
        </div>
        <p>{mechanic.trigger[locale]}</p>
      </div>
      <div className={styles.response}>
        <p>{mechanic.response[locale]}</p>
        {difficulty === 'heroic' && mechanic.heroic && <p className={styles.heroic} data-heroic-note><b>{t.heroicNote}: </b>{mechanic.heroic[locale]}</p>}
        <CounterAdvice mechanic={mechanic} locale={locale} specId={specId} />
      </div>
    </li>)}</ol>
  </section>;
}
function CounterAdvice({ mechanic, locale, specId }: { mechanic: GuideMechanic; locale: 'ru' | 'en'; specId: number }) {
  const t = voidspireGuideCopy[locale];
  const groups = mechanic.counters?.map(kind => ({ kind, tools: guideCounters(kind, specId) })) ?? [];
  if (!groups.length) return null;
  if (groups.every(group => !group.tools.length)) return <p className={styles.noTool}>{t.noTool[groups[0].kind]}</p>;
  return <div className={styles.counters}>{groups.filter(group => group.tools.length).map(({kind, tools}) => <div className={styles.counterGroup} key={kind} data-counter-kind={kind}>
    <span>{t.kinds[kind]}</span>
    <ul>{tools.map(({spell, talent, note}) => <li key={spell.id}>
      <a href={`https://www.wowhead.com/${locale === 'ru' ? 'ru/' : ''}spell=${spell.id}`} target="_blank" rel="noreferrer" data-player-spell={spell.id}>
        <Image src={spell.iconUrl} width={22} height={22} alt="" />{spell.name[locale]}{talent && <small>· {t.talent}</small>}
      </a>
      {note && <small className={styles.toolNote}>{note[locale]}</small>}
    </li>)}</ul>
  </div>)}</div>;
}
