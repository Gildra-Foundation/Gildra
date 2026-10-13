"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FolderOpen, Plus, Save, Target, Trash2 } from "lucide-react";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { useCharacterWorkspaceDocument } from "@/lib/wow/useCharacterWorkspaceDocument";
import { talentText, localizedTalentScenarios, type TalentLang } from "@/components/talents/talentLocale";
import styles from "./characterBuildManager.module.css";
import book from "./talentBookLeaves.module.css";

type SavedBuild = {
  id: string;
  name: string;
  loadout: string;
  scenario: TalentScenarioId;
  savedAt: string;
  buildVersion: string;
};

const emptyBuilds: SavedBuild[] = [];
function validBuilds(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is SavedBuild => Boolean(entry && typeof entry === "object" && (entry as SavedBuild).id && (entry as SavedBuild).loadout && (entry as SavedBuild).name)).slice(0, 12) : [];
}

function buildId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CharacterBuildManager({
  lang = "ru",
  characterSlug,
  specSlug,
  dataMode,
  buildVersion,
  currentLoadout,
  scenario,
  onScenarioChange,
  onLoad,
}: {
  lang?: TalentLang;
  characterSlug: string;
  specSlug: string;
  dataMode: "fixture" | "battle-net";
  buildVersion: string;
  currentLoadout: string;
  scenario: TalentScenarioId;
  onScenarioChange: (scenario: TalentScenarioId) => void;
  onLoad: (loadout: string, scenario: TalentScenarioId) => boolean;
}) {
  const talentScenarios = useMemo(() => localizedTalentScenarios(lang), [lang]);
  const pveModes = talentScenarios.filter((entry) => entry.group === "PvE");
  const storageKey = useMemo(() => `gildra:character-talents:build-library:v2:${dataMode}:${characterSlug}:${specSlug}:${buildVersion}`, [buildVersion, characterSlug, dataMode, specSlug]);
  const { value: builds, setValue: setBuilds, hydrated, syncState, message: syncMessage } = useCharacterWorkspaceDocument({
    lang, enabled: dataMode === "battle-net", characterSlug, specializationSlug: specSlug, kind: "talent-builds",
    localStorageKey: storageKey, initialValue: emptyBuilds, validate: validBuilds,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setActiveId(null);
    setName("");
    setMessage("");
  }, [storageKey]);

  const persist = (next: SavedBuild[]) => {
    setBuilds(next);
  };

  const save = () => {
    const selectedMode = talentScenarios.find((entry) => entry.id === scenario);
    const trimmed = name.trim();
    const finalName = trimmed || `${selectedMode?.label ?? talentText(lang, "Билд")} · ${new Date().toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}`;
    const entry: SavedBuild = {
      id: activeId ?? buildId(),
      name: finalName,
      loadout: currentLoadout,
      scenario,
      savedAt: new Date().toISOString(),
      buildVersion,
    };
    const next = [entry, ...builds.filter((build) => build.id !== entry.id)].slice(0, 12);
    persist(next);
    setActiveId(entry.id);
    setName(finalName);
    setMessage(activeId ? talentText(lang, "Изменения сохранены.") : dataMode === "battle-net" ? talentText(lang, "Билд сохраняется в аккаунте.") : talentText(lang, "Билд сохранён на этом устройстве."));
  };

  const load = (build: SavedBuild) => {
    if (!onLoad(build.loadout, build.scenario)) {
      setMessage(talentText(lang, "Этот билд создан для другой версии дерева и больше не загружается."));
      return;
    }
    setActiveId(build.id);
    setName(build.name);
    onScenarioChange(build.scenario);
    setMessage(lang === "ru" ? `Загружен билд «${build.name}».` : `Loaded build “${build.name}”.`);
  };

  const remove = (id: string) => {
    persist(builds.filter((build) => build.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setName("");
    }
    setMessage(talentText(lang, "Сохранённый билд удалён."));
  };

  return <section className={`${styles.manager} ${book.manager}`} aria-labelledby="build-manager-title">
    <div className={styles.heading}>
      <span><Target aria-hidden="true" /></span>
      <div><small>{talentText(lang, "ШАГ 1")}</small><h3 id="build-manager-title">{talentText(lang, "Выберите, где будете играть")}</h3><p>{talentText(lang, "Режим меняет цели, число противников и главный показатель расчёта.")}</p></div>
    </div>
    <div className={`${styles.modes} ${book.modes}`} role="group" aria-label={talentText(lang, "Режим расчёта")}>
      {pveModes.map((mode) => <button data-folio-choice key={mode.id} type="button" aria-pressed={scenario === mode.id} onClick={() => onScenarioChange(mode.id)}>
        <span>{scenario === mode.id ? <Check aria-hidden="true" /> : null}<b>{mode.label}</b><small>{mode.fight}</small></span>
        <em>{mode.priority}</em>
      </button>)}
    </div>
    <p className={styles.modeNote}>{talentText(lang, "Режим задаёт условия сравнения, но не меняет таланты. Измените их ниже — результат пересчитается для выбранного боя.")}</p>

    <div className={`${styles.libraryHead} ${book.leaves}`}>
      <div><small>{talentText(lang, "СОХРАНЕНИЕ")}</small><h3>{talentText(lang, "Мои варианты")}</h3></div>
      <button type="button" className={styles.newButton} data-folio-action="quiet" onClick={() => { setActiveId(null); setName(""); setMessage(talentText(lang, "Введите название и сохраните текущий набор как новый.")); }}><Plus />{talentText(lang, "Новый вариант")}</button>
    </div>
    <div className={`${styles.saveRow} ${book.leaves}`} data-folio-tools data-folio-fields>
      <label htmlFor="character-build-name"><span>{talentText(lang, "Название билда")}</span><input id="character-build-name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder={talentText(lang, "Например: Мифик+ — большие паки")} /></label>
      <button type="button" onClick={save}><Save />{activeId ? talentText(lang, "Обновить") : talentText(lang, "Сохранить")}</button>
    </div>
    {builds.length ? <div className={`${styles.builds} ${book.leaves}`} aria-label={talentText(lang, "Сохранённые билды")}>{builds.map((build) => {
      const mode = talentScenarios.find((entry) => entry.id === build.scenario);
      return <article key={build.id} data-active={activeId === build.id}>
        <button type="button" className={styles.loadButton} onClick={() => load(build)}><FolderOpen /><span><b>{build.name}</b><small>{mode?.label ?? build.scenario} · {new Date(build.savedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}</small></span></button>
        <button type="button" className={styles.deleteButton} aria-label={`${lang === "ru" ? "Удалить билд" : "Delete build"} ${build.name}`} onClick={() => remove(build.id)}><Trash2 /></button>
      </article>;
    })}</div> : <div className={styles.empty} data-book-empty>{talentText(lang, "Сохранённых вариантов пока нет. Настройте таланты ниже и нажмите «Сохранить».")}</div>}
    <p className={styles.message} aria-live="polite">{message || syncMessage || (dataMode === "battle-net" && hydrated ? syncState === "saving" ? talentText(lang, "Синхронизация…") : syncState === "synced" ? talentText(lang, "Сохранено в вашем профиле Gildra.") : "" : "")}</p>
  </section>;
}
