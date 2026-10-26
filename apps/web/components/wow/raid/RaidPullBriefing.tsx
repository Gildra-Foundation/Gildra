import Image from "next/image";
import { HeartPulse, Shield, Swords, Crosshair, ExternalLink, Route, ArrowUpRight } from "lucide-react";
import { AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { raidPullCopy } from "./raidPullCopy";
import type { RaidPull, RaidPullRole } from "./raidPullTypes";
import styles from "./raidPulls.module.css";
import art from "./raidBriefingArt.module.css";
import { RaidPlannerIcon } from "./VoidspirePlannerArt";
import { voidspireBossLinkClass } from "./voidspirePlannerLayout";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords };
const roles: RaidPullRole[] = ["tank", "healer", "dps"];

export function RaidPullBriefing({ pull, locale, role, slug }: { pull: RaidPull; locale: "ru" | "en"; role: RaidPullRole | "all"; slug: string }) {
  const t = raidPullCopy[locale];
  const compact = slug === "the-voidspire";
  const text = (value: { ru: string; en: string }) => value[locale];
  return <div className={`${styles.briefing} ${art.briefingArt}`} data-raid-briefing="" data-role={role}>
    <section className={`${styles.call} ${art.command}`} data-raid-command>
      <h4 className={art.sectionHeading}><RaidPlannerIcon slug={slug} kind="command" fallback={<Crosshair size={16} aria-hidden="true" />} />{t.call}</h4>
      <p>{text(pull.call)}</p>
    </section>

    <RaidPullEnemies pull={pull} locale={locale} slug={slug} compact={compact} />

    <section>
      <h4 className={art.sectionHeading}>{t.tasks}</h4>
      <div className={`${styles.roleTasks} ${art.roleTasks}`}>
        {roles.filter((item) => role === "all" || item === role).map((item) => {
          const Icon = roleIcons[item];
          return <article key={item} data-raid-role-tasks={item}>
            <h5><span className={art.roleBadge} data-raid-role-badge><RaidPlannerIcon slug={slug} kind="command" fallback={<Icon size={18} aria-hidden="true" />} /></span>{t[item]}</h5>
            <ul>{pull.roles[item].map((task) => <li key={task.en}>{text(task)}</li>)}</ul>
          </article>;
        })}
      </div>
      {!compact && <p className={`${styles.muted} ${art.movement}`}>{t.movement}</p>}
    </section>

    <RaidPullAbilities pull={pull} locale={locale} role={role} compact={compact} />

    {pull.steps.length > 0 && <AtlasDisclosure className={art.actionOrder} summary={t.plan}>
      <ol className={styles.steps}>{pull.steps.map((step) => <li key={step.en}>{text(step)}</li>)}</ol>
    </AtlasDisclosure>}
    {pull.direction && <section className={art.route}>
      <h4 className={art.sectionHeading}><RaidPlannerIcon slug={slug} kind="map" fallback={<Route size={16} aria-hidden="true" />} />{t.route}</h4>
      <p>{text(pull.direction)}</p>
    </section>}
    {pull.next && (!compact || !pull.bossSlug) && <section className={`${styles.onward} ${art.onward}`}>
      <h4 className={art.sectionHeading}>{t.onward}</h4><p>{text(pull.next)}</p>
    </section>}
    {pull.bossSlug && <AtlasLinkButton className={`${art.openBoss} ${voidspireBossLinkClass(slug)}`} href={`${locale === "ru" ? "/ru" : ""}/wow/raids/${slug}/${pull.bossSlug}`} icon={slug === "the-voidspire" ? <RaidPlannerIcon slug={slug} kind="arena" /> : undefined} iconAfter={slug === "the-voidspire" ? undefined : <ArrowUpRight size={18} aria-hidden="true" />}>
      {t.openBoss}
    </AtlasLinkButton>}
  </div>;
}

