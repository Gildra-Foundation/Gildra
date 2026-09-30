"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Eye,
  Footprints,
  HeartPulse,
  MapPinned,
  Route,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Users,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { getRouteAbilityIntel, routeEnemyIcons, type AbilityCounter } from "./raidRouteAbilityIntel";
import { getMidnightRaidRoute, type RaidRouteAbility, type RouteAction } from "./midnightRaidRoutes";
import type { RaidDefinition } from "./midnightRaidData";
import styles from "./raidRoutePlanner.module.css";

const actionIcons: Record<RouteAction, typeof Ban> = {
  interrupt: Ban,
  move: Footprints,
  defensive: Shield,
  dispel: Sparkles,
  focus: Target,
  stop: Crosshair,
};

const actionLabels: Record<RouteAction, { ru: string; en: string }> = {
  interrupt: { ru: "Прервать", en: "Interrupt" },
  move: { ru: "Отойти", en: "Move" },
  defensive: { ru: "Защита", en: "Defensive" },
  dispel: { ru: "Снять", en: "Purge" },
  focus: { ru: "Фокус", en: "Focus" },
  stop: { ru: "Стоп", en: "Stop" },
};

const dangerLabels = {
  low: { ru: "Низкий риск", en: "Low risk" },
  medium: { ru: "Средний риск", en: "Medium risk" },
  high: { ru: "Высокий риск", en: "High risk" },
};

const counterLabels: Record<AbilityCounter, { ru: string; en: string }> = {
  kick: { ru: "Можно прервать", en: "Interruptible" },
  stop: { ru: "Сбить контролем", en: "Stop with CC" },
  dodge: { ru: "Нужно увернуться", en: "Must dodge" },
  los: { ru: "Спрятаться за стеной", en: "Break line of sight" },
  purge: { ru: "Снять с врага", en: "Purge enemy" },
  break: { ru: "Разбить уроном", en: "Break with damage" },
  defensive: { ru: "Неизбежно · защита", en: "Unavoidable · defensive" },
  scripted: { ru: "Сценарная механика", en: "Scripted mechanic" },
};

function enemyCount(pull: ReturnType<typeof getMidnightRaidRoute>["pulls"][number]) {
  return pull.enemies.reduce((total, enemy) => total + enemy.count, 0);
}

function abilityHref(ability: RaidRouteAbility) {
  return `https://www.wowhead.com/spell=${ability.spellId}`;
}

