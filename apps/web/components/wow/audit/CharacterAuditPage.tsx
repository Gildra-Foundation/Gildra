"use client";

import { type ComponentProps, type CSSProperties, type ReactNode, createContext, useContext, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { WarcraftTooltip as SharedWarcraftTooltip } from "./WarcraftTooltip";
import dynamic from "next/dynamic";
import { AlertTriangle, Check, Crosshair, Flame, Gauge, RefreshCw, Shield, Sparkles, Zap } from "lucide-react";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { MaterialButton, MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import {
  type AuditGearItem,
  type AuditGearQuality,
  type CharacterAuditSnapshot,
} from "@/lib/wow/characterAudit";
import { defaultTalentSpecTheme, getTalentSpecTheme } from "@/lib/talentSpecThemes";
import type { TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { DeferredMount } from "./DeferredMount";
import { CharacterBookNavigation } from "./CharacterBookNavigation";
const CharacterTalentSimulator = dynamic(() => import("./CharacterTalentSimulator").then((module) => module.CharacterTalentSimulator));
const GearFarmPlanner = dynamic(() => import("./GearFarmPlanner").then((module) => module.GearFarmPlanner));
const AuctionGearOptimizer = dynamic(() => import("./AuctionGearOptimizer").then((module) => module.AuctionGearOptimizer));
const CharacterHistory = dynamic(() => import("./CharacterHistory").then((module) => module.CharacterHistory));
const CharacterLogAnalysis = dynamic(() => import("./CharacterLogAnalysis").then((module) => module.CharacterLogAnalysis));
const RotationLabPage = dynamic(() => import("@/components/platform/rotation/RotationLabPage").then((module) => module.RotationLabPage));
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import type { RotationPreset, RotationSimulationResult } from "@/lib/platform/rotation/types";
import { buildRotationSpellbook } from "@/lib/platform/rotation/spellbook";
import { abilityIcon, talentAbilityIcon } from "@/lib/games/wow/assets";
import styles from "./characterAuditPage.module.css";
import atlas from "./characterAtlasProfile.module.css";
import armoryBook from "./characterArmorySpread.module.css";
import type { Lang } from "@/lib/i18n";
import { characterPageText } from "./characterPageCopy";

// Keep unfinished rotation and training tools off character pages until ready.
const characterRotationTrainingEnabled = false;

const CharacterBookTheme = createContext(false);
const CharacterPageLanguage = createContext<Lang>("ru");
const useCharacterText = () => characterPageText(useContext(CharacterPageLanguage));
function ModelLoading() { const tr = useCharacterText(); return <div className={styles.modelLoading}>{tr("Подготавливаем модель…")}</div>; }

const CharacterModelViewer = dynamic(
  () => import("./CharacterModelViewer").then((module) => module.CharacterModelViewer),
  { ssr: false, loading: ModelLoading },
);

/**
 * The gear slot the reader points at, kept outside page state: hovering an item
 * re-renders only the model viewer, not the talent, rotation and gear tools.
 */
function createSlotFocus() {
  let slot: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => slot,
    set(next: string | null) {
      if (next === slot) return;
      slot = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
type SlotFocus = ReturnType<typeof createSlotFocus>;

function FocusedModelViewer({ focus, ...props }: Omit<ComponentProps<typeof CharacterModelViewer>, "focusSlot"> & { focus: SlotFocus }) {
  const focusSlot = useSyncExternalStore(focus.subscribe, focus.get, () => null);
  return <CharacterModelViewer {...props} focusSlot={focusSlot} />;
}

const gearStateLabels = { optimal: "Оптимально", good: "Хорошо", issue: "Требует исправления", missing: "Не хватает улучшения" } as const;
const leftEquipmentSlots = new Set(["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS"]);
const leftEquipmentNames = new Set(["Голова", "Шея", "Плечи", "Спина", "Нагрудник", "Наручи", "Руки"]);
const weaponEquipmentSlots = new Set(["MAIN_HAND", "OFF_HAND", "RANGED"]);
const weaponEquipmentNames = new Set(["Основная рука", "Левая рука", "Дальний бой"]);
function splitEquipment(gear: AuditGearItem[]) {
  const left: AuditGearItem[] = [];
  const right: AuditGearItem[] = [];
  const weapons: AuditGearItem[] = [];
  for (const item of gear) {
    const slotType = item.slotType?.toUpperCase() ?? "";
    if (weaponEquipmentSlots.has(slotType) || weaponEquipmentNames.has(item.slot)) weapons.push(item);
    else if (leftEquipmentSlots.has(slotType) || leftEquipmentNames.has(item.slot)) left.push(item);
    else right.push(item);
  }
  weapons.sort((a, b) => Number((b.slotType ?? b.slot) === "MAIN_HAND" || b.slot === "Основная рука") - Number((a.slotType ?? a.slot) === "MAIN_HAND" || a.slot === "Основная рука"));
  return { left, right, weapons };
}
type CharacterRefreshPayload = { error?: string; reason?: string; snapshot?: CharacterAuditSnapshot; fingerprint?: string; refreshedAt?: string };
type CharacterRefreshState = { status: "idle" | "success" | "error"; code?: string; message?: string; retryAfter?: number };

/**
 * Body of a connected character's page (/wow/characters/[slug]) inside the Characters frame: the reference hero
 * (crumbs, class · spec, name, one painted action, item level and Mythic+ rating), then reference sections —
 * equipment, talents, combat logs, history — whose tools sit on the section's Frost plaques.
 */
export function CharacterAuditPage({ initialSnapshot, initialFingerprint, localePrefix, talentData = null, rotationPreset = null }: { initialSnapshot: CharacterAuditSnapshot; initialFingerprint?: string; localePrefix: "" | "/ru"; dataMode: "battle-net"; talentData?: TalentCalculatorData | null; rotationPreset?: RotationPreset | null }) {
  const lang: Lang = localePrefix === "/ru" ? "ru" : "en";
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const tr = characterPageText(lang);
  const initialTheme = getTalentSpecTheme(initialSnapshot.specialization.slug) ?? defaultTalentSpecTheme;
  const profileBuild = (talentData?.buildVersion || rotationPreset?.patch || "unknown").replace(/[^A-Za-z0-9._%:+-]/g, "-").slice(0, 64);
  const [snapshot, setSnapshot] = useState<CharacterAuditSnapshot>(initialSnapshot);
  const [selectedGear, setSelectedGear] = useState<AuditGearItem | null>(null);
  const [running, setRunning] = useState(false);
  const [talentScenario, setTalentScenario] = useState<TalentScenarioId>("mythic-plus");
  const [modelFocus] = useState(createSlotFocus);
  const [rotationTalentLoadout, setRotationTalentLoadout] = useState(initialSnapshot.activeTalentLoadout ?? "");
  const [rotationSimulation, setRotationSimulation] = useState<RotationSimulationResult | null>(null);
  const [snapshotKey, setSnapshotKey] = useState(`${initialFingerprint ?? "initial-profile"}:${profileBuild}`);
  const [refreshState, setRefreshState] = useState<CharacterRefreshState>({ status: "idle" });
  const syncRotationTalentLoadout = useCallback((candidate: string) => setRotationTalentLoadout(candidate), []);

  const resolvedRotationPreset = useMemo(() => rotationPreset ? {
    ...rotationPreset,
    abilities: rotationPreset.abilities.map((ability) => ({
      ...ability,
      iconUrl: abilityIcon(ability.id) || talentAbilityIcon(ability, talentData) || ability.iconUrl,
    })),
  } : null, [rotationPreset, talentData]);

  const rotationSpellbookAbilities = useMemo(() => buildRotationSpellbook({
    baseAbilities: resolvedRotationPreset?.abilities ?? [],
    talentData,
    talentLoadout: rotationTalentLoadout || snapshot.activeTalentLoadout || "",
  }), [resolvedRotationPreset?.abilities, rotationTalentLoadout, snapshot.activeTalentLoadout, talentData]);

  const theme = getTalentSpecTheme(snapshot.specialization.slug) ?? initialTheme;
  const equipment = useMemo(() => splitEquipment(snapshot.gear), [snapshot.gear]);
  const hasRotation = characterRotationTrainingEnabled && Boolean(resolvedRotationPreset);

  const toggleGearPin = (item: AuditGearItem) => setSelectedGear((current) => current?.slot === item.slot ? null : item);
  const refreshCharacter = async () => {
    if (running) return;
    setRunning(true);
    setRefreshState({ status: "idle" });
    try {
      const response = await fetch(`/api/wow/characters/${encodeURIComponent(snapshot.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: lang }),
      });
      const payload = await response.json() as CharacterRefreshPayload;
      if (payload.snapshot) {
        const specializationChanged = payload.snapshot.specialization.slug !== snapshot.specialization.slug
          || payload.snapshot.activeHeroTalentTreeId !== snapshot.activeHeroTalentTreeId;
        setSnapshot(payload.snapshot);
        setRotationTalentLoadout(payload.snapshot.activeTalentLoadout ?? "");
        if (payload.fingerprint) setSnapshotKey(`${payload.fingerprint}:${profileBuild}`);
        if (specializationChanged) {
          window.location.reload();
          return;
        }
      }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0) || undefined;
        const messages: Record<string, string> = {
          session_expired: tr("Сессия Battle.net истекла. Переподключите аккаунт и повторите обновление."),
          access_forbidden: tr("Battle.net не разрешил доступ к профилю. Переподключите аккаунт и проверьте разрешения."),
          character_not_found: tr("Персонаж больше не найден среди персонажей подключённого аккаунта."),
          incomplete_profile: payload.reason === "active_loadout_missing" ? tr("Battle.net обновил персонажа, но не отдал активный билд. Войдите в игру, переключите специализацию и выйдите из неё.") : tr("Battle.net вернул неполный профиль. Попробуйте снова после выхода персонажа из игры."),
          rate_limited: lang === "ru" ? `Battle.net временно ограничил запросы. Повторите примерно через ${retryAfter ?? 60} сек.` : `Battle.net rate limit reached. Try again in about ${retryAfter ?? 60} seconds.`,
          battle_net_unavailable: tr("Battle.net сейчас недоступен. Старые данные сохранены — попробуйте обновить позже."),
        };
        setRefreshState({ status: "error", code: payload.error, message: messages[payload.error ?? ""] ?? tr("Не удалось обновить профиль."), retryAfter });
        return;
      }
      setRefreshState({ status: "success", message: tr("Профиль обновлён. Старые результаты расчётов сброшены.") });
    } catch {
      setRefreshState({ status: "error", code: "network_error", message: tr("Нет связи с сервером Gildra. Текущие данные не изменены.") });
    } finally {
      setRunning(false);
    }
  };

  const gearItem = (item: AuditGearItem) => <GearItem key={item.slot} item={item} pinned={selectedGear?.slot === item.slot} hoverDisabled={selectedGear !== null && selectedGear.slot !== item.slot} onSelect={toggleGearPin} onHighlight={modelFocus.set} />;
  const reconnect = refreshState.code === "session_expired" || refreshState.code === "access_forbidden";

  return (
    <CharacterPageLanguage.Provider value={lang}><CharacterBookTheme.Provider value>
    <div
      className={`${styles.audit} ${atlas.page}`}
      id="audit-overview"
      tabIndex={-1}
      data-motif={theme.motif}
      data-profile-source="battle-net"
      data-character-workspace="live"
      data-character-atlas
      style={{
        "--spec-accent": theme.accent,
        "--spec-hot": theme.hot,
        "--spec-deep": theme.deep,
        "--spec-rgb": theme.accentRgb,
        "--spec-hot-rgb": theme.hotRgb,
        "--spec-ambient-rgb": theme.ambientRgb,
        "--tc-accent": theme.accent,
        "--tc-hot": theme.hot,
        "--tc-deep": theme.deep,
        "--tc-accent-rgb": theme.accentRgb,
        "--tc-hot-rgb": theme.hotRgb,
        "--tc-ambient-rgb": theme.ambientRgb,
      } as CSSProperties}
    >
      <div className={atlas.heroBlock} data-character-identity>
        <AtlasHero
          align="start"
          className={atlas.hero}
          breadcrumbs={[{ label: "World of Warcraft", href: `${localePrefix}/wow` }, { label: lang === "ru" ? "Персонажи" : "Characters", href: `${localePrefix}/wow/characters` }, { label: snapshot.character.name }]}
          breadcrumbsLabel={lang === "ru" ? "Навигационная цепочка" : "Breadcrumbs"}
          emblem={<img src={snapshot.specialization.iconUrl} alt="" />}
          eyebrow={snapshot.character.className}
          title={snapshot.character.name}
          lede={`${tr("Уровень")} ${snapshot.character.level} · ${snapshot.character.race} · ${snapshot.character.faction}`}
          actions={<div className={atlas.actions}>
            <MaterialButton kit={CHARACTERS_KIT} className={atlas.frostButton} fit="stack" variant="primary" onClick={() => void refreshCharacter()} disabled={running} aria-busy={running} icon={<RefreshCw aria-hidden="true" className={running ? styles.spin : undefined} />}>
              {running ? tr("Обновляем…") : tr("Обновить")}
            </MaterialButton>
          </div>}
        />
        <div className={atlas.facts}>
          <AtlasStats label={lang === "ru" ? "Сводка персонажа" : "Character summary"} items={[
            { value: snapshot.character.itemLevel.toLocaleString(locale), label: tr("Уровень предметов") },
            { value: snapshot.character.mythicRating.toLocaleString(locale, { maximumFractionDigits: 0 }), label: tr("Рейтинг Эпох+") },
          ]} />
        </div>
        {refreshState.status !== "idle" ? <section className={atlas.notice} data-status={refreshState.status} role={refreshState.status === "error" ? "alert" : "status"} aria-live="polite">
          {refreshState.status === "success" ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          <p><b>{refreshState.status === "success" ? tr("Данные обновлены") : tr("Обновление не завершено")}</b> {refreshState.message}</p>
          {refreshState.status === "error"
            ? reconnect || refreshState.code === "character_not_found"
              ? <MaterialLinkButton kit={CHARACTERS_KIT} className={atlas.frostButton} href={`${localePrefix}/wow/characters`}>{reconnect ? tr("Переподключить Battle.net") : tr("К списку персонажей")}</MaterialLinkButton>
              : <MaterialButton kit={CHARACTERS_KIT} className={atlas.frostButton} onClick={() => void refreshCharacter()} disabled={running}>{running ? tr("Обновляем…") : tr("Повторить")}</MaterialButton>
            : null}
        </section> : null}
      </div>

      <CharacterBookNavigation characterName={snapshot.character.name} hasRotation={hasRotation} lang={lang} />

      <div className={atlas.sections} data-character-sections>
        <AtlasSection id="chapter-armory" title={tr("Экипировка")} className={atlas.section}>
          <section className={`${styles.gearPanel} ${styles.realGearPanel} ${armoryBook.armory}`} id="audit-gear" data-character-equipment aria-label={tr("Экипировка")}>
            <EquipmentStatStrip stats={snapshot.combatStats} />
            <div className={`${styles.gearWorkbench} ${armoryBook.workbench}`}>
              <div className={`${styles.gearList} ${styles.gearListLeft}`}>{equipment.left.map(gearItem)}</div>
              <FocusedModelViewer lang={lang} appearance={snapshot.appearance} focus={modelFocus} characterName={snapshot.character.name} race={snapshot.character.race} specIcon={snapshot.specialization.iconUrl} accent={snapshot.specialization.accent} characterSlug={snapshot.slug} />
              <div className={`${styles.gearList} ${styles.gearListRight}`}>{equipment.right.map(gearItem)}</div>
              {equipment.weapons.length ? <div className={`${styles.weaponPair} ${armoryBook.weapons}`} data-weapon-count={equipment.weapons.length} data-armory-weapon-row aria-label={lang === "ru" ? `Комплект оружия специализации «${snapshot.specialization.specName}»` : `Weapons for ${snapshot.specialization.specName}`}><span className={`${styles.weaponPairLabel} ${armoryBook.weaponTitle}`}>{snapshot.specialization.resourceLabel === "Ярость" ? <Flame /> : <Sparkles />} {tr("Оружие")}</span>{equipment.weapons.map(gearItem)}</div> : null}
            </div>
          </section>
          <DeferredMount minHeight={420}>
            <div className={atlas.plaque}><GearFarmPlanner key={`farm:${snapshotKey}`} characterSlug={snapshot.slug} snapshotKey={snapshotKey} localePrefix={localePrefix} /></div>
            <div className={atlas.plaque}><AuctionGearOptimizer key={`auction:${snapshotKey}`} characterSlug={snapshot.slug} snapshotKey={snapshotKey} specializationSlug={snapshot.specialization.slug} localePrefix={localePrefix} /></div>
          </DeferredMount>
        </AtlasSection>

        <AtlasSection id="chapter-talents" title={tr("Таланты")} className={atlas.section}>
          <DeferredMount minHeight={620}><div className={atlas.plaque}><CharacterTalentSimulator data={talentData} characterSlug={snapshot.slug} specSlug={snapshot.specialization.slug} loadout={snapshot.activeTalentLoadout} baseStats={snapshot.combatStats} scenario={talentScenario} onScenarioChange={setTalentScenario} onCandidateLoadoutChange={syncRotationTalentLoadout} dataMode="battle-net" localePrefix={localePrefix} snapshotKey={snapshotKey} /></div></DeferredMount>
        </AtlasSection>

        {hasRotation && resolvedRotationPreset ? <AtlasSection id="chapter-rotation" title={tr("Ротация")} className={atlas.section}>
          <section className={styles.rotationEmbed} id="audit-rotation" aria-label={lang === "ru" ? "Тренер ротации персонажа" : "Character rotation trainer"}>
            <DeferredMount minHeight={760}><RotationLabPage key={`rotation-${snapshotKey}`} preset={resolvedRotationPreset} spellbookAbilities={rotationSpellbookAbilities} lang={lang} characterSlug={snapshot.slug} dataMode="battle-net" characterIdentity={{ name: snapshot.character.name, itemLevel: snapshot.character.itemLevel }} connectedTalentLoadout={rotationTalentLoadout} profileFingerprint={snapshotKey} onSimulationResult={setRotationSimulation} embedded /></DeferredMount>
          </section>
        </AtlasSection> : null}

        <AtlasSection id="chapter-logs" title={tr("Боевые логи")} className={atlas.section}>
          <DeferredMount minHeight={480}><div className={atlas.plaque}><CharacterLogAnalysis characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} localePrefix={localePrefix} simulation={rotationSimulation} abilities={resolvedRotationPreset?.abilities ?? []} /></div></DeferredMount>
        </AtlasSection>

        <AtlasSection id="chapter-history" title={tr("История расчётов")} className={atlas.section}>
          <DeferredMount minHeight={320}><div className={atlas.plaque}><CharacterHistory characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} fingerprint={snapshotKey} localePrefix={localePrefix} /></div></DeferredMount>
        </AtlasSection>
      </div>
    </div>
    </CharacterBookTheme.Provider></CharacterPageLanguage.Provider>
  );
}

function EquipmentStatStrip({ stats }: { stats?: CharacterAuditSnapshot["combatStats"] }) {
  const lang = useContext(CharacterPageLanguage);
  const tr = characterPageText(lang);
  const value = (stat: number | undefined) => typeof stat === "number" && Number.isFinite(stat) ? `${stat.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";
  const rows = [
    { label: tr("Критический удар"), value: value(stats?.crit), Icon: Crosshair },
    { label: tr("Скорость"), value: value(stats?.haste), Icon: Zap },
    { label: tr("Искусность"), value: value(stats?.mastery), Icon: Gauge },
    { label: tr("Универсальность"), value: value(stats?.versatility), Icon: Shield },
  ];
  return <div className={`${styles.equipmentStats} ${armoryBook.stats}`} data-armory-stats role="group" aria-label={tr("Боевые характеристики персонажа")}>{rows.map(({ label, value, Icon }) => <div className={armoryBook.statCell} key={label}><i aria-hidden="true"><Icon /></i><span><small>{label}</small><b>{value}</b></span></div>)}</div>;
}

const gearQualityTone: Record<AuditGearQuality, string> = {
  "Низкое качество": "poor",
  "Обычный": "common",
  "Необычный": "uncommon",
  "Редкий": "rare",
  "Эпический": "epic",
  "Легендарный": "legendary",
  "Артефакт": "artifact",
  "Наследуемый": "heirloom",
  "Неизвестное качество": "common",
};

function GearItem({ item, pinned, hoverDisabled, onSelect, onHighlight }: { item: AuditGearItem; pinned: boolean; hoverDisabled: boolean; onSelect: (item: AuditGearItem) => void; onHighlight: (slot: string | null) => void }) {
  const lang = useContext(CharacterPageLanguage);
  const tr = characterPageText(lang);
  const stateClass = styles[`gear${item.state[0].toUpperCase()}${item.state.slice(1)}` as keyof typeof styles];
  const weaponClass = weaponEquipmentSlots.has(item.slotType?.toUpperCase() ?? "") || weaponEquipmentNames.has(item.slot) ? styles.weaponItem : "";
  const iconTone = gearQualityTone[item.details.quality];
  return <WarcraftTooltip block pinned={pinned} hoverDisabled={hoverDisabled} onPinnedClose={() => onSelect(item)} content={<GearTooltipContent item={item} pinned={pinned} />}><button type="button" aria-pressed={pinned} aria-label={`${item.name}, ${tr("Уровень предмета")} ${item.itemLevel}. ${tr(gearStateLabels[item.state])}. ${pinned ? tr("Описание открыто") : tr("Открыть описание предмета")}`} data-quality={item.details.quality} className={`${styles.gearItem} ${stateClass} ${weaponClass} ${pinned ? styles.gearPinned : ""}`} onClick={() => onSelect(item)} onPointerEnter={() => onHighlight(item.slot)} onPointerLeave={() => onHighlight(null)} onFocus={() => onHighlight(item.slot)} onBlur={() => onHighlight(null)}><ItemIcon src={item.iconUrl} tone={iconTone} level={item.itemLevel} /><span className={styles.gearCopy}><small>{item.slot}</small><b>{item.name}</b><em className={styles.gearItemMeta}><strong>{item.itemLevel}</strong>{item.details.enchant ? <i data-active={item.details.enchant.active || undefined} title={item.details.enchant.active ? tr("Чары установлены") : tr("Чары отсутствуют")}>✦</i> : null}{item.details.sockets?.map((socket, index) => <i key={`${socket.gem}-${index}`} data-socket={socket.color} data-active={socket.filled || undefined} title={socket.gem} />)}</em></span>{item.state === "issue" || item.state === "missing" ? <AlertTriangle /> : null}</button></WarcraftTooltip>;
}

function WarcraftTooltip(props: { children: ReactNode; content: ReactNode; block?: boolean; pinned?: boolean; hoverDisabled?: boolean; onPinnedClose?: () => void }) {
  const locale = useContext(CharacterPageLanguage);
  const atlasScope = useContext(CharacterBookTheme);
  return <SharedWarcraftTooltip {...props} locale={locale} atlasScope={atlasScope} />;
}

function GearTooltipContent({ item, pinned = false }: { item: AuditGearItem; pinned?: boolean }) {
  const lang = useContext(CharacterPageLanguage);
  const tr = characterPageText(lang);
  const stateClass = styles[`tooltip${item.state[0].toUpperCase()}${item.state.slice(1)}` as keyof typeof styles];
  const details = item.details;
  return <div className={styles.gearTooltipContent}>
    <div className={styles.tooltipItemHeader} data-quality={details.quality}><ItemIcon src={item.iconUrl} tone={gearQualityTone[details.quality]} /><div><strong className={details.quality === "Легендарный" ? styles.legendaryName : undefined}>{item.name}</strong><small>{tr(details.quality)} · {details.category}</small></div></div>
    <div className={styles.tooltipLevel}>{tr("Уровень предмета")} <b>{item.itemLevel}</b></div>
    <div className={styles.tooltipBinding}>{details.binding}</div>
    {details.weapon ? <div className={styles.tooltipWeapon}><b>{details.weapon.damage}</b><span>{lang === "ru" ? "Скорость" : "Speed"} {details.weapon.speed}</span><small>{details.weapon.dps} {tr("ед. урона в секунду")}</small></div> : null}
    {details.armor || details.durability ? <div className={styles.tooltipUtility}>{details.armor ? <span>{details.armor}</span> : <span />}{details.durability ? <span>{tr("Прочность")} {details.durability}</span> : null}</div> : null}
    <div className={styles.tooltipStats}>
      {details.primary ? <b>{details.primary}</b> : null}
      {details.stamina ? <b>{details.stamina}</b> : null}
      {details.secondaries.map((stat) => <span key={stat.label}><em>{stat.value}</em> {stat.label}</span>)}
    </div>
    {details.enchant ? <div className={`${styles.tooltipEnchant} ${details.enchant.active ? styles.enchantActive : styles.enchantMissing}`}><small>{details.enchant.active ? tr("Чары") : tr("Нет чар")}</small><b>{details.enchant.name}</b><span>{details.enchant.effect}</span></div> : null}
    {details.sockets?.length ? <div className={styles.tooltipSockets}>{details.sockets.map((socket, index) => <div key={`${socket.gem}-${index}`} className={socket.filled ? styles.socketFilled : styles.socketEmpty}><i data-color={socket.color} /><span><b>{socket.gem}</b><small>{socket.effect}</small></span></div>)}</div> : null}
    {details.set ? <div className={styles.tooltipSet}><strong>{details.set.name} ({details.set.equipped}/{details.set.total})</strong>{details.set.bonuses.map((bonus) => <span key={bonus.pieces} data-active={bonus.active || undefined}>({bonus.pieces}) {tr("Комплект")}: {bonus.text}</span>)}</div> : null}
    <div className={styles.tooltipSource}><small>{tr("Источник")}</small><span>{details.source}</span>{details.sellPrice ? <em>{tr("Цена продажи")} · {details.sellPrice}</em> : null}</div>
    <div className={`${styles.tooltipAudit} ${stateClass}`}><span>{tr(gearStateLabels[item.state])}</span><b>{details.audit.impact}</b><small>{details.audit.nextStep}</small></div>
    <footer>{pinned ? tr("Закреплено · нажмите по иконке ещё раз, чтобы закрыть") : tr("Нажмите по иконке, чтобы закрепить")}</footer>
  </div>;
}

function ItemIcon({ src, tone = "epic", level }: { src?: string; tone?: string; level?: number }) {
  const toneClass = styles[`icon${tone[0].toUpperCase()}${tone.slice(1)}` as keyof typeof styles];
  return <i className={`${styles.itemIcon} ${toneClass}`}>{src ? <img src={src} alt="" /> : <b />}{level ? <small className={styles.itemIconLevel}>{level}</small> : null}</i>;
}

