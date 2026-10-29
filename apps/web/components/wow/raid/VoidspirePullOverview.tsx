"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { ArrowUpRight } from "lucide-react";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { RaidPlaque } from "./raidMaterial";
import { raidHubControlLayout } from "./raidHubControls";
import { raidCardThemes } from "./raidCardThemes";
import { RaidPullMap } from "./RaidPullMap";
import { RaidAbilityText } from "./RaidAbilityText";
import { raidPullCopy } from "./raidPullCopy";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import type { RaidPull, RaidPullAbility, RaidPullPlan, RaidPullRole } from "./raidPullTypes";
import styles from "./voidspireOverview.module.css";

type Props = {
  plan: RaidPullPlan; locale: "ru" | "en"; active: number;
  select: (index: number, reveal?: boolean) => void;
  panel: RefObject<HTMLDivElement | null>;
  role: RaidPullRole | "all"; onRoleChange: (role: string) => void;
  playerPicker?: ReactNode; sources: ReactNode;
  difficulty: "normal" | "heroic"; onDifficultyChange: (value: "normal" | "heroic") => void;
  spec?: { className: { ru: string; en: string }; name: { ru: string; en: string } };
};

export function VoidspirePullOverview({ plan, locale, active, select, panel, role, onRoleChange, playerPicker, sources, spec, difficulty, onDifficultyChange }: Props) {
  const t = raidPullCopy[locale];
  const bossCopy = raidBossPlannerCopy[locale];
  const encounter = Boolean(plan.encounter);
  const label = encounter ? bossCopy.phase : t.pull;
  const pull = plan.pulls[active];
  const prefix = locale === "ru" ? "/ru" : "";
  const boss = plan.bosses.find(item => item.slug === pull.bossSlug);
  return <div className={styles.workspace} data-raid-pulls={plan.slug} data-raid-overview="simple" data-raid-boss-planner={plan.encounter?.bossSlug} data-difficulty={encounter ? difficulty : undefined} style={{ ...raidHubControlLayout("the-voidspire"), "--raid-card-accent": raidCardThemes["the-voidspire"].accent } as CSSProperties}>
    <nav className={styles.navigation} aria-label={encounter ? bossCopy.phases : t.list} data-raid-pull-navigation>
      <ol>{plan.pulls.map((item, index) => <li key={item.id}><button type="button" data-raid-pull-choice={index} aria-pressed={active === index} aria-controls={`raid-pull-${plan.slug}`} onClick={() => select(index, true)}>
        <b>{index + 1}</b><span>{item.title[locale]}</span>
      </button></li>)}</ol>
    </nav>
    <div className={styles.content}>
      <div ref={panel} id={`raid-pull-${plan.slug}`} data-raid-selected={pull.id} className={styles.selected}>
        <RaidPlaque raid="the-voidspire" className={styles.plaque}>
          <header className={styles.heading}>
            <small>{pull.kind === "rally" ? t.rally : label} {active + 1}{pull.area && <> · {pull.area[locale]}</>}</small>
            <h3>{pull.title[locale]}</h3>
          </header>
          {encounter && <div className={styles.difficulty} data-raid-boss-difficulty><AtlasSegmented aria-label={bossCopy.difficulty} value={difficulty} onValueChange={value => onDifficultyChange(value as "normal" | "heroic")} options={(["normal", "heroic"] as const).map(value => ({ value, label: bossCopy[value] }))} /></div>}
          <span className={styles.srOnly} role="status" aria-live="polite">{label} {active + 1}: {pull.title[locale]}</span>
          <p className={styles.call} data-raid-command><RaidAbilityText value={pull.call[locale]} abilities={pull.abilities} locale={locale} /></p>
          {encounter ? <EncounterMechanics pull={pull} locale={locale} difficulty={difficulty} /> : <PullEnemies pull={pull} locale={locale} />}
          {pull.direction && <p className={styles.direction} data-raid-pull-direction>{pull.direction[locale]}</p>}
          {boss && !encounter && <Link className={styles.boss} data-raid-boss-link={boss.slug} href={`${prefix}/wow/raids/${plan.slug}/${boss.slug}`}>{boss.name[locale]}<ArrowUpRight size={16} aria-hidden="true" /></Link>}
          <AtlasDisclosure summary={t.tasks} className={styles.roles}>
            <div className={styles.filters} data-raid-role-toolbar>
              <AtlasSegmented aria-label={t.role} value={role} onValueChange={onRoleChange} options={(["all", "tank", "healer", "dps"] as const).map(value => ({ value, label: t[value] }))} />
              {playerPicker}
            </div>
            {spec && <p>{spec.className[locale]} · {spec.name[locale]}</p>}
            {(["tank", "healer", "dps"] as const).filter(item => role === "all" || item === role).map(item => <section key={item} data-raid-role-tasks={item}><h4>{t[item]}</h4><ul>{pull.roles[item].map(task => <li key={task.en}><RaidAbilityText value={task[locale]} abilities={pull.abilities} locale={locale} /></li>)}</ul></section>)}
          </AtlasDisclosure>
        </RaidPlaque>
      </div>
      <AtlasDisclosure summary={t.mapAndArenas} className={styles.map}>
        <RaidPullMap plan={plan} active={active} locale={locale} onSelect={select} role={role} simplified />
      </AtlasDisclosure>
      {sources}
    </div>
  </div>;
}

