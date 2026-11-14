"use client";

import { type CSSProperties, type ReactNode, Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { AtlasStats } from "@gildra/atlas-ui/AtlasStats";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import { MaterialButton, MaterialLinkButton, MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import type { CharacterAuditSnapshot } from "@/lib/wow/characterAudit";
import { defaultTalentSpecTheme, getTalentSpecTheme } from "@/lib/talentSpecThemes";
import type { TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import type { RotationPreset } from "@/lib/platform/rotation/types";
import { abilityIcon, talentAbilityIcon } from "@/lib/games/wow/assets";
import type { Lang } from "@/lib/i18n";
import { CharacterEquipment } from "./CharacterEquipment";
import { CharacterUpgradesSkeleton } from "./CharacterUpgradesSkeleton";
import { characterPageCopy } from "./characterPageCopy";
import styles from "./characterProfile.module.css";

const CharacterTalentSimulator = dynamic(() => import("./CharacterTalentSimulator").then((module) => module.CharacterTalentSimulator));
const CharacterUpgrades = dynamic(() => import("./CharacterUpgrades").then((module) => module.CharacterUpgrades), { loading: () => <CharacterUpgradesSkeleton plaqueClassName={styles.tool} /> });
const CharacterLogAnalysis = dynamic(() => import("./CharacterLogAnalysis").then((module) => module.CharacterLogAnalysis));
const CharacterHistory = dynamic(() => import("./CharacterHistory").then((module) => module.CharacterHistory));

/** The modules of the tools above: warmed in idle time, a tab opens without waiting for the network. */
const preloadTools = () => Promise.all([
  import("./CharacterTalentSimulator"),
  import("./CharacterUpgrades"),
  import("./CharacterLogAnalysis"),
  import("./CharacterHistory"),
]).catch(() => undefined);

const tabIds = ["talents", "upgrades", "logs", "history"] as const;
type TabId = typeof tabIds[number];
/** Older links pointed at the chapters of the former single-scroll page. */
const legacyAnchors: Record<string, TabId> = { "chapter-talents": "talents", "chapter-logs": "logs", "chapter-history": "history" };
const tabFromHash = (hash: string): TabId | null => {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return (tabIds as readonly string[]).includes(id) ? id as TabId : legacyAnchors[id] ?? null;
};

type RefreshPayload = { error?: string; reason?: string; snapshot?: CharacterAuditSnapshot; fingerprint?: string };
type RefreshState = { status: "idle" | "success" | "error"; code?: string; message?: string };

/**
 * A connected character's page (/wow/characters/[slug]) inside the Characters frame: the hero (portrait, name,
 * class and specialization, level, race and realm, item level and Mythic+ rating, refresh), the equipment, then
 * the character's tools in tabs. Tools mount the first time their tab opens.
 */
export function CharacterAuditPage({ initialSnapshot, initialFingerprint, localePrefix, talentData = null, rotationPreset = null }: { initialSnapshot: CharacterAuditSnapshot; initialFingerprint?: string; localePrefix: "" | "/ru"; dataMode: "battle-net"; talentData?: TalentCalculatorData | null; rotationPreset?: RotationPreset | null }) {
  const lang: Lang = localePrefix === "/ru" ? "ru" : "en";
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const copy = characterPageCopy(lang);
  const profileBuild = (talentData?.buildVersion || rotationPreset?.patch || "unknown").replace(/[^A-Za-z0-9._%:+-]/g, "-").slice(0, 64);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [snapshotKey, setSnapshotKey] = useState(`${initialFingerprint ?? "initial-profile"}:${profileBuild}`);
  const [running, setRunning] = useState(false);
  const [refresh, setRefresh] = useState<RefreshState>({ status: "idle" });
  const [talentScenario, setTalentScenario] = useState<TalentScenarioId>("mythic-plus");
  const logAbilities = useMemo(() => rotationPreset?.abilities.map((ability) => ({
    ...ability,
    iconUrl: abilityIcon(ability.id) || talentAbilityIcon(ability, talentData) || ability.iconUrl,
  })) ?? [], [rotationPreset, talentData]);

  const theme = getTalentSpecTheme(snapshot.specialization.slug) ?? defaultTalentSpecTheme;
  const { character } = snapshot;

  const refreshCharacter = async () => {
    if (running) return;
    setRunning(true);
    setRefresh({ status: "idle" });
    try {
      const response = await fetch(`/api/wow/characters/${encodeURIComponent(snapshot.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: lang }),
      });
      const payload = await response.json() as RefreshPayload;
      if (payload.snapshot) {
        const specializationChanged = payload.snapshot.specialization.slug !== snapshot.specialization.slug
          || payload.snapshot.activeHeroTalentTreeId !== snapshot.activeHeroTalentTreeId;
        setSnapshot(payload.snapshot);
        if (payload.fingerprint) setSnapshotKey(`${payload.fingerprint}:${profileBuild}`);
        // Talent data is loaded on the server per specialization and hero tree.
        if (specializationChanged) {
          window.location.reload();
          return;
        }
      }
      if (!response.ok) {
        const code = payload.error ?? "";
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0) || 60;
        const message = code === "rate_limited" ? copy.rateLimited(retryAfter)
          : code === "incomplete_profile" && payload.reason === "active_loadout_missing" ? copy.errors.active_loadout_missing
            : copy.errors[code as keyof typeof copy.errors] ?? copy.refreshFailed;
        setRefresh({ status: "error", code, message });
        return;
      }
      setRefresh({ status: "success", message: copy.refreshed });
    } catch {
      setRefresh({ status: "error", code: "network_error", message: copy.errors.network_error });
    } finally {
      setRunning(false);
    }
  };
  const reconnect = refresh.code === "session_expired" || refresh.code === "access_forbidden";

  const tools: Record<TabId, () => ReactNode> = {
    talents: () => <MaterialPlaque kit={CHARACTERS_KIT} className={styles.tool}><CharacterTalentSimulator data={talentData} characterSlug={snapshot.slug} specSlug={snapshot.specialization.slug} loadout={snapshot.activeTalentLoadout} baseStats={snapshot.combatStats} scenario={talentScenario} onScenarioChange={setTalentScenario} dataMode="battle-net" localePrefix={localePrefix} snapshotKey={snapshotKey} /></MaterialPlaque>,
    upgrades: () => <CharacterUpgrades key={snapshotKey} snapshot={snapshot} snapshotKey={snapshotKey} localePrefix={localePrefix} plaqueClassName={styles.tool} />,
    logs: () => <MaterialPlaque kit={CHARACTERS_KIT} className={styles.tool}><CharacterLogAnalysis characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} localePrefix={localePrefix} simulation={null} abilities={logAbilities} /></MaterialPlaque>,
    history: () => <MaterialPlaque kit={CHARACTERS_KIT} className={styles.tool}><CharacterHistory characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} fingerprint={snapshotKey} localePrefix={localePrefix} /></MaterialPlaque>,
  };
  const tabLabels: Record<TabId, string> = { talents: copy.talents, upgrades: copy.upgrades, logs: copy.logs, history: copy.history };

  return (
    <div
      className={styles.page}
      data-character-atlas
      data-profile-source="battle-net"
      data-character-workspace="live"
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
      <div className={styles.heroBlock} data-character-identity>
        <AtlasHero
          align="start"
          className={styles.hero}
          breadcrumbs={[{ label: "World of Warcraft", href: localePrefix || "/" }, { label: copy.characters, href: `${localePrefix}/wow/characters` }, { label: character.name }]}
          breadcrumbsLabel={copy.breadcrumbs}
          emblem={<img src={snapshot.media?.avatar ?? snapshot.specialization.iconUrl} alt="" decoding="async" />}
          eyebrow={character.className}
          title={character.name}
          lede={[`${copy.level} ${character.level}`, character.race, character.realm ?? character.faction].filter(Boolean).join(" · ")}
          actions={<MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" onClick={() => void refreshCharacter()} disabled={running} aria-busy={running} icon={<RefreshCw aria-hidden="true" className={running ? styles.spin : undefined} />}>
            {running ? copy.refreshing : copy.refresh}
          </MaterialButton>}
        />
        <AtlasStats className={styles.facts} label={copy.summary} items={[
          { value: character.itemLevel.toLocaleString(locale), label: copy.itemLevel },
          ...character.mythicRating > 0 ? [{ value: character.mythicRating.toLocaleString(locale, { maximumFractionDigits: 0 }), label: copy.mythicRating }] : [],
        ]} />
        {refresh.status !== "idle" ? <div className={styles.notice} data-status={refresh.status} role={refresh.status === "error" ? "alert" : "status"}>
          {refresh.status === "success" ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          <p>{refresh.message}</p>
          {refresh.status === "error"
            ? reconnect || refresh.code === "character_not_found"
              ? <MaterialLinkButton kit={CHARACTERS_KIT} href={`${localePrefix}/wow/characters`}>{reconnect ? copy.reconnect : copy.backToRoster}</MaterialLinkButton>
              : <MaterialButton kit={CHARACTERS_KIT} onClick={() => void refreshCharacter()} disabled={running}>{copy.retry}</MaterialButton>
            : null}
        </div> : null}
      </div>

      <CharacterEquipment key={snapshotKey} snapshot={snapshot} lang={lang} />

      <CharacterTools label={copy.tools} labels={tabLabels} panels={{ talents: tools.talents(), upgrades: tools.upgrades(), logs: tools.logs(), history: tools.history() }} />
    </div>
  );
}

/**
 * The tool tabs. The tab state lives here, so a switch re-renders only the tab list: the panels
 * arrive as ready elements and React skips them. A tool mounts the first time its tab opens, in a
 * transition behind the moved marker; the area keeps its height until the new panel settles.
 */
function CharacterTools({ label, labels, panels }: { label: string; labels: Record<TabId, string>; panels: Record<TabId, ReactNode> }) {
  const [tab, setTab] = useState<TabId>("talents");
  const [opened, setOpened] = useState<ReadonlySet<TabId>>(() => new Set(["talents"]));
  const sectionRef = useRef<HTMLElement>(null);
  const releaseHold = useRef<() => void>(undefined);

  const holdHeight = useCallback(() => {
    const section = sectionRef.current;
    if (!section || typeof ResizeObserver === "undefined") return;
    releaseHold.current?.();
    section.style.minHeight = `${section.getBoundingClientRect().height}px`;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(settle);
      clearTimeout(limit);
      observer.disconnect();
      section.style.minHeight = "";
      releaseHold.current = undefined;
    };
    const observer = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(release, 450);
    });
    const limit = setTimeout(release, 2500);
    // The panel that is about to show: its content grows inside the held area.
    observer.observe(section.querySelector("[role=tablist]")?.parentElement ?? section);
    releaseHold.current = release;
  }, []);

  const tabRef = useRef<TabId>("talents");
  const openTab = useCallback((id: TabId) => {
    if (tabRef.current !== id) holdHeight();
    tabRef.current = id;
    setTab(id);
    startTransition(() => setOpened((current) => current.has(id) ? current : new Set([...current, id])));
  }, [holdHeight]);

  useEffect(() => {
    const fromHash = () => {
      const id = tabFromHash(window.location.hash);
      if (!id) return;
      openTab(id);
      document.getElementById("character-tools")?.scrollIntoView({ block: "start" });
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [openTab]);

  useEffect(() => {
    const warm = () => void preloadTools();
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle ? window.requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2500);
    return () => {
      if (idle) window.cancelIdleCallback(handle as number);
      else clearTimeout(handle);
      releaseHold.current?.();
    };
  }, []);

  const selectTab = (id: string) => {
    if (!(tabIds as readonly string[]).includes(id)) return;
    openTab(id as TabId);
    window.history.replaceState(window.history.state, "", `#${id}`);
  };

  return (
    <section ref={sectionRef} id="character-tools" className={styles.tools} aria-label={label} onPointerEnter={() => void preloadTools()} onFocus={() => void preloadTools()}>
      <AtlasTabs
        label={label}
        value={tab}
        onChange={selectTab}
        className={styles.tabs}
        tabs={tabIds.map((id) => ({
          id,
          label: labels[id],
          content: <div className={styles.panel} data-tool-panel={id}>
            {opened.has(id) ? <Suspense fallback={<div className={styles.pending} />}>{panels[id]}</Suspense> : <div className={styles.pending} />}
          </div>,
        }))}
      />
    </section>
  );
}
