"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AtlasButton, AtlasInput, AtlasField, AtlasNotice } from "@/components/atlas";
import { useTalentBuildLibrary } from "@/lib/wow/useTalentBuildLibrary";
import { characterBuildLimit, recoverLegacyCharacterBuilds, type SavedCharacterBuild } from "@/lib/wow/talentBuildLibrary";
import { talentLoadoutHeroId } from "@/lib/wowTalentLoadout";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import styles from "./characterProfileMvp.module.css";

export function CharacterTalentBuilds({ owner, characterSlug, specSlug, currentLoadout, data, lang }: {
 owner: string; characterSlug: string; specSlug: string; currentLoadout?: string; data: TalentCalculatorData; lang: "ru" | "en";
}) {
  const ru = lang === "ru", prefix = ru ? "/ru" : "";
  const { library, status, storageFailed, update, retry } = useTalentBuildLibrary(owner, characterSlug, specSlug);
  const [name, setName] = useState(""); const [code, setCode] = useState(currentLoadout ?? "");
  const [codeVersion, setCodeVersion] = useState(data.buildVersion);
  const [active, setActive] = useState<string | null>(null); const [message, setMessage] = useState("");
  const [legacy, setLegacy] = useState<SavedCharacterBuild[] | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href), imported = url.searchParams.get("talentLoadout");
    if (!imported) return;
    if ((!url.searchParams.get("talentBuildVersion") || url.searchParams.get("talentBuildVersion") === data.buildVersion) && talentLoadoutHeroId(data, imported)) { setCode(imported); setName((url.searchParams.get("talentBuildName") ?? "").slice(0, 48)); }
    else setMessage(ru ? "Билд не подходит к этой специализации или версии дерева." : "The build does not match this specialization or tree version.");
    url.searchParams.delete("talentLoadout"); url.searchParams.delete("talentBuildName"); url.searchParams.delete("talentBuildVersion");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [data, ru]);
  const selectedHeroId = talentLoadoutHeroId(data, code);
  const valid = codeVersion === data.buildVersion && selectedHeroId !== null;
  const full = !active && library.builds.length >= characterBuildLimit;
  const editor = new URLSearchParams({ returnTo: `${prefix}/wow/characters/${characterSlug}`, buildVersion: data.buildVersion, hero: String(selectedHeroId ?? data.heroSubtreeId) });
  if (valid) editor.set("import", code);
  function save() {
    if (!valid || !name.trim() || full || status === "loading") return;
    const id = active ?? crypto.randomUUID();
    update({ ...library, builds: [{ id, name: name.trim(), loadout: code, buildVersion: data.buildVersion, savedAt: new Date().toISOString(), scenario: "mythic-plus" }, ...library.builds.filter(b => b.id !== id)] });
    setActive(id); setMessage("");
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage(ru ? "Скопировано." : "Copied."); }
    catch { setMessage(ru ? "Копирование недоступно. Выделите код в поле и скопируйте вручную." : "Clipboard unavailable. Select and copy the code from the field."); }
  }
  const syncLabel = { limit: ru ? "После объединения устройств превышен лимит 12 билдов. Удалите лишние; все записи сохранены локально." : "Merging devices exceeded the 12-build limit. Remove extras; every build is kept locally.", rejected: ru ? "Сервер отклонил изменение. Локальная копия сохранена; повторите синхронизацию." : "The server rejected this change. Your local copy is retained; retry synchronization.", loading: ru ? "Загрузка билдов…" : "Loading builds…", saving: ru ? "Сохранение…" : "Saving…", synced: ru ? "Сохранено в аккаунте" : "Saved to your account", offline: ru ? "Сервер недоступен. Изменения сохранены на этом устройстве." : "Server unavailable. Changes are saved on this device.", expired: ru ? "Сессия истекла. Подключите Battle.net повторно; локальная копия сохранена." : "Session expired. Reconnect Battle.net; your local copy is safe." }[status];
  return <div className={styles.builds}>
    <div className={styles.actions}><Link className={styles.button} href={`${prefix}/talents/${specSlug}?${editor}`}>{ru ? "Изменить таланты" : "Edit talents"}</Link><AtlasButton variant="secondary" onClick={() => { setActive(null); setName(""); setCode(currentLoadout ?? ""); setCodeVersion(data.buildVersion); setMessage(""); }}>{ru ? "Новый билд" : "New build"}</AtlasButton></div>
    <AtlasField label={ru ? "Название" : "Name"} htmlFor="build-name"><AtlasInput id="build-name" maxLength={48} value={name} onChange={e => setName(e.target.value)} /></AtlasField>
    <AtlasField label={ru ? "Код талантов из игры" : "In-game talent code"} htmlFor="build-code"><textarea id="build-code" className={styles.code} value={code} onChange={e => { setCode(e.target.value.trim()); setCodeVersion(data.buildVersion); }} spellCheck={false} rows={3} /></AtlasField>
    {code && !valid && <p role="alert">{ru ? "Неверный код, другая специализация или версия дерева. Экспортируйте актуальный код из игры." : "Invalid code, specialization or tree version. Export a current code from the game."}</p>}
    {full && <AtlasNotice title={ru ? "Достигнут лимит новых билдов" : "New build limit reached"}>{ru ? "Обновите существующий билд или удалите ненужный, чтобы добавить новый. Старые записи сохранены." : "Update an existing build or remove one before adding another. Older records are preserved."}</AtlasNotice>}
    <div className={styles.actions}><AtlasButton disabled={!valid || !name.trim() || full || status === "loading"} onClick={save}>{active ? ru ? "Обновить билд" : "Update build" : ru ? "Сохранить билд" : "Save build"}</AtlasButton><AtlasButton variant="secondary" disabled={!code} onClick={() => void copy(code)}>{ru ? "Копировать код" : "Copy code"}</AtlasButton><AtlasButton variant="secondary" disabled={!valid} onClick={() => {
      const share = new URL(`${prefix}/talents/${specSlug}`, window.location.origin); share.searchParams.set("import", code); share.searchParams.set("buildVersion", data.buildVersion); share.searchParams.set("hero", String(selectedHeroId ?? data.heroSubtreeId)); void copy(share.toString());
    }}>{ru ? "Поделиться" : "Share"}</AtlasButton></div>
    <p role="status">{storageFailed && status !== "synced" ? ru ? "Изменения ещё не сохранены. Оставьте страницу открытой и повторите запрос." : "Changes are not saved yet. Keep this page open and retry." : syncLabel}</p>
    {message && <p role="status">{message}</p>}
    {storageFailed && <p role="alert">{ru ? "Браузер не сохранил локальную копию. Дождитесь подтверждения сервера перед уходом." : "The browser could not save a local copy. Wait for server confirmation before leaving."}</p>}
    {(["offline", "expired", "limit", "rejected"].includes(status)) && <div className={styles.actions}><AtlasButton variant="secondary" onClick={retry}>{ru ? "Повторить" : "Retry"}</AtlasButton>{status === "expired" && <Link href={`${prefix}/login`}>{ru ? "Войти" : "Sign in"}</Link>}</div>}
    <ul className={styles.savedBuilds}>{library.builds.map(build => <li key={build.id}><div><strong>{build.name}</strong><small>{build.buildVersion} · {new Date(build.savedAt).toLocaleDateString(ru ? "ru-RU" : "en-GB")}</small></div><AtlasButton variant="secondary" onClick={() => {
      if (build.buildVersion !== data.buildVersion || !talentLoadoutHeroId(data, build.loadout)) { setMessage(ru ? "Билд сохранён для другой версии дерева. Его код сохранён; скопируйте его для ручного обновления." : "This build uses a different tree version. Its code is preserved; copy it to update manually."); setActive(null); setName(build.name); setCode(build.loadout); setCodeVersion(build.buildVersion); return; }
      setActive(build.id); setName(build.name); setCode(build.loadout); setCodeVersion(build.buildVersion); setMessage("");
    }}>{ru ? "Загрузить" : "Load"}</AtlasButton><AtlasButton variant="ghost" onClick={() => { update({ ...library, builds: library.builds.filter(b => b.id !== build.id), deleted: { ...library.deleted, [build.id]: new Date().toISOString() } }); if (active === build.id) setActive(null); }} aria-label={`${ru ? "Удалить" : "Delete"} ${build.name}`}>{ru ? "Удалить" : "Delete"}</AtlasButton></li>)}</ul>
    <details><summary>{ru ? "Билды из прежней версии сайта" : "Builds from the previous site version"}</summary>
      <p>{ru ? "Старые записи в этом браузере не привязаны к аккаунту. Найдите билды этого персонажа и выберите, какие добавить в текущий аккаунт." : "Old browser records have no account owner. Find this character’s builds and choose which to add to your current account."}</p>
      <AtlasButton variant="secondary" onClick={() => {
        try { setLegacy(recoverLegacyCharacterBuilds(localStorage, characterSlug, specSlug)); }
        catch { setMessage(ru ? "Браузер запретил чтение локальных записей." : "The browser blocked access to local records."); }
      }}>{ru ? "Найти на этом устройстве" : "Find on this device"}</AtlasButton>
      {legacy !== null && !legacy.length && <p>{ru ? "Старых билдов этого персонажа не найдено." : "No old builds found for this character."}</p>}
      <ul className={styles.savedBuilds}>{legacy?.filter(build => !library.builds.some(saved => saved.id === build.id) && !Object.hasOwn(library.deleted, build.id)).map(build => <li key={build.id}>
        <div><strong>{build.name}</strong><small>{build.buildVersion}</small></div>
        <AtlasButton variant="secondary" disabled={library.builds.length >= characterBuildLimit || status === "loading"} onClick={() => update({ ...library, builds: [...library.builds, build] })}>{ru ? "Добавить в аккаунт" : "Add to account"}</AtlasButton>
        <AtlasButton variant="ghost" onClick={() => void copy(build.loadout)}>{ru ? "Копировать код" : "Copy code"}</AtlasButton>
      </li>)}</ul>
    </details>
  </div>;
}