function PullEnemies({ pull, locale }: { pull: RaidPull; locale: "ru" | "en" }) {
  const t = raidPullCopy[locale];
  const prefix = locale === "ru" ? "ru/" : "";
  return <ul className={styles.enemies} data-raid-enemies>{pull.enemies.map(enemy => <li key={enemy.npcId ?? enemy.name.en} data-raid-enemy={enemy.npcId}>
    <div className={styles.enemyHeading}><a href={`https://www.wowhead.com/${prefix}npc=${enemy.npcId}`} target="_blank" rel="noreferrer">{enemy.count !== undefined && `${enemy.count} × `}{enemy.name[locale]}<ArrowUpRight size={12} aria-hidden="true" /></a><small data-priority={enemy.priority}>{t[enemy.priority]}</small></div>
    {pull.abilities.filter(ability => ability.caster?.en === enemy.name.en).map(ability => <PullAbility key={ability.spellId ?? ability.name.en} ability={ability} pull={pull} locale={locale} />)}
  </li>)}</ul>;
}

function EncounterMechanics({ pull, locale, difficulty }: { pull: RaidPull; locale: "ru" | "en"; difficulty: "normal" | "heroic" }) {
  const t = raidPullCopy[locale];
  const adds = pull.enemies.filter(enemy => enemy.priority !== "boss");
  return <>
    {adds.length > 0 && <section className={styles.adds} data-raid-boss-adds><h4>{raidBossPlannerCopy[locale].add}</h4><ul>{adds.map(enemy => <li key={enemy.npcId ?? enemy.name.en}>{enemy.npcId ? <a href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}npc=${enemy.npcId}`} target="_blank" rel="noreferrer">{enemy.name[locale]}</a> : enemy.name[locale]}</li>)}</ul></section>}
    <ul className={styles.mechanics} aria-label={t.abilities}>{pull.abilities.filter(ability => difficulty === "heroic" || !ability.heroicOnly).map(ability => <li key={ability.spellId ?? ability.name.en}><PullAbility ability={ability} pull={pull} locale={locale} difficulty={difficulty} encounter /></li>)}</ul>
  </>;
}

function PullAbility({ ability, pull, locale, difficulty = "normal", encounter = false }: { ability: RaidPullAbility; pull: RaidPull; locale: "ru" | "en"; difficulty?: "normal" | "heroic"; encounter?: boolean }) {
  const t = raidPullCopy[locale];
  return <div className={styles.ability} data-raid-ability={ability.spellId}>
    <div className={styles.abilityTitle}>{ability.icon && <Image src={ability.icon} alt="" width={24} height={24} />}
      <a href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}spell=${ability.spellId}`} target="_blank" rel="noreferrer">{ability.name[locale]}</a>
      {ability.action && !encounter && <b data-action={ability.action}>{t.actions[ability.action]}</b>}
      {encounter && ability.roles.length < 3 && <small>{ability.roles.map(role => t[role]).join(" · ")}</small>}
    </div>
    {ability.response && <p><RaidAbilityText value={ability.response[locale]} abilities={pull.abilities} locale={locale} /></p>}
    {difficulty === "heroic" && ability.heroic && <p className={styles.heroic} data-raid-heroic-note><b>{raidBossPlannerCopy[locale].heroicNote}: </b><RaidAbilityText value={ability.heroic[locale]} abilities={pull.abilities} locale={locale} /></p>}
  </div>;
}
