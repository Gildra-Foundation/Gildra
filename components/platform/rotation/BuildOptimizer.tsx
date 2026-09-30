"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type SetStateAction } from "react";
import { Anvil, ArrowDown, ArrowUp, Check, ChevronDown, CircleCheckBig, ClipboardPaste, Crosshair, Edit3, Flame, LibraryBig, Network, Play, Plus, Save, Share2, ShieldCheck, Skull, Swords, Target, Timer, Trash2, UsersRound, X, Zap } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RotationAbility, RotationAplRule, RotationBuildProfile, RotationScenario, RotationSimulationResult, SavedRotationCombo } from "@/lib/platform/rotation/types";
import { AbilityIcon } from "./AbilityIcon";
import { RotationAbilitySigil } from "./RotationAbilitySigil";
import { rotationAbilityVisual, rotationVisualStyle } from "./rotationVisualTheme";
import styles from "./rotationLab.module.css";
import { FURY_REFERENCE_LOADOUT, TALENT_HANDOFF_STORAGE_KEY } from "@/lib/wowTalentLoadout";
import { characterStorageScope, withCharacterContext } from "@/lib/platform/rotation/characterRequestContext";
import { validateAplRules } from "@/lib/platform/rotation/apl";
import type { AplSearchSpace } from "@/lib/platform/rotation/aplOptimizer";
import { useCharacterWorkspaceDocument } from "@/lib/wow/useCharacterWorkspaceDocument";
import { mergeRotationAbility, rotationComboName, rotationScenarioLabel } from "@/lib/platform/rotation/locale";

type StoredStudio = { builds: RotationBuildProfile[]; combos: SavedRotationCombo[]; selectedBuildId?: string };
type OptimizerScore = { candidateId: string; label: string; reason: string; mutation: "baseline" | "priority" | "threshold" | "state"; dps: number; rules: string[]; aplRules: RotationAplRule[]; result: RotationSimulationResult; verified?: boolean; verificationDelta?: number; meaningfulGain?: number };
type SharedRotationTag = { v: 1; spec: string; name: string; scenario: RotationScenario; targetCount?: number; rules: string[]; aplRules?: RotationAplRule[]; sequence: string[] };

const now = () => Date.now();
const id = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const referenceBuild = (slug: string, specialization: string, ru: boolean): RotationBuildProfile => ({
  id: `reference-${slug}`,
  name: ru ? `${specialization} · базовый профиль` : `${specialization} · baseline`,
  talentLoadout: slug === "fury-warrior" ? FURY_REFERENCE_LOADOUT : "",
  source: "reference",
  createdAt: now(),
  updatedAt: now(),
});
const validLoadout = (value: string) => value.length >= 20 && value.length <= 512 && /^[A-Za-z0-9+/=_-]+$/.test(value);
const compactDps = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : `${Math.round(value / 1_000)}K`;

