import { homeLookupCopy } from "./homeLookupCopy";
import styles from "./wowHome.module.css";
type Realm = { slug: string; name: string; search: string; aliases: string[] };
const cache = new Map<string, Promise<Realm[]>>();
const normalize = (text: string) => text.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
function realms(region: string, locale: "ru" | "en") {
  const key = `${region}:${locale}`;
  if (!cache.has(key)) cache.set(key, Promise.allSettled(([locale, locale === "ru" ? "en" : "ru"] as const).map(async lang => {
    const response = await fetch(`/api/wow/auction?${new URLSearchParams({ action: "realms", region, lang })}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("realms unavailable");
    const data = await response.json();
    if (!Array.isArray(data.realms)) throw new Error("invalid realms");
    return data.realms.filter((r: Realm) => typeof r.slug === "string" && typeof r.name === "string") as Realm[];
  })).then(results => {
    const primary = results[0].status === "fulfilled" ? results[0].value : results[1].status === "fulfilled" ? results[1].value : null;
    if (!primary) { cache.delete(key); throw new Error("realms unavailable"); }
    const aliases = new Map(results.flatMap(result => result.status === "fulfilled" ? result.value : []).map(r => [r.slug, r.name]));
    return primary.map(r => ({ ...r, aliases: [normalize(r.name), normalize(aliases.get(r.slug) ?? "")], search: normalize(`${r.name} ${r.slug} ${aliases.get(r.slug) ?? ""}`) }));
  }));
  return cache.get(key)!;
}

/** ARIA 1.2 listbox enhancement. The original named input also remains the offline/no-JS fallback. */
export function enhanceRealmPicker(form: HTMLFormElement, locale: "ru" | "en") {
  const input = form.querySelector<HTMLInputElement>("#hub-realm")!, region = form.querySelector<HTMLSelectElement>("#hub-region")!;
  const container = input.parentElement!;
  container.classList.add(styles.realmCombo);
  const list = document.createElement("ul");
  list.id = "hub-realm-options"; list.className = styles.realmOptions; list.role = "listbox";
  list.setAttribute("aria-label", homeLookupCopy[locale].realms); list.hidden = true;
  container.append(list);
  input.role = "combobox"; input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
  let all: Realm[] = [], shown: Realm[] = [], active = -1, generation = 0, disposed = false, chosen = "", chosenText = "", renderFrame = 0;
  const close = () => { cancelAnimationFrame(renderFrame); renderFrame = 0; list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const remember = () => { try { localStorage.setItem("gildra:hero-lookup", JSON.stringify({ region: region.value, realm: chosen || input.value })); } catch { /* Private mode */ } };
  const pick = (realm: Realm) => { chosen = realm.slug; chosenText = realm.name; input.value = realm.name; close(); remember(); };
  const highlight = () => {
    [...list.children].forEach((node, index) => node.setAttribute("aria-selected", String(index === active)));
    if (active >= 0) { input.setAttribute("aria-activedescendant", `hub-realm-${active}`); list.children[active]?.scrollIntoView({ block: "nearest" }); }
  };
  // Reuse four option elements: replacing the list on every key invalidates
  // selectors and layout throughout the large hub, even for a tiny query.
  const options = Array.from({ length: 4 }, (_, index) => {
    const item = document.createElement("li"); item.id = `hub-realm-${index}`; item.role = "option"; item.hidden = true; item.setAttribute("aria-selected", "false"); item.append(document.createTextNode(""));
    item.addEventListener("pointerdown", event => event.preventDefault());
    item.addEventListener("click", () => { if (shown[index]) { pick(shown[index]); input.focus(); } });
    list.append(item);
    return item;
  });
  const render = () => {
    const query = normalize(input.value.trim());
    shown = all.filter(r => !query || r.search.includes(query)).slice(0, options.length); active = -1;
    input.removeAttribute("aria-activedescendant");
    options.forEach((item, index) => {
      const realm = shown[index];
      if (item.hidden !== !realm) item.hidden = !realm;
      if (realm && item.firstChild!.nodeValue !== realm.name) item.firstChild!.nodeValue = realm.name;
      if (item.getAttribute("aria-selected") !== "false") item.setAttribute("aria-selected", "false");
    });
    if (list.hidden !== !shown.length) list.hidden = !shown.length;
    const expanded = String(!list.hidden);
    if (input.getAttribute("aria-expanded") !== expanded) input.setAttribute("aria-expanded", expanded);
  };
  const load = async () => {
    const version = ++generation; all = []; close(); input.setAttribute("aria-busy", "true");
    try { const result = await realms(region.value, locale); if (!disposed && version === generation) { all = result; if (document.activeElement === input) render(); } }
    catch { /* Native free text lookup continues to work. Retry on next focus. */ }
    finally { if (version === generation) input.removeAttribute("aria-busy"); }
  };
  const focus = () => { if (all.length) render(); else void load(); };
  const changeRegion = () => { input.value = ""; chosen = ""; chosenText = ""; remember(); void load(); };
  const changeText = () => {
    chosen = ""; chosenText = "";
    cancelAnimationFrame(renderFrame);
    // Keep native text editing separate from the suggestion layout pass.
    renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (renderFrame && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) { cancelAnimationFrame(renderFrame); renderFrame = 0; render(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); if (list.hidden) render(); if (!shown.length) return;
      active = event.key === "ArrowDown" ? (active + 1) % shown.length : active <= 0 ? shown.length - 1 : active - 1; highlight();
    } else if (event.key === "Enter" && !list.hidden && active >= 0) { event.preventDefault(); pick(shown[active]); }
    else if (event.key === "Escape") { if (!list.hidden) event.preventDefault(); close(); }
    else if (event.key === "Tab") close();
  };
  const submit = () => {
    if (input.value !== chosenText) chosen = all.find(r => r.aliases.includes(normalize(input.value.trim())) || r.slug === input.value.trim())?.slug ?? "";
    if (chosen) input.value = chosen;
    remember(); close();
  };
  input.addEventListener("focus", focus); input.addEventListener("input", changeText); input.addEventListener("keydown", keydown); input.addEventListener("blur", close);
  region.addEventListener("change", changeRegion); form.addEventListener("submit", submit);
  if (document.activeElement === input) focus();
  return () => { disposed = true; generation++; close(); list.remove(); container.classList.remove(styles.realmCombo); for (const attribute of ["role", "aria-autocomplete", "aria-controls", "aria-expanded", "aria-activedescendant", "aria-busy"]) input.removeAttribute(attribute); input.removeEventListener("focus", focus); input.removeEventListener("input", changeText); input.removeEventListener("keydown", keydown); input.removeEventListener("blur", close); region.removeEventListener("change", changeRegion); form.removeEventListener("submit", submit); };
}
