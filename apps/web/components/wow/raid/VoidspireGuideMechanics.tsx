import Image from 'next/image';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { voidspireBeginnerTerms } from '@/lib/data/wow/raid/voidspireBeginnerGuide';
import type { GuideMechanic, VideoBossGuide } from '@/lib/data/wow/raid/voidspireVideoGuide';
import { voidspireRoleActions } from '@/lib/data/wow/raid/voidspireRoleTactics';
import { voidspireInterruptTargets, type InterruptTarget } from '@/lib/data/wow/raid/voidspireInterruptTargets';
import { RaidPlaque } from './raidMaterial';
import { VoidspireGuideHint } from './VoidspireGuideHint';
import { guideCounters, guideRole } from './voidspireGuideCounters';
import { voidspireGuideCopy } from './voidspireGuideCopy';
import records from './voidspireBossRecords.json';
import styles from './voidspireGuide.module.css';

type Props = { guide: VideoBossGuide; locale: 'ru' | 'en'; difficulty: 'normal' | 'heroic'; specId: number };
export function VoidspireGuideMechanics({ guide, locale, difficulty, specId }: Props) {
  const t = voidspireGuideCopy[locale];
  const role = guideRole(specId);
  return <RaidPlaque as="section" raid="the-voidspire" className={`${styles.materialPanel} ${styles.mechanics}`} aria-labelledby="guide-mechanics-title" data-guide-reveal>
    <h3 id="guide-mechanics-title">{t.mechanics}</h3>
    <div className={styles.mechanicHead} aria-hidden="true"><span>{t.signal}</span><span>{t.response}</span></div>
    <ol className={styles.rows}>{guide.mechanics.map(mechanic => {
      const target = voidspireInterruptTargets[guide.slug]?.[mechanic.id];
      const action = role ? voidspireRoleActions[guide.slug]?.[mechanic.id]?.[role] : undefined;
      return <li key={mechanic.id} id={`guide-mechanic-${mechanic.id}`} tabIndex={-1} data-guide-mechanic={mechanic.id}>
      <div className={styles.signal}>
        <div className={styles.spellHeading}>
          {mechanic.spellId && String(mechanic.spellId) in records.spells && <Image src={`/assets/wow/raids/reviewed-mechanics/${mechanic.spellId}.jpg`} width={30} height={30} alt="" />}
          <div><h4>{mechanic.trigger[locale]}</h4><p className={styles.spellName}>{mechanic.name[locale]}</p></div>
        </div>
        {target && <InterruptIdentity target={target} locale={locale} />}
      </div>
      <div className={styles.response}><span className={styles.mobileResponseLabel}>{t.response}</span>
        <p>{mechanic.response[locale]}</p>
        {action && <p className={styles.roleAction} data-role-action={role}><b>{t.roles[role!]}: </b>{action[locale]}</p>}
        {difficulty === 'heroic' && mechanic.heroic && <p className={styles.heroic} data-heroic-note><b>{t.heroicNote}: </b>{mechanic.heroic[locale]}</p>}
        <GuideCounterAdvice mechanic={mechanic} locale={locale} specId={specId} target={target} />
      </div>
    </li>; })}</ol>
  </RaidPlaque>;
}
export function GuideCounterAdvice({ mechanic, locale, specId, target }: { target?: InterruptTarget; mechanic: Pick<GuideMechanic, 'counters' | 'counterRoles'>; locale: 'ru' | 'en'; specId: number }) {
  const t = voidspireGuideCopy[locale];
  const role = guideRole(specId);
  if (role && mechanic.counterRoles && !mechanic.counterRoles.includes(role)) return null;
  const groups = mechanic.counters?.map(kind => ({ kind, tools: guideCounters(kind, specId) })) ?? [];
  if (!groups.length) return null;
  if (groups.every(group => !group.tools.length)) return <p className={styles.noTool}>{t.noTool[groups[0].kind]}</p>;
  const advice = <div className={styles.counters}>{groups.map(({kind, tools}) => <div className={styles.counterGroup} key={kind} data-counter-kind={kind}>
    <span>{kind === 'interrupt' || kind === 'defend' || kind === 'aoe' ? <VoidspireGuideHint title={kind === 'interrupt' && specId ? t.yourKick : t.kinds[kind]} locale={locale} detail={<p>{voidspireBeginnerTerms[kind === 'interrupt' ? 'interrupt' : 'defensive'].detail[locale]}</p>} /> : t.kinds[kind]}</span>
    {!tools.length && <p className={styles.noTool}>{t.noTool[kind]}</p>}
    <ul>{tools.map(({spell, talent, note}) => <li key={spell.id}>
      {kind === 'interrupt' && target ? <VoidspireGuideHint title={spell.name[locale]} locale={locale} spellId={spell.id} source={`https://www.wowhead.com/${locale === 'ru' ? 'ru/' : ''}spell=${spell.id}`} detail={<>
        <p><b>{t.target}: </b>{target.enemies.map(enemy => enemy.name[locale]).join(' / ')}</p>
        <p><b>{t.cast}: </b>{target.cast[locale]}</p><p>{target.timing[locale]}</p>
        {talent && <p>{t.talent}</p>}{note && <p>{note[locale]}</p>}
      </>}><Image src={spell.iconUrl} width={22} height={22} alt="" />{spell.name[locale]}{talent && <small>· {t.talent}</small>}</VoidspireGuideHint> : <a href={`https://www.wowhead.com/${locale === 'ru' ? 'ru/' : ''}spell=${spell.id}`} target="_blank" rel="noreferrer" data-player-spell={spell.id}>
        <Image src={spell.iconUrl} width={22} height={22} alt="" />{spell.name[locale]}{talent && <small>· {t.talent}</small>}
      </a>}
      {note && <small className={styles.toolNote}>{note[locale]}</small>}
    </li>)}</ul>
  </div>)}</div>;
  return specId ? advice : <AtlasDisclosure summary={t.raidAbilities}>{advice}</AtlasDisclosure>;
}

function InterruptIdentity({ target, locale }: { target: InterruptTarget; locale: 'ru' | 'en' }) {
  const t = voidspireGuideCopy[locale];
  const prefix = `https://www.wowhead.com/${locale === 'ru' ? 'ru/' : ''}`;
  return <dl className={styles.interruptIdentity} data-interrupt-cast={target.spellId}>
    <div><dt>{t.target}</dt><dd>{target.enemies.map(enemy => <VoidspireGuideHint key={enemy.name.en} title={enemy.name[locale]} detail={<p>{enemy.detail[locale]}</p>} source={enemy.npcId ? `${prefix}npc=${enemy.npcId}` : undefined} locale={locale} />)}</dd></div>
    <div><dt>{t.cast}</dt><dd><VoidspireGuideHint title={target.cast[locale]} detail={<><p>{target.consequence[locale]}</p><p>{target.timing[locale]}</p></>} source={`${prefix}spell=${target.spellId}`} locale={locale} /></dd></div>
  </dl>;
}