function encodeShareTag(payload: SharedRotationTag) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `GLD1.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function decodeShareTag(value: string): SharedRotationTag | null {
  try {
    const encoded = value.trim().replace(/^GLD1\./i, "").replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SharedRotationTag;
    return payload?.v === 1 ? payload : null;
  } catch { return null; }
}

async function simulateCandidate(input: Record<string, unknown>, lang: Lang) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("/api/platform/rotation/simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.ok) return response.json() as Promise<RotationSimulationResult>;
    if (![429, 503].includes(response.status) || attempt === 3) {
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      const error = `${payload?.error ?? ""} ${payload?.message ?? ""}`.toLowerCase();
      if (response.status === 429 || error.includes("busy")) throw new Error(lang === "ru" ? "SimulationCraft занят. Повторите через минуту." : "SimulationCraft is busy. Try again in a minute.");
      if (error.includes("healer") || error.includes("unsupported_combat_model")) throw new Error(lang === "ru" ? "Этой специализации нужен отдельный расчёт лечения." : "This specialization requires a dedicated healing model.");
      throw new Error(lang === "ru" ? "Не удалось получить результат SimulationCraft. Повторите расчёт." : "Could not get a SimulationCraft result. Run the simulation again.");
    }
    const wait = Math.min(2200, Math.max(350, Number(response.headers.get("retry-after") ?? 1) * 1000));
    await new Promise((resolve) => window.setTimeout(resolve, wait));
  }
  throw new Error(lang === "ru" ? "SimulationCraft не ответил." : "SimulationCraft did not respond.");
}

function validStudio(value: unknown): StoredStudio {
  const parsed = value && typeof value === "object" ? value as Partial<StoredStudio> : {};
  const builds = Array.isArray(parsed.builds) ? parsed.builds.filter((build): build is RotationBuildProfile => Boolean(build && build.source === "custom" && typeof build.id === "string" && typeof build.name === "string" && typeof build.talentLoadout === "string" && validLoadout(build.talentLoadout))) : [];
  const combos = Array.isArray(parsed.combos) ? parsed.combos.filter((combo): combo is SavedRotationCombo => Boolean(combo && typeof combo.id === "string" && Array.isArray(combo.sequence) && combo.sequence.length)) : [];
  return { builds, combos, selectedBuildId: typeof parsed.selectedBuildId === "string" ? parsed.selectedBuildId : undefined };
}

export function BuildOptimizer({ slug, specialization, lang, abilities, scenario, fightLength, targets, rules, aplRules, characterSlug, dataMode, connectedTalentLoadout, embedded = false, currentResult, resultMatchesCurrent, onScenarioChange, onFightLengthChange, onTargetsChange, onTalentLoadoutChange, onOptimized, onUseCombo }: {
  slug: string;
  specialization: string;
  lang: Lang;
  abilities: RotationAbility[];
  scenario: RotationScenario;
  fightLength: number;
  targets: number;
  rules: string[];
  aplRules: RotationAplRule[];
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
  connectedTalentLoadout?: string;
  embedded?: boolean;
  currentResult: RotationSimulationResult | null;
  resultMatchesCurrent: boolean;
  onScenarioChange: (scenario: RotationScenario) => void;
  onFightLengthChange: (seconds: number) => void;
  onTargetsChange: (targets: number) => void;
  onTalentLoadoutChange: (loadout: string) => void;
  onOptimized: (result: RotationSimulationResult, combo: SavedRotationCombo) => void;
  onUseCombo: (combo: SavedRotationCombo) => void;
}) {
  const ru = lang === "ru";
  const baselineBuild = useMemo(() => {
    const fallback = referenceBuild(slug, specialization, ru);
    return characterSlug
      ? { ...fallback, name: dataMode === "battle-net" ? (ru ? `${specialization} · текущий билд Battle.net` : `${specialization} · current Battle.net build`) : (ru ? `${specialization} · тестовый профиль` : `${specialization} · demo profile`), talentLoadout: connectedTalentLoadout ?? (dataMode === "battle-net" ? "" : fallback.talentLoadout) }
      : fallback;
  }, [characterSlug, connectedTalentLoadout, dataMode, ru, slug, specialization]);
  const referenceBuildId = baselineBuild.id;
  const storageKey = `gildra:rotation-build-studio:${slug}:${characterStorageScope(characterSlug, dataMode)}:v2`;
  const initialStudio = useMemo<StoredStudio>(() => ({ builds: [], combos: [], selectedBuildId: referenceBuildId }), [referenceBuildId]);
  const workspace = useCharacterWorkspaceDocument({
    lang,
    enabled: dataMode === "battle-net" && Boolean(characterSlug), characterSlug: characterSlug ?? "reference--reference--reference", specializationSlug: slug,
    kind: "rotation-studio", localStorageKey: storageKey, initialValue: initialStudio, validate: validStudio,
  });
  const builds = useMemo(() => [baselineBuild, ...workspace.value.builds.filter((build) => build.id !== referenceBuildId)], [baselineBuild, referenceBuildId, workspace.value.builds]);
  const combos = workspace.value.combos;
  const selectedBuildId = builds.some((build) => build.id === workspace.value.selectedBuildId) ? workspace.value.selectedBuildId! : referenceBuildId;
  const hydrated = workspace.hydrated;
  const setBuilds = (action: SetStateAction<RotationBuildProfile[]>) => workspace.setValue((current) => {
    const full = [baselineBuild, ...current.builds.filter((build) => build.id !== referenceBuildId)];
    const next = typeof action === "function" ? action(full) : action;
    return { ...current, builds: next.filter((build) => build.source === "custom") };
  });
  const setCombos = (action: SetStateAction<SavedRotationCombo[]>) => workspace.setValue((current) => ({ ...current, combos: typeof action === "function" ? action(current.combos) : action }));
  const setSelectedBuildId = (action: SetStateAction<string>) => workspace.setValue((current) => ({ ...current, selectedBuildId: typeof action === "function" ? action(current.selectedBuildId ?? referenceBuildId) : action }));
  const [buildEditor, setBuildEditor] = useState<"new" | "edit" | null>(null);
  const [buildName, setBuildName] = useState("");
  const [talentLoadout, setTalentLoadout] = useState("");
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [comboName, setComboName] = useState("");
  const [comboSequence, setComboSequence] = useState<string[]>([]);
  const [addAbility, setAddAbility] = useState(abilities[0]?.id ?? "");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizerStep, setOptimizerStep] = useState(0);
  const [optimizerTotal, setOptimizerTotal] = useState(0);
  const [scores, setScores] = useState<OptimizerScore[]>([]);
  const [searchSpace, setSearchSpace] = useState<AplSearchSpace | null>(null);
  const [readyComboId, setReadyComboId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [shareTag, setShareTag] = useState("");
	const byId = useMemo(() => {
	  const catalog = new Map(abilities.map((ability) => [ability.id, ability]));
	  for (const combo of combos) for (const ability of combo.abilities ?? []) {
	    const existing = catalog.get(ability.id);
	    const incomingIcon = ability.iconUrl && !ability.iconUrl.includes("/assets/specs/") ? ability.iconUrl : "";
    catalog.set(ability.id, { ...mergeRotationAbility(existing, ability), iconUrl: incomingIcon || existing?.iconUrl || ability.iconUrl || "" });
	  }
	  for (const score of scores) for (const ability of score.result.abilities ?? []) {
	    const existing = catalog.get(ability.id);
	    const incomingIcon = ability.iconUrl && !ability.iconUrl.includes("/assets/specs/") ? ability.iconUrl : "";
    catalog.set(ability.id, { ...mergeRotationAbility(existing, ability), iconUrl: incomingIcon || existing?.iconUrl || ability.iconUrl || "" });
	  }
	  return catalog;
	}, [abilities, combos, scores]);
  const selectedBuild = builds.find((build) => build.id === selectedBuildId) ?? builds[0];
  const buildCombos = combos.filter((combo) => combo.buildId === selectedBuild?.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const latestCombo = buildCombos.find((combo) => combo.id === readyComboId);
  const comboLabel = (combo: SavedRotationCombo) => rotationComboName(combo, lang, combo.buildId === referenceBuildId ? baselineBuild.name : combo.buildName);
  const trainingCombo = (combo: SavedRotationCombo) => ({ ...combo, name: comboLabel(combo), buildName: combo.buildId === referenceBuildId ? baselineBuild.name : combo.buildName });
  const talentCalculatorParams = new URLSearchParams({ returnTo: `${ru ? "/ru" : ""}/wow/rotation/${slug}` });
  if (selectedBuild?.talentLoadout) talentCalculatorParams.set("import", selectedBuild.talentLoadout);
  const talentCalculatorHref = `${ru ? "/ru" : ""}/talents/${slug}?${talentCalculatorParams}`;

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    let handoff: { talentLoadout?: string; talentBuildName?: string } = {};
    try { handoff = JSON.parse(window.sessionStorage.getItem(TALENT_HANDOFF_STORAGE_KEY) ?? "{}") as { talentLoadout?: string; talentBuildName?: string }; } catch { handoff = {}; }
    const calculatorLoadout = (params.get("talentLoadout") ?? handoff?.talentLoadout ?? "").trim();
    const calculatorName = (params.get("talentBuildName") ?? handoff?.talentBuildName ?? "").trim().slice(0, 48) || (ru ? `Мой билд: ${specialization}` : `My ${specialization} build`);
    if (validLoadout(calculatorLoadout)) {
      const timestamp = now();
      const calculatorBuild: RotationBuildProfile = { id: `talent-calculator-${slug}`, name: calculatorName, talentLoadout: calculatorLoadout, source: "custom", createdAt: timestamp, updatedAt: timestamp };
      setBuilds((current) => [current[0], calculatorBuild, ...current.filter((build) => build.id !== calculatorBuild.id && build.source === "custom")]);
      setSelectedBuildId(calculatorBuild.id);
      params.delete("talentLoadout");
      params.delete("talentBuildName");
      try { window.sessionStorage.removeItem(TALENT_HANDOFF_STORAGE_KEY); } catch { /* no-op */ }
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
      setNotice(ru ? "Билд из калькулятора подключён. Теперь выбери тип боя." : "Calculator build connected. Now choose an encounter.");
    }
  }, [hydrated, ru, slug, specialization]);
  useEffect(() => {
    onTalentLoadoutChange(selectedBuild?.talentLoadout ?? "");
  }, [onTalentLoadoutChange, selectedBuild?.talentLoadout]);
  useEffect(() => {
    if (!connectedTalentLoadout) return;
    setBuilds((current) => [baselineBuild, ...current.filter((build) => build.id !== referenceBuildId)]);
    setSelectedBuildId(referenceBuildId);
    setScores([]);
    setReadyComboId(null);
  }, [baselineBuild, connectedTalentLoadout, referenceBuildId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openNewBuild = () => { setBuildName(ru ? `Мой билд: ${specialization}` : `My ${specialization} build`); setTalentLoadout(""); setBuildEditor("new"); setError(""); };
  const openBuildEdit = () => {
    if (!selectedBuild) return;
    setBuildName(selectedBuild.source === "reference" ? `${selectedBuild.name} · ${ru ? "копия" : "copy"}` : selectedBuild.name);
    setTalentLoadout(selectedBuild.talentLoadout);
    setBuildEditor(selectedBuild.source === "reference" ? "new" : "edit");
    setError("");
  };
  const saveBuild = () => {
    const name = buildName.trim();
    const loadout = talentLoadout.trim();
    if (name.length < 2) return setError(ru ? "Дайте билду понятное имя." : "Give the build a clear name.");
    if (!validLoadout(loadout)) return setError(ru ? "Вставьте полную строку талантов из WoW без пробелов." : "Paste a complete WoW talent import string without spaces.");
    const timestamp = now();
    if (buildEditor === "edit" && selectedBuild?.source === "custom") {
      setBuilds((current) => current.map((build) => build.id === selectedBuild.id ? { ...build, name, talentLoadout: loadout, updatedAt: timestamp } : build));
      setCombos((current) => current.map((combo) => combo.buildId === selectedBuild.id ? { ...combo, buildName: name } : combo));
    } else {
      const build: RotationBuildProfile = { id: id(), name, talentLoadout: loadout, source: "custom", createdAt: timestamp, updatedAt: timestamp };
      setBuilds((current) => [...current, build]);
      setSelectedBuildId(build.id);
    }
    setBuildEditor(null);
    setNotice(ru ? "Билд сохранён в этом браузере." : "Build saved in this browser.");
  };
  const deleteBuild = () => {
    if (!selectedBuild || selectedBuild.source === "reference") return;
    setBuilds((current) => current.filter((build) => build.id !== selectedBuild.id));
    setCombos((current) => current.filter((combo) => combo.buildId !== selectedBuild.id));
    setSelectedBuildId(referenceBuildId);
    setBuildEditor(null);
    setNotice(ru ? "Билд и его комбинации удалены." : "Build and its combos were deleted.");
  };

  const optimize = async () => {
    if (!selectedBuild || optimizing) return;
    setOptimizing(true); setOptimizerStep(0); setOptimizerTotal(9); setScores([]); setSearchSpace(null); setError(""); setNotice("");
    try {
      // The candidate search is only needed after an explicit optimize action.
      const { generateAplCandidates, meaningfulDpsGain, verificationTolerance } = await import("@/lib/platform/rotation/aplOptimizer");
      const search = generateAplCandidates({ aplRules, scenario, targets, allowedAbilities: abilities.map((ability) => ability.id), limit: 8 });
      const candidates = search.candidates;
      setSearchSpace(search);
      setOptimizerTotal(candidates.length + 1);
      const measured: OptimizerScore[] = [];
      const reusableBaseline = Boolean(resultMatchesCurrent && currentResult
        && currentResult.scenario === scenario
        && currentResult.fightLengthSeconds === fightLength
        && currentResult.targets === targets);
      for (let index = 0; index < candidates.length; index += 1) {
        setOptimizerStep(index + 1);
        const candidate = candidates[index];
        const candidateApl = candidate.aplRules;
        if (candidate.id === "baseline" && reusableBaseline && currentResult) {
          measured.push({ ...candidate, candidateId: candidate.id, aplRules: candidateApl, dps: currentResult.dps, result: currentResult });
          setScores([...measured].sort((a, b) => b.dps - a.dps));
          continue;
        }
        const simulationInput: Record<string, unknown> = withCharacterContext({ spec: slug, scenario, fightLengthSeconds: fightLength, targets, rules: candidate.rules, aplRules: candidateApl, skipBaseline: true }, characterSlug, dataMode);
        if (validLoadout(selectedBuild.talentLoadout)) simulationInput.talentLoadout = selectedBuild.talentLoadout;
        const result = await simulateCandidate(simulationInput, lang);
        measured.push({ ...candidate, candidateId: candidate.id, aplRules: candidateApl, label: result.accuracy?.rotationSource === "simulationcraft-default-apl" ? "SimulationCraft APL" : candidate.label, dps: result.dps, result });
        setScores([...measured].sort((a, b) => b.dps - a.dps));
      }
      const baselineScore = measured.find((score) => score.candidateId === "baseline")!;
      const measuredBest = [...measured].sort((a, b) => b.dps - a.dps)[0];
      const significance = meaningfulDpsGain(baselineScore.dps, baselineScore.result.dpsError, measuredBest.dps, measuredBest.result.dpsError);
      const winner = measuredBest.candidateId !== "baseline" && significance.meaningful ? measuredBest : baselineScore;
      winner.meaningfulGain = winner.candidateId === "baseline" ? 0 : significance.gain;
      setOptimizerStep(candidates.length + 1);
      const verificationInput: Record<string, unknown> = withCharacterContext({ spec: slug, scenario, fightLengthSeconds: fightLength, targets, rules: winner.rules, aplRules: winner.aplRules, verificationRun: true }, characterSlug, dataMode);
      if (validLoadout(selectedBuild.talentLoadout)) verificationInput.talentLoadout = selectedBuild.talentLoadout;
      const verifiedResult = await simulateCandidate(verificationInput, lang);
      const verification = verificationTolerance(winner.result.dps, winner.result.dpsError, verifiedResult.dps, verifiedResult.dpsError);
      if (!verification.stable) throw new Error(ru ? `Победитель не прошёл повторную проверку: расхождение ${Math.round(verification.absoluteDelta)} DPS.` : `The winner failed verification: ${Math.round(verification.absoluteDelta)} DPS difference.`);
      winner.result = verifiedResult;
      winner.dps = verifiedResult.dps;
      winner.verified = true;
      winner.verificationDelta = verification.absoluteDelta;
      setScores([winner, ...measured.filter((score) => score !== winner).sort((a, b) => b.dps - a.dps)]);
      const timestamp = now();
      const sequence = winner.result.recommendedSequence?.length
        ? winner.result.recommendedSequence.slice(0, 16)
        : winner.result.casts.filter((cast) => cast.lane !== "proc").sort((a, b) => a.time - b.time).slice(0, 16).map((cast) => cast.abilityId);
      const encounterTargets = scenario === "aoe" ? targets : 1;
      const existing = combos.find((combo) => combo.buildId === selectedBuild.id && combo.scenario === scenario && (combo.targetCount ?? (combo.scenario === "aoe" ? 3 : 1)) === encounterTargets);
      const encounterName = rotationScenarioLabel(scenario, lang, encounterTargets);
      const combo: SavedRotationCombo = {
        id: existing?.id ?? id(), name: existing?.name ?? `${selectedBuild.name} · ${encounterName}`,
        nameSource: existing ? existing.nameSource : "generated",
		buildId: selectedBuild.id, buildName: selectedBuild.name, scenario, targetCount: encounterTargets, rules: [...winner.rules], aplRules: structuredClone(winner.aplRules), sequence, sequenceSource: "simulation-trace", abilities: winner.result.abilities,
        dps: winner.dps, engine: winner.result.engine, verified: true, verificationDelta: verification.absoluteDelta, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
      };
      setCombos((current) => existing ? current.map((item) => item.id === existing.id ? combo : item) : [combo, ...current]);
      setReadyComboId(combo.id);
      setNotice(ru ? "Победитель повторно проверен SimulationCraft, сохранён и готов к тренировке." : "The winner was verified by a fresh SimulationCraft run, saved, and is ready to train.");
      onOptimized(winner.result, combo);
    } catch (reason) {
      setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : (ru ? "Не удалось закончить сравнение. Проверьте соединение и повторите расчёт." : "Could not finish the comparison. Check your connection and run it again."));
    } finally {
      setOptimizing(false);
    }
  };

  const editCombo = (combo: SavedRotationCombo) => { setEditingComboId(combo.id); setComboName(comboLabel(combo)); setComboSequence([...combo.sequence]); };
  const saveCombo = () => {
    if (!editingComboId || !comboName.trim() || !comboSequence.length) return;
    setCombos((current) => current.map((combo) => combo.id === editingComboId ? { ...combo, name: comboName.trim(), nameSource: "custom", sequence: [...comboSequence], sequenceSource: "custom-apl", updatedAt: now() } : combo));
    setEditingComboId(null);
    setNotice(ru ? "Комбинация обновлена." : "Combo updated.");
  };
  const exportCombo = async (combo: SavedRotationCombo) => {
    const tag = encodeShareTag({ v: 1, spec: slug, name: comboLabel(combo), scenario: combo.scenario, targetCount: combo.targetCount, rules: combo.rules, aplRules: combo.aplRules, sequence: combo.sequence });
    setShareTag(tag);
    try {
      await navigator.clipboard.writeText(tag);
      setNotice(ru ? "Тег ротации скопирован. Отправьте его другу." : "Rotation tag copied. Send it to a friend.");
    } catch {
      setNotice(ru ? "Тег готов — скопируйте его из поля ниже." : "The tag is ready — copy it from the field below.");
    }
  };
  const importCombo = () => {
    const payload = decodeShareTag(shareTag);
    const allowed = new Set(abilities.map((ability) => ability.id));
    const valid = payload && payload.spec === slug
      && payload.name.trim().length > 0 && payload.name.length <= 64
      && (payload.targetCount === undefined || (Number.isInteger(payload.targetCount) && payload.targetCount >= 1 && payload.targetCount <= 8))
      && payload.rules.length > 0 && payload.rules.length <= 10 && new Set(payload.rules).size === payload.rules.length
      && payload.sequence.length > 0 && payload.sequence.length <= 32
      && payload.rules.every((ability) => allowed.has(ability)) && payload.sequence.every((ability) => allowed.has(ability))
      && (payload.aplRules === undefined || (Array.isArray(payload.aplRules) && validateAplRules(payload.aplRules, [...allowed]).valid
        && payload.aplRules.length === payload.rules.length
        && payload.aplRules.every((rule, index) => rule.abilityId === payload.rules[index])));
    if (!valid || !selectedBuild) {
      setError(ru ? "Тег повреждён или создан для другой специализации." : "The tag is invalid or belongs to another specialization.");
      return;
    }
    const timestamp = now();
    const combo: SavedRotationCombo = {
      id: id(), name: payload.name.trim(), buildId: selectedBuild.id, buildName: selectedBuild.name,
      scenario: payload.scenario, targetCount: payload.targetCount ?? (payload.scenario === "aoe" ? 3 : 1), rules: [...payload.rules], aplRules: payload.aplRules ? structuredClone(payload.aplRules) : undefined, sequence: [...payload.sequence],
      sequenceSource: "imported-tag", dps: 0, engine: "imported-tag", createdAt: timestamp, updatedAt: timestamp,
    };
    setCombos((current) => [combo, ...current]);
    setReadyComboId(combo.id);
    setShareTag("");
    setError("");
    setNotice(ru ? "Ротация импортирована. Запустите расчёт — DPS будет пересчитан на вашем персонаже." : "Rotation imported. Run a simulation to recalculate DPS for your character.");
  };
  const saveCurrentPriority = () => {
    if (!selectedBuild) return;
    const timestamp = now();
    const measured = resultMatchesCurrent ? currentResult : null;
    const combo: SavedRotationCombo = {
      id: id(),
      name: `${selectedBuild.name} · ${rotationScenarioLabel(scenario, lang, scenario === "aoe" ? targets : 1)}`,
      nameSource: "generated",
      buildId: selectedBuild.id,
      buildName: selectedBuild.name,
      scenario,
      targetCount: scenario === "aoe" ? targets : 1,
      rules: [...rules],
      aplRules: structuredClone(aplRules),
      sequence: measured?.recommendedSequence?.length ? measured.recommendedSequence.slice(0, 24) : [...rules],
      sequenceSource: measured ? "simulation-trace" : aplRules.every((rule) => rule.source === "maintained") ? "maintained-apl" : "custom-apl",
      abilities: measured?.abilities,
      dps: measured?.dps ?? 0,
      engine: measured?.engine ?? "not-simulated",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setCombos((current) => [combo, ...current]);
    setReadyComboId(combo.id);
    setNotice(measured ? (ru ? "Ротация и рассчитанный DPS сохранены." : "Rotation and simulated DPS saved.") : (ru ? "Панель сохранена. Запустите SimulationCraft, чтобы закрепить DPS." : "Panel saved. Run SimulationCraft to attach DPS."));
  };
  const moveComboStep = (index: number, direction: -1 | 1) => setComboSequence((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const scenarioName = rotationScenarioLabel(scenario, lang, targets);
  const targetCount = scenario === "aoe" ? targets : 1;
  const scoreTitle = (score: OptimizerScore) => {
    if (!ru) return score.label;
    if (score.mutation === "baseline") return "Текущая APL без изменений";
    if (score.mutation === "priority") return `Проверка порядка: ${score.label.replace("Priority", "места")}`;
    const abilityId = score.label.split(":")[0];
    if (score.mutation === "threshold") return `Другой порог: ${byId.get(abilityId)?.name ?? abilityId}${score.label.includes(":") ? ` → ${score.label.split(":").slice(1).join(":").trim()}` : ""}`;
    return `Другое состояние эффекта: ${byId.get(abilityId)?.name ?? abilityId}`;
  };
  const scoreReason = (score: OptimizerScore) => ru
    ? score.mutation === "baseline" ? "точка сравнения" : score.mutation === "priority" ? "поменяны местами только две соседние способности" : score.mutation === "threshold" ? "изменён только один ближайший порог" : "изменено только одно условие бафа или кулдауна"
    : score.reason;

  return (
    <>
    <section className={styles.buildStudio} aria-labelledby="build-studio-title">
      <header className={styles.simpleStudioHeader}>
        <div><span><Anvil /> {ru ? "КУЗНИЦА ПРОКАСТА" : "COMBO FORGE"}</span><h2 id="build-studio-title">{ru ? "Настрой бой. Получи последовательность." : "Set the fight. Get the sequence."}</h2><p>{ru ? "Выбери таланты и ситуацию — остальное лаборатория соберёт сама." : "Choose your talents and encounter; the lab handles the rest."}</p></div>
        <span className={styles.forgeOnline}><i /><span><small>{ru ? "ТРЕНАЖЁР ГОТОВ" : "TRAINER READY"}</small><strong>{specialization}</strong></span></span>
      </header>

      <div className={styles.forgeConsole}>
        <article className={`${styles.forgePanel} ${styles.forgeBuild}`}>
          <header><span><ShieldCheck /></span><div><small>{ru ? "БОЕВАЯ СБОРКА" : "COMBAT BUILD"}</small><h3>{ru ? "Таланты и приоритет" : "Talents and priority"}</h3></div></header>
          <label className={styles.buildSelect}><span>{ru ? "Билд" : "Build"}</span><select value={selectedBuildId} disabled={optimizing || buildEditor !== null} onChange={(event) => { setSelectedBuildId(event.target.value); setScores([]); setReadyComboId(null); setError(""); }}>{builds.map((build) => <option key={build.id} value={build.id}>{build.name}</option>)}</select></label>
          {!buildEditor && selectedBuild && <div className={styles.simpleBuildActions}>
            <span><Check /> {selectedBuild.source === "reference" ? (characterSlug && dataMode === "battle-net" ? (ru ? "Шмот и активные таланты подключены из Battle.net" : "Gear and active talents connected from Battle.net") : (ru ? "Базовый профиль спека подключён" : "Specialization baseline connected")) : (ru ? "Ваши таланты подключены" : "Your talents are connected")}</span>
            <div>
              {embedded ? <a href="#live-talents-heading"><Network /> {ru ? "Изменить таланты выше" : "Change talents above"}</a> : <Link href={talentCalculatorHref}><Network /> {ru ? "Выбрать таланты" : "Choose talents"}</Link>}
              <button type="button" onClick={selectedBuild.source === "reference" ? openNewBuild : openBuildEdit}>{selectedBuild.source === "reference" ? <ClipboardPaste /> : <Edit3 />}{ru ? "Вставить строку" : "Paste string"}</button>
            </div>
          </div>}
          {buildEditor && <div className={styles.buildEditor}>
            <label><span>{ru ? "Название билда" : "Build name"}</span><input value={buildName} maxLength={48} autoFocus onChange={(event) => setBuildName(event.target.value)} /></label>
            <label><span>{ru ? "Строка талантов из WoW" : "WoW talent import string"}</span><textarea value={talentLoadout} spellCheck={false} rows={4} onChange={(event) => setTalentLoadout(event.target.value.replace(/\s/g, ""))} placeholder={slug === "fury-warrior" ? `${FURY_REFERENCE_LOADOUT.slice(0, 28)}…` : (ru ? "Вставьте строку импорта…" : "Paste an import string…")} /></label>
            <p>{ru ? "Где взять: открой таланты в WoW → меню набора → Поделиться → Копировать строку импорта." : "In WoW: Talents → loadout menu → Share → Copy import string."}</p>
            <div><button type="button" className={styles.primaryMini} onClick={saveBuild}><Save /> {ru ? "Сохранить билд" : "Save build"}</button><button type="button" onClick={() => { setBuildEditor(null); setError(""); }}><X /> {ru ? "Отмена" : "Cancel"}</button>{buildEditor === "edit" && <button type="button" className={styles.dangerMini} onClick={deleteBuild}><Trash2 /> {ru ? "Удалить" : "Delete"}</button>}</div>
          </div>}
        </article>

        <article className={`${styles.forgePanel} ${styles.forgeEncounter}`}>
          <header><span><Crosshair /></span><div><small>{ru ? "УСЛОВИЯ БОЯ" : "ENCOUNTER"}</small><h3>{ru ? "Где проверяем билд" : "Where to test it"}</h3></div></header>
          <div className={styles.encounterChoices} role="radiogroup" aria-label={ru ? "Тип боя" : "Encounter type"}>
            {(["single-target", "aoe", "execute"] as const).map((item) => {
              const EncounterIcon = item === "single-target" ? Crosshair : item === "aoe" ? UsersRound : Skull;
              return <button key={item} type="button" role="radio" aria-checked={scenario === item} onClick={() => { setScores([]); setReadyComboId(null); onScenarioChange(item); }} disabled={optimizing}><EncounterIcon /> <span><strong>{item === "single-target" ? (ru ? "Одна цель" : "Single target") : item === "aoe" ? (ru ? "Пачка" : "AoE") : (ru ? "Добить" : "Execute")}</strong><small>{item === "single-target" ? (ru ? "босс или манекен" : "boss or dummy") : item === "aoe" ? (ru ? "пачка противников" : "enemy pack") : (ru ? "цель ниже 20%" : "target below 20%")}</small></span></button>;
            })}
          </div>
          <div className={styles.encounterOptions}>
            <label><span><Timer /> {ru ? "Длительность" : "Duration"}</span><select value={fightLength} disabled={optimizing} onChange={(event) => { setScores([]); setReadyComboId(null); onFightLengthChange(Number(event.target.value)); }}><option value="60">1:00</option><option value="120">2:00</option><option value="180">3:00</option><option value="300">5:00</option></select></label>
            {scenario === "aoe" && <label><span>{ru ? "Сколько целей" : "Targets"}</span><select value={targets} disabled={optimizing} onChange={(event) => { setScores([]); setReadyComboId(null); onTargetsChange(Number(event.target.value)); }}>{[2, 3, 5, 8].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
            <span className={styles.encounterReadout}><Target /><span><small>{ru ? "ЦЕЛЕЙ" : "TARGETS"}</small><strong>{targetCount}</strong></span></span>
          </div>
        </article>

        <aside className={styles.forgeLaunch} data-busy={optimizing || undefined}>
          <div className={styles.launchCore} aria-hidden="true"><i /><i /><Flame /></div>
          <span>{optimizing ? (ru ? "ИДЁТ РАСЧЁТ" : "CALCULATING") : (ru ? "ГОТОВО К ЗАПУСКУ" : "READY TO FORGE")}</span>
          <h3>{scenarioName}</h3>
          <p>{selectedBuild?.name}</p>
          <ul aria-label={ru ? "Параметры расчёта" : "Calculation settings"}><li><Timer /> {Math.floor(fightLength / 60)}:{String(fightLength % 60).padStart(2, "0")}</li><li><Target /> {targetCount}</li></ul>
          <button type="button" onClick={() => void optimize()} disabled={optimizing || buildEditor !== null}><Zap /> {optimizing ? (ru ? `${optimizerStep} из ${optimizerTotal}…` : `${optimizerStep} of ${optimizerTotal}…`) : (ru ? "Рассчитать прокаст" : "Calculate combo")}</button>
          {optimizing && <div className={styles.optimizerProgress} role="progressbar" aria-label={ru ? "Расчёт комбинации" : "Calculating combo"} aria-valuemin={0} aria-valuemax={optimizerTotal} aria-valuenow={optimizerStep}><span style={{ width: `${optimizerTotal ? (optimizerStep / optimizerTotal) * 100 : 0}%` }} /></div>}
        </aside>
      </div>

      {(notice || error || workspace.message || workspace.syncState === "saving") && <div className={error ? styles.buildError : styles.buildNotice} role={error ? "alert" : "status"}>{error || notice || workspace.message || (ru ? "Сохраняем в аккаунте…" : "Saving to account…")}</div>}

      {latestCombo && !optimizing && <section className={styles.readyCombo} aria-labelledby="ready-combo-title">
        <header><CircleCheckBig /><div><span>{ru ? "ПРОКАСТ ГОТОВ" : "COMBO READY"}</span><h3 id="ready-combo-title">{ru ? "Жми способности слева направо" : "Press abilities from left to right"}</h3><p>{ru ? "Тренажёр подсветит каждый шаг. Ошибка не сдвинет комбинацию дальше." : "The trainer highlights every step. A mistake will not advance the combo."}</p></div><strong>{compactDps(latestCombo.dps)} <small>DPS</small></strong></header>
        <div className={styles.readyComboTrack}>
          <ol aria-label={ru ? "Готовая последовательность" : "Ready sequence"}>{latestCombo.sequence.map((abilityId, index) => {
            const ability = byId.get(abilityId);
            if (!ability) return null;
            const visual = rotationAbilityVisual(ability.id, slug);
            const style = { ...rotationVisualStyle(visual), "--rt-ready-index": index } as CSSProperties;
            return <li key={`${abilityId}-${index}`} className={styles.readyComboStep} data-material={visual.material} style={style}><b><small>{ru ? "ШАГ" : "STEP"}</small>{index + 1}</b><span className={styles.readyComboArt}><RotationAbilitySigil visual={visual} className={styles.readyComboSigil} /><AbilityIcon ability={ability} /></span><span className={styles.readyComboName} title={ability.name}>{ability.name}</span>{index < latestCombo.sequence.length - 1 && <i aria-hidden="true">›</i>}</li>;
          })}</ol>
        </div>
        <footer><span><b>{latestCombo.sequence.length}</b> {ru ? "действий в комбинации" : "actions in this combo"}</span><button type="button" className={styles.readyTrain} onClick={() => onUseCombo(trainingCombo(latestCombo))}><Play /> {ru ? "Начать тренировку на 30 секунд" : "Start a 30-second drill"}</button><button type="button" onClick={() => editCombo(latestCombo)}><Edit3 /> {ru ? "Изменить порядок" : "Edit order"}</button></footer>
      </section>}

      {scores.length > 0 && !optimizing && <details className={styles.optimizerDetails} open>
        <summary>{ru ? "Почему выбран этот вариант?" : "Why was this option selected?"}<ChevronDown /></summary>
        <p>{ru ? `Проверено ${scores.length} из ${searchSpace?.considered ?? scores.length} валидных соседей APL для режима «${scenarioName}». Поиск ограничен ${searchSpace?.limit ?? 8} вариантами: исходный вариант, соседние перестановки, ближайшие пороги и состояния. Это локальный поиск, а не доказательство глобального максимума.` : `Tested ${scores.length} of ${searchSpace?.considered ?? scores.length} valid APL neighbors for ${scenarioName}. Search is capped at ${searchSpace?.limit ?? 8}: baseline, adjacent swaps, nearby thresholds, and states. This is a local search, not proof of a global maximum.`}</p>
        <ol className={styles.optimizerScores}>{scores.map((score, index) => <li key={JSON.stringify(score.aplRules)} className={index === 0 ? styles.optimizerWinner : ""}><b>{index + 1}</b><span><strong>{scoreTitle(score)}</strong><small>{scoreReason(score)} · {score.rules.slice(0, 3).map((rule) => byId.get(rule)?.name ?? rule).join(" → ")}</small></span><em>{compactDps(score.dps)}</em>{index === 0 && <i><Check /> {score.verified ? (ru ? `проверен · Δ ${Math.round(score.verificationDelta ?? 0)} · ±${Math.ceil(score.result.dpsError ?? 0)}` : `verified · Δ ${Math.round(score.verificationDelta ?? 0)} · ±${Math.ceil(score.result.dpsError ?? 0)}`) : (ru ? "выбран" : "selected")}</i>}</li>)}</ol>
      </details>}
    </section>

      <details className={styles.comboLibrary} open={Boolean(editingComboId) || buildCombos.length > 0}>
        <summary><LibraryBig /><span>{ru ? "Арсенал прокастов" : "Combo arsenal"}<small>{ru ? "Готовые последовательности для выбранного билда" : "Combat-ready sequences for the selected build"}</small></span><b><strong>{buildCombos.length}</strong><small>{ru ? "сохранено" : "saved"}</small></b><ChevronDown /></summary>
        <div className={styles.comboSection}>
          <div className={styles.rotationSaveBar}><span><b>{ru ? "Текущая панель" : "Current panel"}</b><small>{rules.map((rule) => byId.get(rule)?.name ?? rule).slice(0, 4).join(" → ")}{rules.length > 4 ? "…" : ""}</small></span><button type="button" onClick={saveCurrentPriority}><Save /> {ru ? "Сохранить ротацию" : "Save rotation"}</button></div>
          <div className={styles.rotationShare}><label><span>{ru ? "Тег ротации" : "Rotation tag"}</span><input value={shareTag} onChange={(event) => setShareTag(event.target.value)} placeholder={ru ? "Вставьте тег GLD1.…" : "Paste a GLD1.… tag"} /></label><button type="button" disabled={!shareTag.trim()} onClick={importCombo}><ClipboardPaste /> {ru ? "Импортировать" : "Import"}</button><small>{ru ? "Тег содержит порядок способностей, но не ваши предметы и не данные Battle.net." : "The tag contains ability order, not your items or Battle.net data."}</small></div>
          {!buildCombos.length ? <div className={styles.comboEmpty}><Anvil /><span><strong>{ru ? "Первое место в арсенале свободно" : "The first arsenal slot is empty"}</strong><small>{characterSlug && dataMode === "battle-net" ? (ru ? "Рассчитай прокаст — он сохранится в аккаунте и появится на другом устройстве." : "Calculate a combo and it will sync to your account and other devices.") : (ru ? "Рассчитай прокаст — он появится здесь автоматически и останется в браузере." : "Calculate a combo and it will be stored here automatically in this browser.")}</small></span></div> : <div className={styles.comboList}>{buildCombos.map((combo, comboIndex) => editingComboId === combo.id ? <article key={combo.id} className={styles.comboEditor}>
            <label><span>{ru ? "Название комбинации" : "Combo name"}</span><input value={comboName} maxLength={64} onChange={(event) => setComboName(event.target.value)} /></label>
            <ol>{comboSequence.map((abilityId, index) => { const ability = byId.get(abilityId); return ability ? <li key={`${abilityId}-${index}`}><b>{index + 1}</b><AbilityIcon ability={ability} size="sm" /><span>{ability.name}</span><button type="button" aria-label={`${ru ? "Переместить вверх" : "Move up"}: ${ability.name}`} disabled={index === 0} onClick={() => moveComboStep(index, -1)}><ArrowUp /></button><button type="button" aria-label={`${ru ? "Переместить вниз" : "Move down"}: ${ability.name}`} disabled={index === comboSequence.length - 1} onClick={() => moveComboStep(index, 1)}><ArrowDown /></button><button type="button" aria-label={`${ru ? "Удалить" : "Remove"}: ${ability.name}`} disabled={comboSequence.length <= 1} onClick={() => setComboSequence((current) => current.filter((_, step) => step !== index))}><X /></button></li> : null; })}</ol>
            <div className={styles.comboAdd}><select aria-label={ru ? "Добавляемая способность" : "Ability to add"} value={addAbility} onChange={(event) => setAddAbility(event.target.value)}>{abilities.filter((ability) => ability.id !== "bloodlust").map((ability) => <option key={ability.id} value={ability.id}>{ability.name}</option>)}</select><button type="button" onClick={() => addAbility && setComboSequence((current) => [...current, addAbility])}><Plus /> {ru ? "Добавить шаг" : "Add step"}</button></div>
            <footer><button type="button" className={styles.primaryMini} onClick={saveCombo}><Save /> {ru ? "Сохранить изменения" : "Save changes"}</button><button type="button" onClick={() => setEditingComboId(null)}><X /> {ru ? "Отмена" : "Cancel"}</button></footer>
          </article> : <article key={combo.id} className={styles.comboCard} style={{ "--combo-index": comboIndex } as CSSProperties}>
            <div className={styles.comboMeta}><span>{combo.scenario === "single-target" ? <Crosshair /> : combo.scenario === "aoe" ? <UsersRound /> : <Skull />}<small>{combo.scenario === "single-target" ? "ST" : combo.scenario === "aoe" ? (combo.targetCount === 2 ? "CL" : `A${combo.targetCount ?? 3}`) : "EX"}</small></span><div><strong>{comboLabel(combo)}</strong><small><em>{combo.dps > 0 ? `${compactDps(combo.dps)} DPS` : (ru ? "DPS не рассчитан" : "DPS not simulated")}</em>{combo.verified && <><i />✓ {ru ? "проверен" : "verified"}</>}<i />{combo.sequence.length} {ru ? "действий" : "actions"}<i />{new Date(combo.updatedAt).toLocaleDateString(ru ? "ru-RU" : "en-US")}</small></div></div>
            <ol aria-label={ru ? "Последовательность способностей" : "Ability sequence"}>{combo.sequence.slice(0, 10).map((abilityId, index) => { const ability = byId.get(abilityId); return ability ? <li key={`${abilityId}-${index}`} title={`${index + 1}. ${ability.name}`}><AbilityIcon ability={ability} size="sm" /></li> : null; })}{combo.sequence.length > 10 && <li className={styles.comboMore}>+{combo.sequence.length - 10}</li>}</ol>
            <div className={styles.comboActions}><button type="button" className={styles.comboUse} onClick={() => onUseCombo(trainingCombo(combo))}><Swords /> {ru ? "В тренировку" : "Train now"}</button><button type="button" title={ru ? "Поделиться тегом" : "Share tag"} aria-label={`${ru ? "Поделиться" : "Share"}: ${comboLabel(combo)}`} onClick={() => void exportCombo(combo)}><Share2 /></button><button type="button" title={ru ? "Изменить порядок" : "Edit order"} aria-label={`${ru ? "Изменить" : "Edit"}: ${comboLabel(combo)}`} onClick={() => editCombo(combo)}><Edit3 /></button><button type="button" title={ru ? "Удалить" : "Delete"} aria-label={`${ru ? "Удалить" : "Delete"}: ${comboLabel(combo)}`} onClick={() => setCombos((current) => current.filter((item) => item.id !== combo.id))}><Trash2 /></button></div>
          </article>)}</div>}
        </div>
      </details>
    </>
  );
}
