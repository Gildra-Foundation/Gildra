"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, CircleDot, ClipboardCopy, Crosshair, Droplets, Eye, Flame, Leaf, Link2, PawPrint, Plus, RotateCcw, Save, Search, Share2, Shield, Skull, Snowflake, Sparkles, Sun, Swords, Trash2, Undo2, Upload, Waves, X, Zap } from "lucide-react";
import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type { PvPTalent, TalentCalculatorData, TalentKind, TalentNode } from "@/lib/talentCalculatorData";
import { talentSpecThemes, type TalentSpecTheme } from "@/lib/talentSpecThemes";
import { pvpVisualTheme } from "@/lib/talentVisualTheme";
import { encodeWoWTalentLoadout, FURY_REFERENCE_LOADOUT, decodeWoWTalentLoadout, TALENT_HANDOFF_STORAGE_KEY, talentPointBudgets } from "@/lib/wowTalentLoadout";
import {
  buildSearchParams, countRanks, countRanksByTree, createTalentNodeCatalog, decodeLoadout, emptyLoadout, encodeLoadout, freeTalentRanks, kindOfNode,
  EMPTY_PVP, loadoutFromSearch, nodeAvailability, parseBuildInput, removeInvalidDependents, sanitizeLoadout, TALENT_KINDS, treeGeometry,
  type ChoiceMap, type ImportResult, type PvpSlots, type RankMap, type SanitizedLoadout,
} from "@/lib/talentLoadoutState";
import { SpecMenu } from "@/components/talents/SpecMenuLazy";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { TalentTree, type PointerKind, type TalentTreeActions } from "@/components/talents/TalentTree";
import { TalentCardBody, TalentSheet, TalentTip, type TalentTipHandle } from "@/components/talents/TalentCard";
import { TalentHero } from "@/components/talents/TalentHero";
import page from "@/components/talents/talentAtlasPage.module.css";
import treeStyles from "@/components/talents/talentTree.module.css";
import { MaterialButton, MaterialPlaque, materialPlaqueStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import { TalentDescription } from "@/components/talents/TalentDescription";
import { getPerformanceTier, type PerformanceTier } from "@/lib/client/performanceTier";
import { heroPathName, talentCalculatorCopy, talentThemeNames, type TalentCalculatorCopy, type TalentCopyLang } from "@/components/talents/talentCalculatorCopy";
import { lessMotion } from "@/lib/client/motionPreference";
import type { PopularBuild } from "@/lib/talentPopularBuilds";
import { copyText as copyToClipboard } from "@gildra/atlas-ui/clipboard";

type Notice = { message: string; persistent?: boolean } | null;
type ImportState = { kind: "idle" } | ImportResult;


function scheduleWhenIdle(callback: () => void, timeout: number) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 250);
  return () => window.clearTimeout(handle);
}

function mapsHaveSameValues<K, V>(left: ReadonlyMap<K, V>, right: ReadonlyMap<K, V>) {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (!right.has(key) || !Object.is(right.get(key), value)) return false;
  return true;
}

type SavedTalentBuild = { id: string; name: string; loadout: string; savedAt: string; buildVersion: string };

function sameSavedBuilds(left: SavedTalentBuild[], right: SavedTalentBuild[]) {
  return left.length === right.length && left.every((build, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && build.id === candidate.id
      && build.name === candidate.name
      && build.loadout === candidate.loadout
      && build.savedAt === candidate.savedAt
      && build.buildVersion === candidate.buildVersion;
  });
}

const TALENT_SAVED_BUILD_STORAGE_KEY = "gildra:talents:saved-build:v1";
const TALENT_BUILD_LIBRARY_STORAGE_KEY = "gildra:talents:build-library:v2";
const TALENT_ACTIVE_BUILD_STORAGE_KEY = "gildra:talents:active-build:v2";
const UNVERIFIED_ICON_URL = "/assets/wow/icon-unverified.svg";

const buildLibraryKey = (specSlug: string) => `${TALENT_BUILD_LIBRARY_STORAGE_KEY}:${specSlug}`;
const activeBuildKey = (specSlug: string) => `${TALENT_ACTIVE_BUILD_STORAGE_KEY}:${specSlug}`;

