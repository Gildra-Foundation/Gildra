"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Plus, Save, Trash2 } from "lucide-react";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { useCharacterWorkspaceDocument } from "@/lib/wow/useCharacterWorkspaceDocument";
import { talentText, localizedTalentScenarios, type TalentLang } from "@/components/talents/talentLocale";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import styles from "./characterBuildManager.module.css";
import tools from "./characterTools.module.css";

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
  const storageKey = useMemo(() => `gildra:character-talents:build-library:v2:${dataMode}:${characterSlug}:${specSlug}:${buildVersion}`, [buildVersion, characterSlug, dataMode, specSlug]);
  const { value: builds, setValue: setBuilds, message: syncMessage } = useCharacterWorkspaceDocument({
    lang, enabled: dataMode === "battle-net", characterSlug, specializationSlug: specSlug, kind: "talent-builds",
    localStorageKey: storageKey, initialValue: emptyBuilds, validate: validBuilds,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState(storageKey);
  if (scope !== storageKey) { setScope(storageKey); setActiveId(null); setName(""); setMessage(""); }
  const date = (value: string | number) => new Date(value).toLocaleDateString(lang === "en" ? "en-US" : "ru-RU");

  const save = () => {
    const selectedMode = talentScenarios.find((entry) => entry.id === scenario);
    const finalName = name.trim() || `${selectedMode?.label ?? talentText(lang, "Билд")} · ${date(Date.now())}`;
    const entry: SavedBuild = { id: activeId ?? buildId(), name: finalName, loadout: currentLoadout, scenario, savedAt: new Date().toISOString(), buildVersion };
    setBuilds([entry, ...builds.filter((build) => build.id !== entry.id)].slice(0, 12));
    setActiveId(entry.id);
    setName(finalName);
    setMessage(talentText(lang, "Сохранено"));
  };

  const load = (build: SavedBuild) => {
    if (!onLoad(build.loadout, build.scenario)) {
      setMessage(talentText(lang, "Этот билд больше не подходит к дереву талантов."));
      return;
    }
    setActiveId(build.id);
    setName(build.name);
    onScenarioChange(build.scenario);
    setMessage("");
  };

  const remove = (id: string) => {
    setBuilds(builds.filter((build) => build.id !== id));
    if (activeId === id) { setActiveId(null); setName(""); }
    setMessage("");
  };

  return <section className={`${tools.tool} ${styles.manager}`} aria-labelledby="build-manager-title">
    <div className={tools.head}>
      <h3 className={tools.title} id="build-manager-title">{talentText(lang, "Мои билды")}</h3>
      {activeId ? <button type="button" className={tools.quiet} onClick={() => { setActiveId(null); setName(""); setMessage(""); }}><Plus aria-hidden="true" />{talentText(lang, "Новый вариант")}</button> : null}
    </div>
    <form className={styles.saveRow} onSubmit={(event) => { event.preventDefault(); save(); }}>
      <label className={tools.field} htmlFor="character-build-name"><span className={tools.srOnly}>{talentText(lang, "Название билда")}</span><input id="character-build-name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder={talentText(lang, "Название билда")} /></label>
      <MaterialButton kit={TALENTS_KIT} fit="stack" type="submit" icon={<Save aria-hidden="true" />}>{activeId ? talentText(lang, "Обновить") : talentText(lang, "Сохранить")}</MaterialButton>
    </form>
    {builds.length ? <ul className={styles.builds} aria-label={talentText(lang, "Сохранённые билды")}>{builds.map((build) => {
      const mode = talentScenarios.find((entry) => entry.id === build.scenario);
      return <li key={build.id} data-active={activeId === build.id || undefined}>
        <button type="button" className={styles.loadButton} onClick={() => load(build)}><FolderOpen aria-hidden="true" /><span><b>{build.name}</b><small>{mode?.label ?? build.scenario} · {date(build.savedAt)}</small></span></button>
        <button type="button" className={tools.quiet} aria-label={`${talentText(lang, "Удалить билд")} ${build.name}`} onClick={() => remove(build.id)}><Trash2 aria-hidden="true" /></button>
      </li>;
    })}</ul> : null}
    {message || syncMessage ? <p className={tools.status} aria-live="polite">{message || syncMessage}</p> : null}
  </section>;
}