function RaidPullEnemies({ pull, locale, slug, compact }: { pull: RaidPull; locale: "ru" | "en"; slug: string; compact: boolean }) {
  const t = raidPullCopy[locale];
  const text = (value: { ru: string; en: string }) => value[locale];
  return <>
    {(!compact || pull.enemies.length > 0) && <section>
      <h4 className={art.sectionHeading}>{t.enemies}</h4>
      {pull.enemies.length ? <ul className={`${styles.enemies} ${art.enemies}`} data-raid-enemies>
        {pull.enemies.map((enemy) => <li key={enemy.npcId ?? enemy.name.en}>
          <div className={`${styles.enemyIdentity} ${art.enemyIdentity}`}>
            <span className={art.enemyPortrait} data-raid-enemy-art aria-hidden="true">
              {enemy.artwork
                ? <Image src={enemy.artwork} alt="" width={44} height={44} />
                : <RaidPlannerIcon slug={slug} kind="command" fallback={<Crosshair size={22} aria-hidden="true" />} />}
            </span>
            <div className={art.enemyName}>
              <strong>{enemy.count !== undefined && <span>{enemy.count} × </span>}{compact && enemy.npcId ? <a href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}npc=${enemy.npcId}`} target="_blank" rel="noreferrer">{text(enemy.name)} <ExternalLink size={12} aria-hidden="true" /></a> : text(enemy.name)}</strong>
              <small data-priority={enemy.priority}>{t[enemy.priority]}</small>
            </div>
          </div>
          {enemy.note && <p>{text(enemy.note)}</p>}
          {!compact && enemy.npcId && <a className={`${styles.sourceLink} ${art.sourceLink}`} href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}npc=${enemy.npcId}`} target="_blank" rel="noreferrer">
            {text(enemy.name)} <ExternalLink size={12} aria-hidden="true" />
          </a>}
        </li>)}
      </ul> : <p className={styles.muted}>{t.noEnemies}</p>}
    </section>}
  </>;
}

function RaidPullAbilities({ pull, locale, role, compact }: { pull: RaidPull; locale: "ru" | "en"; role: RaidPullRole | "all"; compact: boolean }) {
  const t = raidPullCopy[locale];
  const text = (value: { ru: string; en: string }) => value[locale];
  const abilities = pull.abilities.filter((ability) => role === "all" || ability.roles.includes(role));
  return <>
    {(!compact || abilities.length > 0) && <section>
      <h4 className={art.sectionHeading}>{t.abilities}</h4>
      {abilities.length ? <ul className={`${styles.abilities} ${art.abilities}`}>
        {abilities.map((ability) => <li key={ability.spellId ?? ability.name.en}>
          <div className={`${styles.abilityTitle} ${art.abilityTitle}`}>
            {ability.icon && <span className={art.spellFrame} data-raid-spell-art aria-hidden="true">
              <Image src={ability.icon} alt="" width={40} height={40} />
            </span>}
            <div className={art.abilityName}>
              <strong>{compact && ability.spellId ? <a href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}spell=${ability.spellId}`} target="_blank" rel="noreferrer">{text(ability.name)} <ExternalLink size={12} aria-hidden="true" /></a> : text(ability.name)}</strong>
              {ability.caster && <small>{text(ability.caster)}</small>}
            </div>
            {ability.action && <b className={`${styles.action} ${art.action}`} data-action={ability.action}>{t.actions[ability.action]}</b>}
          </div>
          {ability.effect && <p>{text(ability.effect)}</p>}
          {ability.response && <p className={`${styles.response} ${art.response}`}>{text(ability.response)}</p>}
          {ability.action && (!compact || role === "all" && ability.roles.length < 3) && <p className={styles.assignment}>{t.assignments}: {ability.roles.length === 3 ? t.shared : ability.roles.map((item) => t[item]).join(" · ")}</p>}
          {!compact && ability.spellId && <a className={`${styles.sourceLink} ${art.sourceLink}`} href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}spell=${ability.spellId}`} target="_blank" rel="noreferrer">
            {text(ability.name)} <ExternalLink size={12} aria-hidden="true" />
          </a>}
        </li>)}
      </ul> : <p className={styles.muted}>{pull.abilities.length ? t.noRoleAbilities : t.noAbilities}</p>}
    </section>}
  </>;
}
