import Image from "next/image";
import { HeartPulse, Shield, Swords, Crosshair, ExternalLink } from "lucide-react";
import { AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { raidPullCopy } from "./raidPullCopy";
import type { RaidPull, RaidPullRole } from "./raidPullTypes";
import styles from "./raidPulls.module.css";

const roleIcons = { tank: Shield, healer: HeartPulse, dps: Swords };
const roles: RaidPullRole[] = ["tank", "healer", "dps"];

export function RaidPullBriefing({ pull, locale, role, slug }: { pull: RaidPull; locale: "ru" | "en"; role: RaidPullRole | "all"; slug: string }) {
  const t = raidPullCopy[locale];
  const text = (value: { ru: string; en: string }) => value[locale];
  const abilities = pull.abilities.filter((ability) => role === "all" || ability.roles.includes(role));
  return <div className={styles.briefing}>
    <section className={styles.call}><h4>{t.call}</h4><p>{text(pull.call)}</p></section>
    <section><h4>{t.enemies}</h4>{pull.enemies.length ? <ul className={styles.enemies}>{pull.enemies.map((enemy) => <li key={enemy.npcId ?? enemy.name.en}>
      <div className={styles.enemyIdentity}>
        {enemy.artwork ? <Image src={enemy.artwork} alt="" width={44} height={44} /> : <Crosshair aria-hidden="true" size={22} />}
        <strong>{enemy.count !== undefined && <span>{enemy.count} × </span>}{text(enemy.name)}</strong>
        <small data-priority={enemy.priority}>{t[enemy.priority]}</small>
      </div>
      {enemy.note && <p>{text(enemy.note)}</p>}
      {enemy.npcId && <a className={styles.sourceLink} href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}npc=${enemy.npcId}`} target="_blank" rel="noreferrer">{text(enemy.name)} <ExternalLink size={12} aria-hidden="true" /></a>}
    </li>)}</ul> : <p className={styles.muted}>{t.noEnemies}</p>}</section>
    <section><h4>{t.tasks}</h4><div className={styles.roleTasks}>{roles.filter((item) => role === "all" || item === role).map((item) => {
      const Icon = roleIcons[item];
      return <article key={item} data-raid-role-tasks={item}><h5><Icon size={18} aria-hidden="true" />{t[item]}</h5><ul>{pull.roles[item].map((task) => <li key={task.en}>{text(task)}</li>)}</ul></article>;
    })}</div><p className={styles.muted}>{t.movement}</p></section>
    <section><h4>{t.abilities}</h4>{abilities.length ? <ul className={styles.abilities}>{abilities.map((ability) => <li key={ability.spellId ?? ability.name.en}>
      <div className={styles.abilityTitle}>{ability.icon && <Image src={ability.icon} alt="" width={36} height={36} />}<div><strong>{text(ability.name)}</strong>{ability.caster && <small>{text(ability.caster)}</small>}</div>{ability.action && <b className={styles.action} data-action={ability.action}>{t.actions[ability.action]}</b>}</div>
      {ability.effect && <p>{text(ability.effect)}</p>}
      {ability.response && <p className={styles.response}>{text(ability.response)}</p>}
      {ability.action && <p className={styles.assignment}>{t.assignments}: {ability.roles.length === 3 ? t.shared : ability.roles.map((item) => t[item]).join(" · ")}</p>}
      {ability.spellId && <a className={styles.sourceLink} href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}spell=${ability.spellId}`} target="_blank" rel="noreferrer">{text(ability.name)} <ExternalLink size={12} aria-hidden="true" /></a>}
    </li>)}</ul> : <p className={styles.muted}>{pull.abilities.length ? t.noRoleAbilities : t.noAbilities}</p>}</section>
    {pull.steps.length > 0 && <AtlasDisclosure summary={t.plan}><ol className={styles.steps}>{pull.steps.map((step) => <li key={step.en}>{text(step)}</li>)}</ol></AtlasDisclosure>}
    {pull.direction && <section><h4>{t.route}</h4><p>{text(pull.direction)}</p></section>}
    {pull.next && <section className={styles.onward}><h4>{t.onward}</h4><p>{text(pull.next)}</p></section>}
    {pull.bossSlug && <AtlasLinkButton href={`${locale === "ru" ? "/ru" : ""}/wow/raids/${slug}/${pull.bossSlug}`}>{t.openBoss}</AtlasLinkButton>}
  </div>;
}