function createBuildId(specSlug: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${specSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readBuildLibrary(specSlug: string, defaultName: string): SavedTalentBuild[] {
  try {
    const raw = window.localStorage.getItem(buildLibraryKey(specSlug));
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.filter((build): build is SavedTalentBuild => Boolean(build && typeof build.id === "string" && typeof build.name === "string" && typeof build.loadout === "string" && typeof build.savedAt === "string" && typeof build.buildVersion === "string")).slice(0, 24);
    if (specSlug !== "fury-warrior") return [];
    const legacyRaw = window.localStorage.getItem(TALENT_SAVED_BUILD_STORAGE_KEY);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as { name?: unknown; loadout?: unknown; savedAt?: unknown; buildVersion?: unknown };
    if (typeof legacy.loadout !== "string") return [];
    const migrated: SavedTalentBuild = {
      id: createBuildId(specSlug),
      name: typeof legacy.name === "string" && legacy.name.trim() ? legacy.name.trim().slice(0, 48) : defaultName,
      loadout: legacy.loadout,
      savedAt: typeof legacy.savedAt === "string" ? legacy.savedAt : new Date().toISOString(),
      buildVersion: typeof legacy.buildVersion === "string" ? legacy.buildVersion : "legacy",
    };
    window.localStorage.setItem(buildLibraryKey(specSlug), JSON.stringify([migrated]));
    window.localStorage.setItem(activeBuildKey(specSlug), migrated.id);
    return [migrated];
  } catch {
    return [];
  }
}

function readActiveBuildId(specSlug: string) {
  try { return window.localStorage.getItem(activeBuildKey(specSlug)); }
  catch { return null; }
}


const furyEffectPalette: Record<string, { core: string; hot: string }> = {
  blood: { core: "#bd1717", hot: "#ff6b45" },
  steel: { core: "#b8aa97", hot: "#fff2d8" },
  fury: { core: "#e52e19", hot: "#ff9a45" },
  fire: { core: "#f04b1f", hot: "#ffd064" },
  storm: { core: "#e87b35", hot: "#fff1b8" },
  charge: { core: "#d84a25", hot: "#ffbb70" },
  guard: { core: "#9b8870", hot: "#f5d6a2" },
  warcry: { core: "#d92f1d", hot: "#ffcb82" },
};


function playPvpBurst(target: HTMLButtonElement, action: "equip" | "remove" = "equip") {
  if (lessMotion()) return;
  const performanceTier = getPerformanceTier();
  const root = target.closest<HTMLElement>(".talent-calculator");
  const sigil = target.querySelector<SVGElement>(".tc-node-sigil");
  const icon = target.querySelector<HTMLElement>("img");
  const theme = target.dataset.pvpTheme || "fury";
  const fallbackPalette = furyEffectPalette[theme] || furyEffectPalette.fury;
  const rootStyle = root ? getComputedStyle(root) : null;
  const palette = {
    core: rootStyle?.getPropertyValue("--tc-accent").trim() || fallbackPalette.core,
    hot: rootStyle?.getPropertyValue("--tc-hot").trim() || fallbackPalette.hot,
  };
  const rect = target.getBoundingClientRect();
  const originX = Math.max(80, Math.min(window.innerWidth - 80, rect.left + rect.width / 2));
  const originY = Math.max(80, Math.min(window.innerHeight - 80, rect.top + rect.height / 2));
  const direction = action === "remove" ? -1 : 1;

  target.getAnimations().forEach((animation) => animation.cancel());
  target.animate([
    { transform: "translateY(0) scale(1) rotate(0deg)" },
    { transform: `translateY(${direction * -3}px) scale(${action === "equip" ? 1.24 : 0.82}) rotate(${direction * -4}deg)`, offset: 0.34 },
    { transform: "translateY(0) scale(1.04) rotate(2deg)", offset: 0.68 },
    { transform: "translateY(0) scale(1) rotate(0deg)" },
  ], { duration: 430, easing: "cubic-bezier(.12,.82,.2,1)", composite: "replace" });
  if (performanceTier === "minimal") return;
  icon?.animate(action === "equip" ? [
    { filter: "brightness(.7) saturate(.8)", transform: "scale(.72)" },
    { filter: "brightness(1.75) saturate(1.55)", transform: "scale(1.18)", offset: 0.42 },
    { filter: "brightness(1) saturate(1)", transform: "scale(1)" },
  ] : [
    { filter: "brightness(1) saturate(1)", opacity: 1, transform: "scale(1)" },
    { filter: "brightness(1.8) saturate(.2)", opacity: 0, transform: "scale(.62) rotate(-9deg)" },
  ], { duration: 390, easing: "cubic-bezier(.16,.8,.2,1)", composite: "replace" });
  sigil?.animate([
    { opacity: 0.24, transform: "rotate(var(--tc-sigil-rotation)) scale(.55)" },
    { opacity: 1, transform: `rotate(calc(var(--tc-sigil-rotation) + ${direction * 54}deg)) scale(1.58)`, offset: 0.42 },
    { opacity: action === "equip" ? 0.76 : 0, transform: "rotate(var(--tc-sigil-rotation)) scale(1)" },
  ], { duration: 560, easing: "cubic-bezier(.12,.82,.2,1)", composite: "replace" });

  if (!root) return;
  const shock = document.createElement("span");
  shock.className = `tc-pvp-shock tc-pvp-shock-${theme}${action === "remove" ? " is-remove" : ""}`;
  shock.style.left = `${originX}px`;
  shock.style.top = `${originY}px`;
  shock.style.setProperty("--tc-impact-core", palette.core);
  shock.style.setProperty("--tc-impact-hot", palette.hot);
  root.appendChild(shock);
  const effects: Animation[] = [shock.animate([
    { opacity: 0.16, transform: "translate(-50%,-50%) scale(.18)" },
    { opacity: 1, transform: "translate(-50%,-50%) scale(.82)", offset: 0.3 },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.46)" },
  ], { duration: 610, easing: "cubic-bezier(.12,.76,.18,1)" })];

  if (performanceTier === "full" && sigil) {
    const impactSigil = sigil.cloneNode(true) as SVGElement;
    impactSigil.classList.remove("tc-node-sigil");
    impactSigil.classList.add("tc-pvp-impact-sigil");
    impactSigil.style.left = `${originX}px`;
    impactSigil.style.top = `${originY}px`;
    impactSigil.style.setProperty("--tc-impact-core", palette.core);
    impactSigil.style.setProperty("--tc-impact-hot", palette.hot);
    root.appendChild(impactSigil);
    const rotation = Number.parseFloat(getComputedStyle(sigil).getPropertyValue("--tc-sigil-rotation")) || 0;
    const animation = impactSigil.animate([
      { opacity: 0.12, transform: `translate(-50%,-50%) rotate(${rotation}deg) scale(.28)` },
      { opacity: 1, transform: `translate(-50%,-50%) rotate(${rotation + direction * 82}deg) scale(1.08)`, offset: 0.38 },
      { opacity: 0, transform: `translate(-50%,-50%) rotate(${rotation + direction * 118}deg) scale(1.52)` },
    ], { duration: 650, easing: "cubic-bezier(.12,.78,.18,1)" });
    effects.push(animation);
    animation.finished.finally(() => impactSigil.remove());
  }

  const particleTotal = performanceTier === "full" ? 10 : 4;
  for (let index = 0; index < particleTotal; index += 1) {
    const particle = document.createElement("i");
    const angle = ((index * 36 + Number(target.dataset.pvpId || 0) % 31) * Math.PI) / 180;
    const distance = 38 + (index % 3) * 9;
    shock.appendChild(particle);
    effects.push(particle.animate([
      { opacity: 0.2, transform: "translate(-50%,-50%) scale(.2)" },
      { opacity: 1, offset: 0.18 },
      { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px),calc(-50% + ${Math.sin(angle) * distance}px)) scale(.3) rotate(${Math.round(angle * 180 / Math.PI)}deg)` },
    ], { duration: 420 + (index % 3) * 45, delay: index * 7, easing: "cubic-bezier(.14,.72,.2,1)" }));
  }
  Promise.allSettled(effects.map((animation) => animation.finished)).finally(() => shock.remove());
}


type TalentVisual = ReturnType<typeof pvpVisualTheme>;

function TalentSigil({ visual }: { visual: TalentVisual }) {
  return (
    <svg
      className={`tc-node-sigil tc-sigil-${visual.asset}`}
      data-vfx-asset={visual.assetId}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{
        "--tc-sigil-rotation": `${visual.sigilRotation}deg`,
        "--tc-sigil-dash": visual.sigilDash,
      } as CSSProperties}
    >
      <path className="tc-sigil-orbit" d={visual.sigilPath} />
      <path className="tc-sigil-mark" d={visual.assetMark} />
    </svg>
  );
}


function ResourceGlyph({ motif }: { motif: TalentSpecTheme["motif"] }) {
  const Icon = motif === "frost" ? Snowflake
    : motif === "blood" ? Droplets
      : ["plague", "decay", "poison"].includes(motif) ? Skull
        : ["storm", "spirit", "wind"].includes(motif) ? Zap
          : ["tide", "mist", "brew"].includes(motif) ? Waves
            : ["astral", "dream", "time", "arcane"].includes(motif) ? Sparkles
              : ["shadow", "void", "abyss", "demon", "vengeance"].includes(motif) ? Eye
                : ["shield", "bulwark"].includes(motif) ? Shield
                  : ["beast", "wild"].includes(motif) ? PawPrint
                    : motif === "nature" ? Leaf
                      : motif === "marksman" ? Crosshair
                        : ["fury", "steel", "spear", "pirate"].includes(motif) ? Swords
                          : ["holy", "sun", "judgment", "atonement"].includes(motif) ? Sun
                            : ["fire", "dragonfire", "chaos", "fel"].includes(motif) ? Flame
                              : CircleDot;
  return <Icon strokeWidth={1.7} />;
}

const TalentSearchField = memo(function TalentSearchField({ count, copy, onQueryChange }: { count: number; copy: TalentCalculatorCopy; onQueryChange: (value: string) => void }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      startTransition(() => onQueryChange(value));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [onQueryChange, value]);

  return <div className="tc-search" role="search"><label htmlFor="tc-search-input"><Search aria-hidden="true" /><span className="sr-only">{copy.searchTalents}</span></label><input id="tc-search-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder={copy.searchPlaceholder} />{value && <span className="tc-search-count" aria-live="polite">{count}</span>}{value && <button type="button" aria-label={copy.clearSearch} onClick={() => setValue("")}>×</button>}</div>;
});


function ErrorState({ theme, lang }: { theme: TalentSpecTheme; lang: TalentCopyLang }) {
  const copy = talentCalculatorCopy[lang];
  const names = talentThemeNames(theme, lang);
  return <main className={`talent-calculator tc-state ${page.page}`} lang={lang} data-atlas-scope="" data-talent-page="" data-spec={theme.slug} data-spec-motif={theme.motif}>
    <TalentHero theme={theme} lang={lang} />
    <MaterialPlaque kit={TALENTS_KIT} as="section" className={page.state} role="alert" aria-labelledby="tc-error-title">
      <h2 id="tc-error-title" className={materialStyles.title}>{copy.errorTitle(names.spec)}</h2>
      <p className={materialStyles.text}>{copy.errorBody}</p>
    </MaterialPlaque>
  </main>;
}

/** The build a page opens with: the URL, then (for the Rotation Lab hand-off) the reference build, then an empty tree. */
function initialLoadoutFor(data: TalentCalculatorData, params: URLSearchParams, isFury: boolean): SanitizedLoadout {
  const fromUrl = loadoutFromSearch(data, params);
  if (fromUrl.loadout) return fromUrl.loadout;
  if (isFury && params.has("returnTo")) {
    const reference = decodeWoWTalentLoadout(data, FURY_REFERENCE_LOADOUT);
    if (reference) return sanitizeLoadout(data, reference);
  }
  return emptyLoadout(data);
}

/** The part of a build one tree reads; keeps its identity while other trees change, so that tree skips rendering. */
function useSlice(source: Map<string, number>, keys: Set<string>) {
  let signature = "";
  for (const id of keys) { const value = source.get(id); if (value !== undefined) signature += `${id}:${value};`; }
  return useMemo(() => new Map(signature.split(";").filter(Boolean).map((entry) => {
    const separator = entry.lastIndexOf(":");
    return [entry.slice(0, separator), Number(entry.slice(separator + 1))] as const;
  })), [signature]);
}

const writeUrl = (url: URL) => window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

/**
 * `search` is the query the page was opened with (from the server). The calculator writes the build into the
 * address itself and does not subscribe to it, so editing never re-renders the page through the router.
 */
export function TalentCalculator({ data, theme, lang: langProp, search = "", builds }: { data: TalentCalculatorData | null; theme: TalentSpecTheme; lang?: TalentCopyLang; search?: string; builds?: PopularBuild[] }) {
  const router = useRouter();
  const [searchParams] = useState(() => new URLSearchParams(search));
  const pathname = usePathname();
  const lang: TalentCopyLang = langProp ?? (pathname.startsWith("/ru/") || pathname === "/ru" ? "ru" : "en");
  const localePrefix = lang === "ru" ? "/ru" : "";
  const copy = talentCalculatorCopy[lang];
  const names = talentThemeNames(theme, lang);
  const defaultBuildName = copy.defaultBuildName(names.spec);
  const isFury = theme.slug === "fury-warrior";
  const dataLoadoutKey = data ? `${data.specId}:${data.buildVersion}:${data.heroSubtreeId}` : "";
  const [initialLoadout] = useState<SanitizedLoadout>(() => data ? initialLoadoutFor(data, searchParams, isFury) : { ranks: new Map(), choices: new Map(), pvp: [null, null, null], adjusted: false });
  const [ranks, setRanks] = useState<RankMap>(() => new Map(initialLoadout.ranks));
  const [choices, setChoices] = useState<ChoiceMap>(() => new Map(initialLoadout.choices));
  const [pvpSelections, setPvpSelections] = useState<PvpSlots>(() => [...initialLoadout.pvp]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const updateTalentQuery = useCallback((value: string) => setQuery(value), []);
  const [mobileTree, setMobileTree] = useState<TalentKind>("class");
  const [compactLayout, setCompactLayout] = useState(false);
  const [mountedTrees, setMountedTrees] = useState<Set<TalentKind>>(() => new Set(["class"]));
  const [performanceTier, setPerformanceTier] = useState<PerformanceTier>("balanced");
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [buildName, setBuildName] = useState(defaultBuildName);
  const [savedBuilds, setSavedBuilds] = useState<SavedTalentBuild[]>([]);
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });
  const [undoState, setUndoState] = useState<{ ranks: RankMap; choices: ChoiceMap; pvp: PvpSlots } | null>(null);
  const [pvpPickerSlot, setPvpPickerSlot] = useState<number | null>(null);
  const [pvpQuery, setPvpQuery] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const tipRef = useRef<TalentTipHandle>(null);
  const loadoutMenuRef = useRef<HTMLDivElement>(null);
  const loadoutTriggerRef = useRef<HTMLButtonElement>(null);
  const importDialogRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<HTMLElement>(null);
  const pvpPickerRef = useRef<HTMLDivElement>(null);
  const pvpSlotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pvpReturnFocusRef = useRef<number | null>(null);
  const pendingPvpBurstRef = useRef<{ slot: number; action: "equip" | "remove" } | null>(null);
  const suppressPvpTooltipRef = useRef(false);
  const budgets = useMemo(() => data ? talentPointBudgets(data) : { class: 34, hero: 13, spec: 34 }, [data]);
  const nodeCatalog = useMemo(() => createTalentNodeCatalog(data), [data]);
  const nodeById = useMemo(() => new Map(data ? Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.id, node] as const)) : []), [data]);
  const geometry = useMemo(() => data ? { class: treeGeometry(data.trees.class), hero: treeGeometry(data.trees.hero), spec: treeGeometry(data.trees.spec) } : null, [data]);

  // The latest build for the stable tree handlers (they never change identity, so trees skip re-rendering).
  const live = useRef({ data, ranks, choices, pvp: pvpSelections, budgets, copy, nodeCatalog });
  useLayoutEffect(() => { live.current = { data, ranks, choices, pvp: pvpSelections, budgets, copy, nodeCatalog }; });

  // Per-tree slices of the state keep their identity while another tree changes.
  const treeStateKeys = useMemo(() => {
    const rankKeys = {} as Record<TalentKind, Set<string>>;
    const choiceKeys = {} as Record<TalentKind, Set<string>>;
    for (const kind of TALENT_KINDS) {
      const nodes = data?.trees[kind].nodes ?? [];
      const own = new Set(nodes.map((node) => node.id));
      const relevant = new Set(own);
      for (const node of nodes) for (const requirementId of node.requiresNodeIds) for (const dependency of nodeCatalog.get(requirementId) ?? []) relevant.add(dependency.id);
      rankKeys[kind] = relevant;
      choiceKeys[kind] = own;
    }
    return { rankKeys, choiceKeys };
  }, [data, nodeCatalog]);
  const slices = {
    ranks: { class: useSlice(ranks, treeStateKeys.rankKeys.class), hero: useSlice(ranks, treeStateKeys.rankKeys.hero), spec: useSlice(ranks, treeStateKeys.rankKeys.spec) },
    choices: { class: useSlice(choices, treeStateKeys.choiceKeys.class), hero: useSlice(choices, treeStateKeys.choiceKeys.hero), spec: useSlice(choices, treeStateKeys.choiceKeys.spec) },
  };

  const rankByTree = useMemo(() => data ? countRanksByTree(ranks, data) : { class: 0, hero: 0, spec: 0 }, [data, ranks]);
  const spent = rankByTree.class + rankByTree.hero + rankByTree.spec;
  const currentSignature = useMemo(() => encodeLoadout(ranks, choices, pvpSelections), [choices, pvpSelections, ranks]);
  const defaultReturnTo = `${localePrefix}/wow/rotation/${theme.slug}`;
  const returnToValue = searchParams.get("returnTo") ?? defaultReturnTo;
  const returnTo = new RegExp(`^/(?:ru/)?wow/rotation/${theme.slug}$`).test(returnToValue) ? returnToValue : defaultReturnTo;
  const rotationFlow = searchParams.has("returnTo");
  const closePvpPicker = useCallback(() => {
    if (pvpPickerSlot !== null) pvpReturnFocusRef.current = pvpPickerSlot;
    setPvpPickerSlot(null);
  }, [pvpPickerSlot]);
  const closeImport = useCallback(() => { setImportOpen(false); setImportState({ kind: "idle" }); }, []);
  const showNotice = useCallback((message: string, persistent = false) => setNotice({ message, persistent }), []);

  useEffect(() => {
    const calculator = calculatorRef.current;
    if (!calculator) return;
    calculator.dataset.interactive = "true";
    return () => { delete calculator.dataset.interactive; };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    let cancelMount: (() => void) | null = null;
    const mountRemainingTrees = () => {
      if (media.matches) return;
      cancelMount?.();
      // Build the other trees only after the browser has spare main-thread time.
      cancelMount = scheduleWhenIdle(() => {
        cancelMount = null;
        if (media.matches) return;
        startTransition(() => setMountedTrees((current) => current.has("hero") ? current : new Set<TalentKind>([...current, "hero"])));
      }, 1200);
    };
    const updateLayoutBudget = () => {
      const nextCompact = media.matches;
      const nextTier = getPerformanceTier();
      setCompactLayout((current) => current === nextCompact ? current : nextCompact);
      setPerformanceTier((current) => current === nextTier ? current : nextTier);
      if (nextCompact && cancelMount !== null) { cancelMount(); cancelMount = null; }
      if (!nextCompact) mountRemainingTrees();
    };
    const updateVisibility = () => { if (calculatorRef.current) calculatorRef.current.dataset.pageActive = document.hidden ? "false" : "true"; };
    updateLayoutBudget();
    updateVisibility();
    media.addEventListener("change", updateLayoutBudget);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      media.removeEventListener("change", updateLayoutBudget);
      document.removeEventListener("visibilitychange", updateVisibility);
      cancelMount?.();
    };
  }, []);

  useEffect(() => {
    if (compactLayout || !mountedTrees.has("hero") || mountedTrees.has("spec")) return;
    return scheduleWhenIdle(() => startTransition(() => setMountedTrees((current) => current.has("spec") ? current : new Set<TalentKind>([...current, "spec"]))), 1500);
  }, [compactLayout, mountedTrees]);

  useEffect(() => {
    if (!compactLayout || mountedTrees.has(mobileTree)) return;
    return scheduleWhenIdle(() => startTransition(() => setMountedTrees((current) => current.has(mobileTree) ? current : new Set<TalentKind>([...current, mobileTree]))), 120);
  }, [compactLayout, mobileTree, mountedTrees]);

  // Saved builds, and the build to open when the URL carries none (the last active one).
  useEffect(() => {
    const current = live.current.data;
    if (!dataLoadoutKey || !current) return;
    const applyUrlLoadout = () => {
      const params = new URLSearchParams(window.location.search);
      const library = readBuildLibrary(theme.slug, defaultBuildName);
      setSavedBuilds((previous) => sameSavedBuilds(previous, library) ? previous : library);
      const fromUrl = loadoutFromSearch(current, params);
      let next: SanitizedLoadout | null = fromUrl.loadout;
      if (fromUrl.source === "invalid") showNotice(copy.brokenLoadout(names.spec), true);
      else if (next?.adjusted) showNotice(copy.adjustedLink, true);
      if (!next && fromUrl.source === "none" && !(isFury && params.has("returnTo"))) {
        const stored = library.find((build) => build.id === readActiveBuildId(theme.slug)) ?? null;
        const decoded = stored ? decodeLoadout(stored.loadout) : null;
        if (decoded) next = sanitizeLoadout(current, decoded);
      }
      if (next) {
        const loadout = next;
        setRanks((previous) => mapsHaveSameValues(previous, loadout.ranks) ? previous : loadout.ranks);
        setChoices((previous) => mapsHaveSameValues(previous, loadout.choices) ? previous : loadout.choices);
        setPvpSelections((previous) => previous.every((id, index) => id === loadout.pvp[index]) ? previous : loadout.pvp);
      }
      const signature = next ? encodeLoadout(next.ranks, next.choices, next.pvp) : null;
      const matched = signature ? library.find((build) => build.loadout === signature) ?? null : null;
      setBuildName(matched?.name ?? defaultBuildName);
      setActiveBuildId(matched?.id ?? null);
      setSavedSignature(matched ? signature : null);
    };
    applyUrlLoadout();
    window.addEventListener("popstate", applyUrlLoadout);
    return () => window.removeEventListener("popstate", applyUrlLoadout);
  }, [copy, dataLoadoutKey, defaultBuildName, isFury, names.spec, showNotice, theme.slug]);

  // The address always describes the build on screen (?build=<in-game string>&pvp=…), so a copied URL shares it.
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      for (const key of ["build", "pvp", "loadout", "import"]) url.searchParams.delete(key);
      buildSearchParams(data, { ranks, choices, pvp: pvpSelections }).forEach((value, key) => url.searchParams.set(key, value));
      if (url.href !== window.location.href) writeUrl(url);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [choices, data, pvpSelections, ranks]);

  useEffect(() => {
    if (!loadoutOpen) return;
    const items = () => [...document.querySelectorAll<HTMLElement>('#tc-loadout-menu [role="menuitem"], #tc-loadout-menu input')];
    const focusItem = (index: number) => { const menuItems = items(); if (menuItems.length) menuItems[(index + menuItems.length) % menuItems.length]?.focus(); };
    const onKeyDown = (event: KeyboardEvent) => {
      const menuItems = items();
      const current = menuItems.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") { event.preventDefault(); setLoadoutOpen(false); loadoutTriggerRef.current?.focus(); }
      else if (event.key === "Tab") { event.preventDefault(); focusItem(current + (event.shiftKey ? -1 : 1)); }
      else if (document.activeElement instanceof HTMLInputElement) return;
      else if (event.key === "ArrowDown") { event.preventDefault(); focusItem(current + 1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); focusItem(current < 0 ? menuItems.length - 1 : current - 1); }
      else if (event.key === "Home") { event.preventDefault(); focusItem(0); }
      else if (event.key === "End") { event.preventDefault(); focusItem(menuItems.length - 1); }
    };
    const onPointerDown = (event: PointerEvent) => { if (!loadoutMenuRef.current?.contains(event.target as Node)) { setLoadoutOpen(false); loadoutTriggerRef.current?.focus(); } };
    const firstFocus = window.requestAnimationFrame(() => focusItem(0));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => { window.cancelAnimationFrame(firstFocus); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("pointerdown", onPointerDown); };
  }, [loadoutOpen]);

  useEffect(() => {
    if (!importOpen) return;
    const calculator = calculatorRef.current;
    const background = calculator ? [...calculator.children].filter((element) => !element.classList.contains("tc-import-dialog") && !element.classList.contains("tc-import-backdrop")) : [];
    background.forEach((element) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = window.requestAnimationFrame(() => importDialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeImport(); return; }
      if (event.key !== "Tab") return;
      const items = [...(importDialogRef.current?.querySelectorAll<HTMLElement>("textarea,a[href],button:not([disabled])") ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { background.forEach((element) => element.removeAttribute("inert")); document.body.style.overflow = previousOverflow; window.cancelAnimationFrame(first); window.removeEventListener("keydown", onKeyDown); };
  }, [closeImport, importOpen]);

  useEffect(() => {
    if (!notice || notice.persistent) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // The touch sheet closes on Escape or a tap outside the trees and the sheet.
  useEffect(() => {
    if (!sheetId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target && !target.closest("[data-talent-sheet]") && !target.closest("[data-tree-canvas]")) setSheetId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSheetId(null); };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("keydown", onKeyDown); };
  }, [sheetId]);

  useEffect(() => {
    if (pvpPickerSlot === null) return;
    const calculator = calculatorRef.current;
    const background = calculator ? [...calculator.children].filter((element) => !element.classList.contains("tc-pvp-picker") && !element.classList.contains("tc-pvp-picker-backdrop")) : [];
    background.forEach((element) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    const previousCalculatorOverflow = calculator?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    if (calculator) calculator.style.overflow = "hidden";
    const first = window.requestAnimationFrame(() => pvpPickerRef.current?.querySelector<HTMLInputElement>("[data-pvp-search]")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePvpPicker(); return; }
      const picker = pvpPickerRef.current;
      const options = [...(picker?.querySelectorAll<HTMLButtonElement>("[data-pvp-option]:not([disabled])") ?? [])];
      const optionIndex = options.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown" && (document.activeElement as Element | null)?.matches("[data-pvp-search]")) { event.preventDefault(); options[0]?.focus(); return; }
      if ((event.key === "ArrowDown" || event.key === "ArrowRight") && optionIndex >= 0) { event.preventDefault(); options[(optionIndex + 1) % options.length]?.focus(); return; }
      if ((event.key === "ArrowUp" || event.key === "ArrowLeft") && optionIndex >= 0) { event.preventDefault(); options[(optionIndex - 1 + options.length) % options.length]?.focus(); return; }
      if (event.key === "Home" && optionIndex >= 0) { event.preventDefault(); options[0]?.focus(); return; }
      if (event.key === "End" && optionIndex >= 0) { event.preventDefault(); options[options.length - 1]?.focus(); return; }
      if (event.key !== "Tab") return;
      const items = [...(picker?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { background.forEach((element) => element.removeAttribute("inert")); document.body.style.overflow = previousOverflow; if (calculator) calculator.style.overflow = previousCalculatorOverflow; window.cancelAnimationFrame(first); window.removeEventListener("keydown", onKeyDown); };
  }, [closePvpPicker, pvpPickerSlot]);

  useEffect(() => {
    if (pvpPickerSlot !== null || pvpReturnFocusRef.current === null) return;
    const slot = pvpReturnFocusRef.current;
    pvpReturnFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => pvpSlotRefs.current[slot]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pvpPickerSlot]);

  useEffect(() => {
    const pending = pendingPvpBurstRef.current;
    if (!pending) return;
    pendingPvpBurstRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const target = pvpSlotRefs.current[pending.slot];
      suppressPvpTooltipRef.current = true;
      target?.focus();
      if (target) playPvpBurst(target, pending.action);
      window.setTimeout(() => { suppressPvpTooltipRef.current = false; }, 650);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pvpSelections]);

  /** Sets one node to `nextRank` (and optionally its choice); drops the ranks that lose their requirement. */
  const setNodeRank = useCallback((node: TalentNode, nextRank: number, choiceId?: number) => {
    const { data: current, ranks: currentRanks, choices: currentChoices, budgets: currentBudgets, copy: currentCopy, nodeCatalog: catalog } = live.current;
    if (!current || node.freeNode) return false;
    const kind = kindOfNode(node.id);
    const rank = currentRanks.get(node.id) ?? 0;
    const target = Math.max(0, Math.min(node.maxRanks, nextRank));
    const choiceChanged = choiceId !== undefined && currentChoices.get(node.id) !== choiceId;
    if (target === rank && !choiceChanged) return false;
    if (target > rank) {
      const treeSpent = countRanks(currentRanks, kind, current.trees[kind].nodes);
      if (!nodeAvailability(node, kind, currentRanks, treeSpent, catalog, currentCopy).available) return false;
      if (treeSpent + (target - rank) > currentBudgets[kind]) { showNotice(currentCopy.treeFull(currentBudgets[kind])); return false; }
    }
    const nextRanks = new Map(currentRanks);
    const nextChoices = new Map(currentChoices);
    if (target) nextRanks.set(node.id, target); else { nextRanks.delete(node.id); nextChoices.delete(node.id); }
    if (target && node.nodeType === "choice") {
      const chosen = choiceId ?? nextChoices.get(node.id) ?? node.choices[0]?.externalId;
      if (chosen !== undefined) nextChoices.set(node.id, chosen);
    }
    const dependents = target < rank ? removeInvalidDependents(current, nextRanks, nextChoices, catalog) : 0;
    live.current = { ...live.current, ranks: nextRanks, choices: nextChoices };
    setUndoState(null);
    setRanks(nextRanks);
    if (!mapsHaveSameValues(currentChoices, nextChoices)) setChoices(nextChoices);
    if (dependents > 0) showNotice(currentCopy.dependentsRemoved(dependents));
    return true;
  }, [showNotice]);

  const cycleNodeChoice = useCallback((node: TalentNode, direction: 1 | -1) => {
    const rank = live.current.ranks.get(node.id) ?? 0;
    if (node.nodeType !== "choice" || node.choices.length < 2 || !rank) return false;
    const index = Math.max(0, node.choices.findIndex((choice) => choice.externalId === live.current.choices.get(node.id)));
    return setNodeRank(node, rank, node.choices[(index + direction + node.choices.length) % node.choices.length].externalId);
  }, [setNodeRank]);

  const treeActions = useMemo<TalentTreeActions>(() => ({
    activate: (node: TalentNode, pointer: PointerKind) => {
      const rank = live.current.ranks.get(node.id) ?? 0;
      if (node.nodeType === "choice" && node.choices.length > 1) {
        // On touch the option is picked in the sheet; a mouse click takes the first option, then switches.
        if (pointer === "touch") return false;
        if (rank >= node.maxRanks) return cycleNodeChoice(node, 1);
      }
      return rank < node.maxRanks ? setNodeRank(node, rank + 1) : false;
    },
    decrement: (node: TalentNode) => setNodeRank(node, (live.current.ranks.get(node.id) ?? 0) - 1),
    cycle: cycleNodeChoice,
    inspect: (node: TalentNode | null, anchor: HTMLElement | null, pointer: PointerKind) => {
      if (pointer === "touch") {
        tipRef.current?.hide();
        // The rank change paints first; the sheet follows in a transition.
        startTransition(() => setSheetId(node?.id ?? null));
        return;
      }
      if (node && anchor) tipRef.current?.show(node.id, anchor); else tipRef.current?.hide();
    },
  }), [cycleNodeChoice, setNodeRank]);

  const searchMatches = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!data || !normalized) return null;
    const matches = new Set<string>();
    for (const tree of Object.values(data.trees)) for (const node of tree.nodes) if (node.choices.some((choice) => `${choice.name} ${choice.description}`.toLowerCase().includes(normalized))) matches.add(node.id);
    return matches;
  }, [data, deferredQuery]);

  const pvpById = useMemo(() => new Map(data?.pvpTalents.map((talent) => [talent.externalId, talent]) ?? []), [data]);

  // One tooltip for every node and PvP talent; it re-renders with the build, the trees do not.
  const describe = (id: string) => {
    if (id.startsWith("pvp:")) {
      const talent = pvpById.get(Number(id.slice(4)));
      return talent ? <PvpCard talent={talent} copy={copy} lang={lang} /> : null;
    }
    const node = nodeById.get(id);
    if (!node || !data) return null;
    const rank = ranks.get(node.id) ?? 0;
    const kind = kindOfNode(node.id);
    const lock = rank ? null : nodeAvailability(node, kind, ranks, rankByTree[kind], nodeCatalog, copy);
    return <TalentCardBody model={{ node, rank, selectedChoice: choices.get(node.id), lockReason: lock && !lock.available ? lock.reason : "" }} copy={copy} lang={lang} />;
  };

  const filteredPvpTalents = useMemo(() => {
    const normalized = pvpQuery.trim().toLowerCase();
    if (!normalized) return data?.pvpTalents ?? [];
    return (data?.pvpTalents ?? []).filter((talent) => `${talent.name} ${talent.description}`.toLowerCase().includes(normalized));
  }, [data, pvpQuery]);
  const openPvpPicker = useCallback((slot: number) => { tipRef.current?.hide(); setPvpQuery(""); setPvpPickerSlot(slot); }, []);
  const choosePvpTalent = useCallback((externalId: number) => {
    if (pvpPickerSlot === null) return;
    const talent = pvpById.get(externalId);
    if (!talent) return;
    if (pvpSelections.some((id, index) => id === externalId && index !== pvpPickerSlot)) { showNotice(copy.pvpDuplicate); return; }
    setUndoState(null);
    suppressPvpTooltipRef.current = true;
    pendingPvpBurstRef.current = { slot: pvpPickerSlot, action: "equip" };
    setPvpSelections((current) => current.map((id, index) => index === pvpPickerSlot ? externalId : id));
    setPvpPickerSlot(null);
  }, [copy, pvpById, pvpPickerSlot, pvpSelections, showNotice]);
  const clearPvpTalent = useCallback((slot: number) => {
    const talent = pvpById.get(pvpSelections[slot] ?? -1);
    if (!talent) return;
    const target = pvpSlotRefs.current[slot];
    if (target) playPvpBurst(target, "remove");
    setUndoState(null);
    setPvpSelections((current) => current.map((id, index) => index === slot ? null : id));
  }, [pvpById, pvpSelections]);

  // Top players' builds of the hero tree on screen, decoded once: the picker loads them and marks the one in use.
  const presetLoadouts = useMemo(() => new Map((builds ?? []).flatMap((build) => {
    if (!data || (build.heroId && build.heroId !== data.heroSubtreeId)) return [];
    const decoded = decodeWoWTalentLoadout(data, build.loadout);
    if (!decoded || decoded.truncated) return [];
    const loadout = sanitizeLoadout(data, { ranks: decoded.ranks, choices: decoded.choices, pvp: EMPTY_PVP });
    return [[build.loadout, { loadout, signature: encodeLoadout(loadout.ranks, loadout.choices, EMPTY_PVP) }] as const];
  })), [builds, data]);

  if (!data || !geometry) return <ErrorState theme={theme} lang={lang} />;

  const totalAvailable = budgets.class + budgets.hero + budgets.spec;
  const buildComplete = TALENT_KINDS.every((kind) => rankByTree[kind] === budgets[kind]);
  const missingPoints = Math.max(0, totalAvailable - spent);
  const fill = Math.round((spent / Math.max(1, totalAvailable)) * 100);
  const specPanelIcon = theme.iconUrl !== theme.classIconUrl
    ? theme.iconUrl
    : data.trees.spec.nodes.find((node) => node.entryNode)?.choices.find((choice) => choice.iconUrl)?.iconUrl ?? theme.classIconUrl;
  const heroPanelIcon = data.trees.hero.nodes.find((node) => node.entryNode)?.choices.find((choice) => choice.iconUrl)?.iconUrl ?? data.heroIconUrl;
  const buildSaved = savedSignature === currentSignature;
  const loadout = { ranks, choices, pvp: pvpSelections };

  const snapshot = () => setUndoState({ ranks: new Map(ranks), choices: new Map(choices), pvp: [...pvpSelections] });
  const applyLoadout = (next: { ranks: RankMap; choices: ChoiceMap; pvp: PvpSlots }) => { setRanks(next.ranks); setChoices(next.choices); setPvpSelections(next.pvp); setSheetId(null); };
  const reset = () => {
    setLoadoutOpen(false);
    if (spent === 0 && !pvpSelections.some((id) => id !== null)) return;
    snapshot();
    applyLoadout({ ranks: freeTalentRanks(data), choices: new Map(), pvp: [null, null, null] });
    showNotice(copy.talentsReset, true);
  };
  const undoReset = () => { if (!undoState) return; applyLoadout({ ranks: new Map(undoState.ranks), choices: new Map(undoState.choices), pvp: [...undoState.pvp] }); setUndoState(null); showNotice(copy.buildRestored); };
  const copyText = async (value: string, success: string) => {
    setLoadoutOpen(false);
    try {
      await copyToClipboard(value);
      showNotice(success);
    } catch {
      window.prompt(copy.copyManually, value);
    }
  };
  const shareUrl = () => {
    const url = new URL(window.location.href);
    for (const key of ["build", "pvp", "loadout", "import"]) url.searchParams.delete(key);
    buildSearchParams(data, loadout).forEach((value, key) => url.searchParams.set(key, value));
    return url.toString();
  };
  const copyShareLink = () => void copyText(shareUrl(), copy.linkCopied);
  const copyGameString = () => void copyText(encodeWoWTalentLoadout(data, ranks, choices), copy.gameStringCopied);
  const persistBuilds = (builds: SavedTalentBuild[], activeId: string | null) => {
    try {
      window.localStorage.setItem(buildLibraryKey(theme.slug), JSON.stringify(builds));
      if (activeId) window.localStorage.setItem(activeBuildKey(theme.slug), activeId);
      else window.localStorage.removeItem(activeBuildKey(theme.slug));
      return true;
    } catch {
      showNotice(copy.storageBlocked, true);
      return false;
    }
  };
  const saveBuild = (asCopy = false) => {
    const name = buildName.trim() || defaultBuildName;
    const targetId = !asCopy && activeBuildId && savedBuilds.some((build) => build.id === activeBuildId) ? activeBuildId : createBuildId(theme.slug);
    const targetName = asCopy ? `${name}${copy.copySuffix}`.slice(0, 48) : name.slice(0, 48);
    const record: SavedTalentBuild = { id: targetId, name: targetName, loadout: currentSignature, savedAt: new Date().toISOString(), buildVersion: data.buildVersion };
    const nextBuilds = [record, ...savedBuilds.filter((build) => build.id !== targetId)].slice(0, 24);
    if (!persistBuilds(nextBuilds, targetId)) return;
    setSavedBuilds(nextBuilds); setActiveBuildId(targetId); setBuildName(targetName); setSavedSignature(currentSignature); setLoadoutOpen(false);
    showNotice(asCopy ? copy.copySaved : copy.buildSaved(targetName));
  };
  const loadSavedBuild = (build: SavedTalentBuild) => {
    const decoded = decodeLoadout(build.loadout);
    if (!decoded) { showNotice(copy.savedBuildBroken, true); return; }
    const next = sanitizeLoadout(data, decoded);
    snapshot();
    applyLoadout(next);
    setBuildName(build.name); setActiveBuildId(build.id); setSavedSignature(encodeLoadout(next.ranks, next.choices, next.pvp));
    persistBuilds(savedBuilds, build.id);
    setLoadoutOpen(false); showNotice(copy.loaded(build.name));
  };
  const deleteSavedBuild = (build: SavedTalentBuild) => {
    if (!window.confirm(copy.deleteConfirm(build.name))) return;
    const nextBuilds = savedBuilds.filter((item) => item.id !== build.id);
    const nextActiveId = activeBuildId === build.id ? null : activeBuildId;
    if (!persistBuilds(nextBuilds, nextActiveId)) return;
    setSavedBuilds(nextBuilds);
    if (activeBuildId === build.id) { setActiveBuildId(null); setSavedSignature(null); }
    showNotice(copy.buildDeleted);
  };
  const createNewBuild = () => {
    snapshot();
    applyLoadout({ ranks: freeTalentRanks(data), choices: new Map(), pvp: [null, null, null] });
    setBuildName(copy.newBuildName(names.spec)); setActiveBuildId(null); setSavedSignature(null); setLoadoutOpen(false);
    persistBuilds(savedBuilds, null);
    showNotice(copy.newBuildCreated, true);
  };
  const otherHero = theme.heroPaths.find((hero) => hero.id !== data.heroSubtreeId);
  const pageHref = (params: URLSearchParams, heroId = data.heroSubtreeId) => {
    params.set("hero", String(heroId));
    if (rotationFlow) params.set("returnTo", returnTo);
    return `${localePrefix}/talents/${theme.slug}?${params.toString()}`;
  };
  const popularName = (build: PopularBuild) => copy.popularBuildName(build.heroId ? heroPathName(theme.heroPaths.find((hero) => hero.id === build.heroId) ?? { name: names.spec, nameRu: names.spec }, lang) : names.spec, build.players[0]?.name ?? "");
  const loadPopularBuild = (build: PopularBuild) => {
    const preset = presetLoadouts.get(build.loadout);
    if (!preset) {
      if (build.heroId && build.heroId !== data.heroSubtreeId) router.push(pageHref(new URLSearchParams({ build: build.loadout }), build.heroId), { scroll: false });
      return;
    }
    snapshot();
    applyLoadout({ ...preset.loadout, pvp: pvpSelections });
    setBuildName(popularName(build).slice(0, 48)); setActiveBuildId(null); setSavedSignature(null);
    showNotice(copy.loaded(popularName(build)));
  };
  const currentTreeSignature = encodeLoadout(ranks, choices, EMPTY_PVP);
  // Two strings can draw the same trees (one keeps old points in the other hero tree): one button each.
  const presets = (builds ?? []).filter((build, index, list) => {
    const signature = presetLoadouts.get(build.loadout)?.signature;
    return !signature || list.findIndex((other) => presetLoadouts.get(other.loadout)?.signature === signature) === index;
  });
  const openImportDialog = () => { setImportValue(""); setImportState({ kind: "idle" }); setLoadoutOpen(false); setImportOpen(true); };
  const checkImport = (value: string) => { setImportValue(value); setImportState(value.trim() ? parseBuildInput(data, value) : { kind: "idle" }); };
  const applyImport = () => {
    const result = parseBuildInput(data, importValue);
    setImportState(result);
    if (result.kind === "other-hero" && otherHero) {
      router.push(pageHref(new URLSearchParams({ build: result.value }), otherHero.id), { scroll: false });
      return;
    }
    if (result.kind !== "ok") return;
    snapshot();
    applyLoadout(result.loadout);
    setBuildName(copy.importedBuildName(names.spec)); setActiveBuildId(null); setSavedSignature(null); closeImport();
    showNotice(result.loadout.adjusted ? copy.importedAdjusted : copy.imported);
  };
  const switchHero = (event: ReactMouseEvent<HTMLAnchorElement>, heroId: number) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (heroId === data.heroSubtreeId) return;
    router.push(pageHref(buildSearchParams(data, loadout, true), heroId), { scroll: false });
  };
  const useInRotation = () => {
    if (!buildComplete) return showNotice(copy.pointsMissing(missingPoints), true);
    const talentLoadout = encodeWoWTalentLoadout(data, ranks, choices);
    try {
      window.sessionStorage.setItem(TALENT_HANDOFF_STORAGE_KEY, JSON.stringify({ talentLoadout, talentBuildName: buildName.trim() || defaultBuildName }));
    } catch { /* URL handoff below remains available when storage is restricted. */ }
    const destination = new URL(returnTo, window.location.origin);
    destination.searchParams.set("talentLoadout", talentLoadout);
    destination.searchParams.set("talentBuildName", buildName.trim() || defaultBuildName);
    router.push(`${destination.pathname}${destination.search}`);
  };

  const activePvpTalent = pvpPickerSlot === null ? null : pvpById.get(pvpSelections[pvpPickerSlot] ?? -1);
  const treeTitle: Record<TalentKind, string> = { class: data.className, hero: data.heroName, spec: data.specName };
  const sheetNode = sheetId ? nodeById.get(sheetId) : undefined;
  const sheetKind = sheetNode ? kindOfNode(sheetNode.id) : "class";
  const sheetRank = sheetNode ? ranks.get(sheetNode.id) ?? 0 : 0;
  const sheetLock = sheetNode ? nodeAvailability(sheetNode, sheetKind, ranks, rankByTree[sheetKind], nodeCatalog, copy) : null;
  const heroSwitch = <nav className={`tc-hero-paths ${page.heroSwitch}`} aria-label={copy.heroPathsLabel}>{theme.heroPaths.map((hero) => {
    const active = hero.id === data.heroSubtreeId;
    return <Link key={hero.id} href={`${localePrefix}/talents/${theme.slug}?hero=${hero.id}`} prefetch={false} scroll={false} data-route-scroll="keep" aria-current={active ? "page" : undefined} onClick={(event) => switchHero(event, hero.id)}>{heroPathName(hero, lang)}</Link>;
  })}</nav>;
  const importOtherSpec = importState.kind === "other-spec" ? talentSpecThemes.find((entry) => entry.specId === importState.specId) : undefined;
  const importMessage = importState.kind === "empty" ? copy.importEmpty
    : importState.kind === "damaged" ? copy.importDamaged
      : importState.kind === "unknown" ? copy.importUnknown
        : importState.kind === "other-spec" ? copy.importOtherSpec(importOtherSpec ? talentThemeNames(importOtherSpec, lang).spec : "")
          : importState.kind === "other-hero" && otherHero ? copy.importOtherHero(heroPathName(otherHero, lang))
            : "";
  const importReady = importState.kind === "ok" || importState.kind === "other-hero";

  const renderTree = (kind: TalentKind) => {
    const mounted = mountedTrees.has(kind);
    return <TalentTreePanel key={kind} lang={lang} variant={kind} title={treeTitle[kind]}
      iconSrc={kind === "class" ? theme.classIconUrl : kind === "hero" ? heroPanelIcon : specPanelIcon}
      switcher={kind === "hero" ? heroSwitch : undefined}
      spent={mounted ? rankByTree[kind] : 0} budget={budgets[kind]} loading={!mounted}>
      {mounted
        ? <TalentTree tree={data.trees[kind]} kind={kind} title={treeTitle[kind]} geometry={geometry[kind]} ranks={slices.ranks[kind]} choices={slices.choices[kind]} spent={rankByTree[kind]} catalog={nodeCatalog} copy={copy} matches={searchMatches} inspectedId={sheetNode && sheetKind === kind ? sheetNode.id : null} actions={treeActions} />
        : <div className={`tc-skeleton-tree ${page.treeSkeleton}`} style={{ aspectRatio: `${geometry[kind].cellsX} / ${geometry[kind].cellsY}`, "--cells-x": geometry[kind].cellsX } as CSSProperties} />}
    </TalentTreePanel>;
  };

  return (
    <main ref={calculatorRef} className={`talent-calculator ${page.page}${rotationFlow ? " is-rotation-flow" : ""}`} lang={lang} data-atlas-scope="" data-talent-page="" data-spec={theme.slug} data-hero={data.heroSubtreeId} data-spec-motif={theme.motif} data-performance={performanceTier} data-page-active="true">
      <TalentHero theme={theme} lang={lang}
        back={rotationFlow ? <button className={`tc-back-link ${page.back}`} type="button" onClick={() => router.push(returnTo)}>{copy.backToRotation}</button> : null}
        actions={<div className={page.actions}>
          <MaterialButton kit={TALENTS_KIT} fit="stack" variant="primary" icon={<Upload aria-hidden="true" />} onClick={openImportDialog}>{copy.importTitle}</MaterialButton>
          <MaterialButton kit={TALENTS_KIT} fit="stack" icon={<Share2 aria-hidden="true" />} onClick={copyShareLink}>{copy.share}</MaterialButton>
        </div>} />
      {presets.length ? <nav className={page.presets} aria-label={copy.popularTitle}>
        <span className={page.presetsTitle} aria-hidden="true">{copy.popularTitle}</span>
        <ul>
          {presets.map((build) => {
            const hero = build.heroId ? theme.heroPaths.find((path) => path.id === build.heroId) : undefined;
            const heroLabel = hero ? heroPathName(hero, lang) : names.spec;
            const share = `${Math.round(build.share * 100)}%`;
            const player = build.players[0]?.name ?? "";
            const active = presetLoadouts.get(build.loadout)?.signature === currentTreeSignature;
            return <li key={build.loadout}>
              <button type="button" className={page.preset} aria-pressed={active} aria-label={copy.popularAria(heroLabel, share, player)} onClick={() => loadPopularBuild(build)}>
                <b>{heroLabel}</b><span>{share}</span><small>{player}</small>
              </button>
            </li>;
          })}
        </ul>
      </nav> : null}
      <MaterialPlaque kit={TALENTS_KIT} as="section" className={page.command} aria-label={copy.toolbarLabel}>
        <div className="tc-command-actions">
          <SpecMenu current={theme} localePrefix={localePrefix} lang={lang} />
          <div className="tc-points-badge" data-resource-state={spent === 0 ? "empty" : spent === totalAvailable ? "complete" : "active"} style={{ "--tc-rage-level": `${fill}%` } as CSSProperties} role="img" aria-label={copy.pointsAria(spent, totalAvailable)}>
            <span className="tc-rage-emblem" aria-hidden="true"><ResourceGlyph motif={theme.motif} /><i /></span>
            <span className="tc-rage-copy" aria-hidden="true"><b>{spent}<i> / {totalAvailable}</i></b></span>
            <span className={`tc-rage-meter ${page.meter}`} aria-hidden="true"><progress value={spent} max={totalAvailable} /></span>
          </div>
          <div className="tc-loadout-menu" ref={loadoutMenuRef}>
            <button ref={loadoutTriggerRef} className="tc-build-select" type="button" aria-label={copy.buildSelectAria(buildName)} aria-haspopup="menu" aria-controls="tc-loadout-menu" aria-expanded={loadoutOpen} onClick={() => setLoadoutOpen((open) => !open)}><span><b>{buildName}</b></span><ChevronDown /></button>
            {loadoutOpen ? <div className="tc-loadout-popover" id="tc-loadout-menu" role="menu" aria-label={copy.libraryLabel}>
              <div className="tc-build-popover-head"><span><b>{copy.libraryTitle}</b></span><button type="button" role="menuitem" tabIndex={-1} onClick={createNewBuild}><Plus />{copy.newBuild}</button></div>
              <label className="tc-build-name"><span>{copy.buildNameLabel}</span><input value={buildName} maxLength={48} onChange={(event) => { setBuildName(event.target.value); setSavedSignature(null); }} /></label>
              <div className="tc-build-actions"><button type="button" role="menuitem" tabIndex={-1} onClick={() => saveBuild(false)}><Save />{activeBuildId ? copy.saveChanges : copy.saveBuild}</button><button type="button" role="menuitem" tabIndex={-1} onClick={() => saveBuild(true)}>{copy.saveCopy}</button></div>
              <div className="tc-build-list" role="group" aria-label={copy.savedBuildsLabel}>
                {savedBuilds.map((build) => <div className={`tc-build-row${build.id === activeBuildId ? " is-active" : ""}`} key={build.id}><button type="button" role="menuitem" tabIndex={-1} onClick={() => loadSavedBuild(build)}><span>{build.name}</span><small>{new Date(build.savedAt).toLocaleDateString(copy.locale)}</small></button><button type="button" role="menuitem" tabIndex={-1} aria-label={copy.deleteBuildAria(build.name)} onClick={() => deleteSavedBuild(build)}><Trash2 /></button></div>)}
                {!savedBuilds.length ? <p>{copy.noSavedBuilds}</p> : null}
              </div>
              <div className="tc-build-tools"><button type="button" role="menuitem" tabIndex={-1} onClick={openImportDialog}><Upload />{copy.importShort}</button><button type="button" role="menuitem" tabIndex={-1} onClick={copyGameString}><ClipboardCopy />{copy.gameStringShort}</button><button type="button" role="menuitem" tabIndex={-1} onClick={copyShareLink}><Link2 />{copy.linkShort}</button><button type="button" role="menuitem" tabIndex={-1} onClick={reset}><RotateCcw />{copy.resetShort}</button></div>
            </div> : null}
          </div>
          <div className="tc-command-group">
            <button className={`tc-command-button ${page.copyString}`} type="button" onClick={copyGameString} data-copy-game-string=""><ClipboardCopy aria-hidden="true" /><span>{copy.copyGameString}</span></button>
            <button className="tc-command-button is-undo" type="button" disabled={!undoState} onClick={undoReset} aria-label={copy.undo} title={copy.undo}><Undo2 aria-hidden="true" /><span>{copy.undo}</span></button>
            <button className="tc-command-button is-reset" type="button" onClick={reset} aria-label={copy.resetShort} title={copy.resetShort}><RotateCcw aria-hidden="true" /><span>{copy.resetShort}</span></button>
          </div>
        </div>
      </MaterialPlaque>
      <div className={`tc-mobile-tree-switcher ${page.treeSwitch}`} role="group" aria-label={copy.treeSwitcher}>
        {TALENT_KINDS.map((kind) => <button key={kind} type="button" aria-pressed={mobileTree === kind} data-tree-tab={kind} onClick={() => { setMobileTree(kind); setSheetId(null); }}>
          <span>{copy.treeTabs[kind]}</span><b data-full={rankByTree[kind] >= budgets[kind] || undefined}>{rankByTree[kind]}/{budgets[kind]}</b>
        </button>)}
      </div>
      <section className={`tc-workspace ${page.workspace}`} data-mobile-tree={mobileTree} style={{ ...materialPlaqueStyle(TALENTS_KIT), "--fr-class": `${geometry.class.cellsX}fr`, "--fr-hero": `${Math.max(geometry.hero.cellsX, 5)}fr`, "--fr-spec": `${geometry.spec.cellsX}fr` } as CSSProperties}>
        {TALENT_KINDS.map((kind) => !compactLayout || mobileTree === kind ? renderTree(kind) : null)}
      </section>
      {sheetNode ? <div className={page.sheetSpace} aria-hidden="true" /> : null}
      <footer className="tc-toolbar">
        <div className="tc-toolbar-group tc-toolbar-primary">
          <TalentSearchField count={searchMatches?.size ?? 0} copy={copy} onQueryChange={updateTalentQuery} />
        </div>
        <div className="tc-toolbar-divider" />
        <div className="tc-toolbar-spacer" />
        <div className="tc-pvp-group" role="group" aria-label={copy.pvpTalents}>
          <span className="tc-pvp-label">{copy.pvpTalents}</span>
          {[0, 1, 2].map((slot) => {
            const talent = pvpById.get(pvpSelections[slot] ?? -1);
            const visual = talent ? pvpVisualTheme(talent) : null;
            return <button
              className={`tc-pvp-slot${talent ? ` is-filled tc-vfx-${visual?.theme}` : ""}`}
              key={slot}
              ref={(element) => { pvpSlotRefs.current[slot] = element; }}
              type="button"
              disabled={!data.pvpTalents.length}
              data-pvp-slot={slot}
              data-pvp-id={talent?.externalId}
              data-pvp-theme={visual?.theme}
              aria-label={copy.pvpSlotAria(slot + 1, talent?.name)}
              aria-haspopup="dialog"
              aria-controls={pvpPickerSlot === null ? undefined : "tc-pvp-picker"}
              aria-expanded={pvpPickerSlot === slot}
              onPointerEnter={(event) => { if (talent && event.pointerType !== "touch" && !suppressPvpTooltipRef.current) tipRef.current?.show(`pvp:${talent.externalId}`, event.currentTarget); }}
              onPointerLeave={() => tipRef.current?.hide()}
              onFocus={(event) => { if (talent && event.currentTarget.matches(":focus-visible") && !suppressPvpTooltipRef.current) tipRef.current?.show(`pvp:${talent.externalId}`, event.currentTarget); }}
              onBlur={() => tipRef.current?.hide()}
              onClick={() => openPvpPicker(slot)}
              onContextMenu={(event) => { if (!talent) return; event.preventDefault(); tipRef.current?.hide(); clearPvpTalent(slot); }}
            >
              {talent?.iconUrl ? <img src={talent.iconUrl} alt="" loading="lazy" decoding="async" data-icon-source={talent.iconSource} onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; event.currentTarget.dataset.iconSource = "fallback"; }} /> : <span className="tc-pvp-plus" aria-hidden="true">+</span>}
              {visual ? <TalentSigil visual={visual} /> : <i className="tc-pvp-empty-rune" aria-hidden="true" />}
              <small>{slot + 1}</small>
              <i className="tc-pvp-slot-state" aria-hidden="true" />
            </button>;
          })}
        </div>
        <span className={page.save}><MaterialButton kit={TALENTS_KIT} fit="block" variant="primary" className={`tc-save-build${buildSaved && !rotationFlow ? " is-saved" : ""}`} disabled={rotationFlow && !buildComplete} onClick={rotationFlow ? useInRotation : () => saveBuild(false)} icon={buildSaved && !rotationFlow ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}><span className={page.saveCopy}><b>{rotationFlow ? (buildComplete ? copy.useInTrainer : copy.pointsLeft(missingPoints)) : buildSaved ? copy.buildIsSaved : activeBuildId ? copy.saveChanges : copy.saveBuildCta}</b></span></MaterialButton></span>
        {notice ? <div className="tc-toast" role="status" aria-live="polite"><span>{notice.message}</span>{undoState ? <button type="button" onClick={undoReset}>{copy.undo}</button> : null}{notice.persistent ? <button type="button" aria-label={copy.closeNotice} onClick={() => setNotice(null)}>×</button> : null}</div> : null}
      </footer>
      {importOpen ? <div className="tc-import-backdrop" aria-hidden="true" onClick={closeImport} /> : null}
      {importOpen ? <div className="tc-import-dialog" ref={importDialogRef} role="dialog" aria-modal="true" aria-labelledby="tc-import-title">
        <header><h2 id="tc-import-title">{copy.importTitle}</h2><button type="button" aria-label={copy.closeImport} onClick={closeImport}><X /></button></header>
        <label><span className="sr-only">{copy.importDataLabel}</span><textarea data-build-import value={importValue} aria-invalid={Boolean(importMessage) || undefined} aria-describedby={importMessage ? "tc-import-status" : undefined} onChange={(event) => checkImport(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && importReady) { event.preventDefault(); applyImport(); } }} placeholder={copy.importPlaceholder} spellCheck={false} /></label>
        {importMessage ? <p className="tc-import-error" id="tc-import-status" role="alert" data-import-state={importState.kind}><span>{importMessage}</span>{importOtherSpec ? <Link href={`${localePrefix}/talents/${importOtherSpec.slug}?build=${encodeURIComponent(importState.kind === "other-spec" ? importState.value : "")}`} prefetch={false}>{copy.openSpec(talentThemeNames(importOtherSpec, lang).spec)}</Link> : null}</p> : null}
        <footer><button type="button" className="tc-import-cancel" onClick={closeImport}>{copy.cancel}</button><button type="button" className="tc-import-apply" data-build-import-apply onClick={applyImport} disabled={!importReady}><Upload />{copy.verifyAndLoad}</button></footer>
      </div> : null}
      {pvpPickerSlot !== null ? <div className="tc-pvp-picker-backdrop" aria-hidden="true" onClick={closePvpPicker} /> : null}
      {pvpPickerSlot !== null ? <div className="tc-pvp-picker" id="tc-pvp-picker" ref={pvpPickerRef} role="dialog" aria-modal="true" aria-labelledby="tc-pvp-picker-title">
        <div className="tc-pvp-picker-head">
          <div><h2 id="tc-pvp-picker-title">{activePvpTalent ? copy.pvpReplaceTitle : copy.pvpChooseTitle}</h2></div>
          <button type="button" className="tc-pvp-close" aria-label={copy.closePvpPicker} onClick={closePvpPicker}>×</button>
        </div>
        <div className="tc-pvp-picker-slots" role="list" aria-label={copy.currentPvpSlots}>
          {[0, 1, 2].map((slot) => { const selectedTalent = pvpById.get(pvpSelections[slot] ?? -1); return <span role="listitem" className={`${slot === pvpPickerSlot ? "is-active" : ""}${selectedTalent ? " is-filled" : ""}`} key={slot}><b>{slot + 1}</b>{selectedTalent?.iconUrl ? <img src={selectedTalent.iconUrl} alt="" /> : <i aria-hidden="true">+</i>}<small>{selectedTalent?.name ?? copy.freeSlot}</small></span>; })}
        </div>
        <label className="tc-pvp-picker-search"><Search aria-hidden="true" /><span className="sr-only">{copy.searchPvp}</span><input data-pvp-search type="search" value={pvpQuery} onChange={(event) => setPvpQuery(event.target.value)} placeholder={copy.searchPvpPlaceholder} /><kbd>↓</kbd></label>
        <div className="tc-pvp-options" role="listbox" aria-label={copy.pvpOptionsLabel(names.spec)}>
          {filteredPvpTalents.map((talent, index) => {
            const selectedSlot = pvpSelections.findIndex((id) => id === talent.externalId);
            const selectedHere = selectedSlot === pvpPickerSlot;
            const disabled = selectedSlot >= 0 && !selectedHere;
            const firstAvailable = filteredPvpTalents.find((item) => !pvpSelections.some((id, slotIndex) => id === item.externalId && slotIndex !== pvpPickerSlot))?.externalId;
            const visual = pvpVisualTheme(talent);
            return <button
              className={`tc-pvp-option tc-vfx-${visual.theme}`}
              style={{ "--tc-pvp-option-delay": `${Math.min(index * 32, 224)}ms` } as CSSProperties}
              key={talent.externalId}
              type="button"
              data-pvp-option="true"
              data-pvp-picker-id={talent.externalId}
              data-pvp-theme={visual.theme}
              role="option"
              tabIndex={!disabled && talent.externalId === firstAvailable ? 0 : -1}
              aria-selected={selectedHere}
              disabled={disabled}
              aria-label={disabled ? copy.pvpTakenAria(talent.name, selectedSlot + 1) : talent.name}
              onClick={() => choosePvpTalent(talent.externalId)}
            >
              <span className="tc-pvp-option-art"><img src={talent.iconUrl || UNVERIFIED_ICON_URL} alt="" data-icon-source={talent.iconSource} onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; event.currentTarget.dataset.iconSource = "fallback"; }} /><TalentSigil visual={visual} /></span>
              <span className="tc-pvp-option-copy"><strong>{talent.name}</strong><small>{talent.description}</small></span>
              <span className="tc-pvp-option-action">{selectedHere ? <><b aria-hidden="true">✓</b> {copy.pvpPicked}</> : disabled ? <>{copy.pvpSlotN(selectedSlot + 1)}</> : <>{copy.pvpPick}</>}</span>
            </button>;
          })}
          {!filteredPvpTalents.length ? <div className="tc-pvp-empty" role="status"><span aria-hidden="true">⌕</span><strong>{copy.nothingFound}</strong><button type="button" onClick={() => setPvpQuery("")}>{copy.resetSearch}</button></div> : null}
        </div>
        <div className="tc-pvp-picker-foot"><button type="button" className="tc-pvp-clear" data-pvp-remove="true" onClick={() => { clearPvpTalent(pvpPickerSlot); closePvpPicker(); }} disabled={!activePvpTalent}>{copy.removeFromSlot(pvpPickerSlot + 1)}</button></div>
      </div> : null}
      <TalentTip ref={tipRef} render={describe} />
      {sheetNode && sheetLock ? <TalentSheet model={{ node: sheetNode, rank: sheetRank, selectedChoice: choices.get(sheetNode.id), lockReason: sheetRank ? "" : sheetLock.available ? "" : sheetLock.reason }} copy={copy} lang={lang}
        canAdd={sheetLock.available && (sheetRank > 0 || rankByTree[sheetKind] < budgets[sheetKind])}
        onStep={(direction) => { setNodeRank(sheetNode, sheetRank + direction); }}
        onPick={(choiceId) => { setNodeRank(sheetNode, Math.max(1, sheetRank), choiceId); }}
        onClose={() => setSheetId(null)} /> : null}
    </main>
  );
}

function PvpCard({ talent, copy, lang }: { talent: PvPTalent; copy: TalentCalculatorCopy; lang: TalentCopyLang }) {
  return <div className={treeStyles.card}>
    <div className={treeStyles.cardHead}><img src={talent.iconUrl || UNVERIFIED_ICON_URL} alt="" width={40} height={40} /><div><b>{talent.name}</b><span>{copy.pvpTalent}</span></div></div>
    <TalentDescription talent={talent} locale={lang} />
  </div>;
}