export function RaidRoutePlanner({
  raid,
  locale,
  selectedBossIndex,
  onSelectBoss,
}: {
  raid: RaidDefinition;
  locale: "ru" | "en";
  selectedBossIndex: number;
  onSelectBoss: (index: number) => void;
}) {
  const route = getMidnightRaidRoute(raid.slug);
  const [selectedPullId, setSelectedPullId] = useState(route.pulls[0]?.id ?? "");
  const selectedPull = route.pulls.find((pull) => pull.id === selectedPullId) ?? route.pulls[0];
  const [selectedAbilityId, setSelectedAbilityId] = useState(selectedPull?.abilities[0]?.spellId ?? 0);
  const activeAbility = selectedPull?.abilities.find((ability) => ability.spellId === selectedAbilityId) ?? selectedPull?.abilities[0];
  const activeIntel = activeAbility ? getRouteAbilityIntel(activeAbility.spellId) : undefined;
  const text = <T,>(ru: T, en: T) => locale === "ru" ? ru : en;
  const tr = (value: { ru: string; en: string }) => value[locale];

  if (!selectedPull) return null;

  function selectPull(pullId: string) {
    const nextPull = route.pulls.find((pull) => pull.id === pullId);
    setSelectedPullId(pullId);
    setSelectedAbilityId(nextPull?.abilities[0]?.spellId ?? 0);
  }

  return (
    <section className={styles.planner} data-testid="raid-route-planner">
      <header className={styles.header}>
        <div className={styles.titleLockup}>
          <span className={styles.seal}><Route aria-hidden="true" /></span>
          <div>
            <small>{text("Путь рейд-лида · 20 игроков", "Raid-lead route · 20 players")}</small>
            <h3>{text("Маршрут по рейду", "Full raid route")}</h3>
            <p>{text("Куда идти, какие группы забирать и что объявлять перед каждым пуллом.", "Where to go, which packs to pull, and what to call before each engagement.")}</p>
          </div>
        </div>
        <a href={route.source} target="_blank" rel="noreferrer" className={styles.source}>
          <CheckCircle2 aria-hidden="true" />
          <span>{text("Маршрут сверен", "Route verified")}</span>
          <ExternalLink aria-hidden="true" />
        </a>
      </header>

      <div className={styles.routeNote}>
        <AlertTriangle aria-hidden="true" />
        <p>{tr(route.note)}</p>
      </div>

      <div className={styles.layout}>
        <div className={styles.mapPanel}>
          <div className={styles.mapTopbar}>
            <span><MapPinned aria-hidden="true" />{text("Схема продвижения", "Progression map")}</span>
            <b>{route.pulls.length} {text(route.pulls.length === 1 ? "этап" : "пуллов", route.pulls.length === 1 ? "stage" : "pulls")}</b>
          </div>

          <div className={styles.map} style={{ "--route-art": `url(${raid.artwork})` } as CSSProperties}>
            <div className={styles.mapAtmosphere} aria-hidden="true" />
            <svg className={styles.routeLines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path className={styles.routeShadow} d={route.routePath} />
              <path className={styles.routeGlow} d={route.routePath} />
              {route.alternatePaths?.map((path) => <path key={path} className={styles.branchGlow} d={path} />)}
            </svg>

            <div className={styles.entrance} style={{ left: `${route.entrance.x}%`, top: `${route.entrance.y}%` }}>
              <Footprints aria-hidden="true" />
              <span>{text("Вход", "Entrance")}</span>
            </div>

            {route.bosses.map((node) => {
              const boss = raid.bosses[node.bossIndex];
              const active = selectedBossIndex === node.bossIndex;
              return (
                <button
                  key={boss.slug}
                  type="button"
                  className={styles.bossNode}
                  data-active={active}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onClick={() => onSelectBoss(node.bossIndex)}
                  aria-pressed={active}
                  aria-label={`${text("Открыть тактику", "Open strategy")}: ${tr({ ru: boss.nameRu, en: boss.nameEn })}`}
                >
                  <span className={styles.bossPortrait}><Image src={boss.artwork} alt="" fill sizes="54px" /></span>
                  <span className={styles.bossLabel}><small>{text("Босс", "Boss")} {node.bossIndex + 1}</small><b>{tr({ ru: boss.nameRu, en: boss.nameEn })}</b></span>
                </button>
              );
            })}

            {route.pulls.map((pull) => (
              <button
                key={pull.id}
                type="button"
                className={styles.pullMarker}
                data-active={pull.id === selectedPull.id}
                data-danger={pull.danger}
                style={{ left: `${pull.x}%`, top: `${pull.y}%` }}
                onClick={() => selectPull(pull.id)}
                aria-pressed={pull.id === selectedPull.id}
                aria-label={`${text("Пулл", "Pull")} ${pull.order}: ${tr(pull.title)}`}
              >
                <span>{pull.order}</span>
                <i />
              </button>
            ))}

            <div className={styles.mapLegend}>
              <span><i className={styles.legendRoute} />{text("путь", "route")}</span>
              <span><i className={styles.legendPull} />{text("пулл", "pull")}</span>
              <span><i className={styles.legendBoss} />{text("босс", "boss")}</span>
            </div>
          </div>
        </div>

        <aside className={styles.intel} key={selectedPull.id}>
          <header className={styles.pullHeader}>
            <span className={styles.pullNumber}>{String(selectedPull.order).padStart(2, "0")}</span>
            <div>
              <small>{text("Пулл", "Pull")} {selectedPull.order} · {tr(selectedPull.area)}</small>
              <h4>{tr(selectedPull.title)}</h4>
            </div>
            <span className={styles.risk} data-danger={selectedPull.danger}>{tr(dangerLabels[selectedPull.danger])}</span>
          </header>

          <div className={styles.pullStats}>
            <span><Users aria-hidden="true" /><b>{enemyCount(selectedPull)}</b><small>{text("врагов", "enemies")}</small></span>
            <span><Swords aria-hidden="true" /><b>{selectedPull.enemies.filter((enemy) => enemy.priority !== "normal").length}</b><small>{text("приоритетов", "priority targets")}</small></span>
            <span><Eye aria-hidden="true" /><b>{selectedPull.abilities.length}</b><small>{text("опасных спелов", "dangerous spells")}</small></span>
          </div>

          <article className={styles.movementCall}>
            <Footprints aria-hidden="true" />
            <div><small>{text("Куда идти и где остановиться", "Where to move and stop")}</small><p>{tr(selectedPull.direction)}</p></div>
          </article>

          <article className={styles.raidCall}>
            <Crosshair aria-hidden="true" />
            <div><small>{text("Команда рейд-лида", "Raid-lead call")}</small><p>{tr(selectedPull.call)}</p></div>
          </article>

          <section className={styles.enemies}>
            <header><span>{text("Кого пулить", "What to pull")}</span><b>{enemyCount(selectedPull)} {text("целей", "targets")}</b></header>
            {selectedPull.enemies.length ? (
              <ul>
                {selectedPull.enemies.map((enemy) => (
                  <li key={`${enemy.npcId}-${enemy.name.en}`} data-priority={enemy.priority}>
                    <span className={styles.enemyMark}>
                      {enemy.npcId && routeEnemyIcons[enemy.npcId]
                        ? <Image src={routeEnemyIcons[enemy.npcId]} alt="" fill sizes="30px" />
                        : enemy.priority === "critical" ? <Target aria-hidden="true" /> : <Swords aria-hidden="true" />}
                    </span>
                    <span className={styles.enemyName}><b>{tr(enemy.name)}</b><small>{tr(enemy.note)}</small></span>
                    <span className={styles.enemyCount}>×{enemy.count}</span>
                    {enemy.npcId ? <a href={`https://www.wowhead.com/npc=${enemy.npcId}`} target="_blank" rel="noreferrer" aria-label={`${tr(enemy.name)} · NPC ${enemy.npcId}`}><small>NPC</small>{enemy.npcId}<ExternalLink aria-hidden="true" /></a> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.noEnemies}><CheckCircle2 aria-hidden="true" /><span><b>{text("Обычных врагов нет", "No trash enemies")}</b><small>{text("От входа сразу к встрече с боссом.", "Go directly from the entrance to the boss encounter.")}</small></span></div>
            )}
          </section>

          <section className={styles.abilities}>
            <header><span>{text("Опасные заклинания", "Dangerous abilities")}</span><b>{text("Нажмите — что делать", "Select for response")}</b></header>
            {selectedPull.abilities.length ? (
              <>
                <div className={styles.abilityList}>
                  {selectedPull.abilities.map((ability) => {
                    const Icon = actionIcons[ability.action];
                    const intel = getRouteAbilityIntel(ability.spellId);
                    return (
                      <button key={ability.spellId} type="button" data-active={activeAbility?.spellId === ability.spellId} data-action={ability.action} onClick={() => setSelectedAbilityId(ability.spellId)} aria-pressed={activeAbility?.spellId === ability.spellId}>
                        <span className={styles.spellIcon}>
                          {intel ? <Image src={intel.icon} alt="" fill sizes="34px" /> : <Icon aria-hidden="true" />}
                          <i><Icon aria-hidden="true" /></i>
                        </span>
                        <span><small>{tr(actionLabels[ability.action])} · {intel ? tr(intel.caster) : `Spell ${ability.spellId}`}</small><b>{tr(ability.name)}</b></span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
                {activeAbility ? (
                  <div className={styles.abilityDetail} key={activeAbility.spellId} data-action={activeAbility.action}>
                    <header>
                      <span className={styles.spellIcon}>
                        {activeIntel
                          ? <Image src={activeIntel.icon} alt="" fill sizes="42px" />
                          : (() => { const Icon = actionIcons[activeAbility.action]; return <Icon aria-hidden="true" />; })()}
                      </span>
                      <div><small>{activeIntel ? tr(activeIntel.caster) : tr(actionLabels[activeAbility.action])} · Spell {activeAbility.spellId}</small><h5>{tr(activeAbility.name)}</h5></div>
                      <a href={abilityHref(activeAbility)} target="_blank" rel="noreferrer" aria-label={`Wowhead: ${tr(activeAbility.name)}`}><ExternalLink aria-hidden="true" /></a>
                    </header>
                    {activeIntel ? <span className={styles.counterBadge} data-counter={activeIntel.counter}><ShieldCheck aria-hidden="true" />{tr(counterLabels[activeIntel.counter])}</span> : null}
                    <p>{tr(activeAbility.effect)}</p>
                    {activeIntel ? (
                      <div className={styles.mechanicFacts}>
                        <article><Eye aria-hidden="true" /><span><small>{text("Как распознать и откуда удар", "Telegraph and hit shape")}</small><b>{tr(activeIntel.shape)}</b></span></article>
                        <article><ShieldCheck aria-hidden="true" /><span><small>{text("Можно ли прервать или заблокировать", "Can it be stopped or blocked?")}</small><b>{tr(activeIntel.control)}</b></span></article>
                      </div>
                    ) : null}
                    <div className={styles.requiredResponse}><Crosshair aria-hidden="true" /><span><small>{text("Короткая команда", "Short raid call")}</small><b>{tr(activeAbility.response)}</b></span></div>
                    {activeIntel ? (
                      <div className={styles.roleResponses}>
                        <article><Shield aria-hidden="true" /><span><small>{text("Танк", "Tank")}</small><b>{tr(activeIntel.tank)}</b></span></article>
                        <article><HeartPulse aria-hidden="true" /><span><small>{text("Лекарь", "Healer")}</small><b>{tr(activeIntel.healer)}</b></span></article>
                        <article><Swords aria-hidden="true" /><span><small>{text("Бойцы", "Damage")}</small><b>{tr(activeIntel.damage)}</b></span></article>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.noAbilities}><CheckCircle2 aria-hidden="true" />{text("До босса опасных кастов нет — подготовьте распределение групп.", "No dangerous trash casts before the boss; prepare group assignments.")}</div>
            )}
          </section>

          <section className={styles.sequence}>
            <header>{text("Порядок выполнения", "Execution order")}</header>
            <ol>{selectedPull.steps.map((step, index) => <li key={step.en}><span>{index + 1}</span><p>{tr(step)}</p></li>)}</ol>
          </section>

          <div className={styles.nextWaypoint}>
            <Route aria-hidden="true" />
            <span><small>{text("Следующая точка", "Next waypoint")}</small><b>{tr(selectedPull.next)}</b></span>
          </div>
        </aside>
      </div>

      <nav className={styles.pullRail} aria-label={text("Пуллы рейда", "Raid pulls")}>
        {route.pulls.map((pull) => (
          <button key={pull.id} type="button" aria-pressed={pull.id === selectedPull.id} onClick={() => selectPull(pull.id)}>
            <span>{String(pull.order).padStart(2, "0")}</span>
            <span><b>{tr(pull.title)}</b><small>{enemyCount(pull)} {text("врагов", "enemies")} · {tr(pull.area)}</small></span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </nav>
    </section>
  );
}
