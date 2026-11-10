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
  let all: Realm[] = [], nodes: HTMLLIElement[] = [], shown: number[] = [], active = -1, generation = 0, disposed = false, renderFrame = 0;
  const choose = (realm: Realm) => { input.value = realm.name; input.dataset.slug = realm.slug; input.dataset.label = realm.name; };
  const chosen = () => input.dataset.slug && input.value === input.dataset.label ? input.dataset.slug : "";
  const activate = (index: number) => {
    nodes[active]?.setAttribute("aria-selected", "false");
    active = index;
    const node = nodes[active];
    if (!node) { input.removeAttribute("aria-activedescendant"); return; }
    node.setAttribute("aria-selected", "true"); input.setAttribute("aria-activedescendant", node.id);
    // Scroll the list only; scrollIntoView would also move the page.
    if (node.offsetTop < list.scrollTop) list.scrollTop = node.offsetTop;
    else if (node.offsetTop + node.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = node.offsetTop + node.offsetHeight - list.clientHeight;
  };
  const close = () => { cancelAnimationFrame(renderFrame); renderFrame = 0; list.hidden = true; input.setAttribute("aria-expanded", "false"); activate(-1); };
  const pick = (realm: Realm) => { choose(realm); close(); };
  // One node per realm of the region, built once: typing only toggles `hidden`,
  // so the full list scrolls like a select and a keystroke never rebuilds it.
  const build = () => {
    nodes = all.map((realm, index) => {
      const item = document.createElement("li"); item.id = `hub-realm-${index}`; item.role = "option"; item.setAttribute("aria-selected", "false"); item.textContent = realm.name;
      return item;
    });
    active = -1; list.replaceChildren(...nodes);
  };
  const render = () => {
    const slug = chosen(), query = slug ? "" : normalize(input.value.trim());
    shown = [];
    all.forEach((realm, index) => {
      const match = !query || realm.search.includes(query);
      if (nodes[index].hidden === match) nodes[index].hidden = !match;
      if (match) shown.push(index);
    });
    if (list.hidden !== !shown.length) list.hidden = !shown.length;
    input.setAttribute("aria-expanded", String(!list.hidden));
    list.scrollTop = 0;
    // A realm already chosen opens the whole list at that realm.
    activate(slug ? all.findIndex(realm => realm.slug === slug) : -1);
  };
  const load = async () => {
    const version = ++generation; all = []; close(); build(); input.setAttribute("aria-busy", "true");
    try { const result = await realms(region.value, locale); if (!disposed && version === generation) { all = result; build(); if (document.activeElement === input) render(); } }
    catch { /* Native free text lookup continues to work. Retry on next focus. */ }
    finally { if (version === generation) input.removeAttribute("aria-busy"); }
  };
  const open = () => { if (all.length) render(); else void load(); };
  const changeRegion = () => { input.value = ""; void load(); };
  const changeText = () => {
    cancelAnimationFrame(renderFrame);
    // Keep native text editing separate from the suggestion layout pass.
    renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (renderFrame && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) { cancelAnimationFrame(renderFrame); renderFrame = 0; render(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); if (list.hidden) { render(); if (active >= 0) return; } if (!shown.length) return;
      const position = shown.indexOf(active);
      activate(shown[event.key === "ArrowDown" ? (position + 1) % shown.length : position <= 0 ? shown.length - 1 : position - 1]);
    } else if (event.key === "Enter" && !list.hidden && active >= 0) { event.preventDefault(); pick(all[active]); }
    else if (event.key === "Escape") { if (!list.hidden) event.preventDefault(); close(); }
    else if (event.key === "Tab") close();
  };
  // A name typed in either language still resolves to the realm before the form is read.
  const submit = () => {
    if (!chosen()) { const text = input.value.trim(), realm = all.find(r => r.aliases.includes(normalize(text)) || r.slug === text); if (realm) choose(realm); }
    close();
  };
  const press = (event: Event) => event.preventDefault();
  const click = (event: Event) => { const item = (event.target as Element).closest("li"); if (item) { pick(all[nodes.indexOf(item)]); input.focus(); } };
  // Pressing an option or the scrollbar must not blur the field and close the list.
  list.addEventListener("mousedown", press); list.addEventListener("click", click);
  input.addEventListener("focus", open); input.addEventListener("click", open); input.addEventListener("input", changeText); input.addEventListener("keydown", keydown); input.addEventListener("blur", close);
  region.addEventListener("change", changeRegion); form.addEventListener("submit", submit);
  if (document.activeElement === input) open();
  return () => { disposed = true; generation++; close(); list.remove(); container.classList.remove(styles.realmCombo); for (const attribute of ["role", "aria-autocomplete", "aria-controls", "aria-expanded", "aria-activedescendant", "aria-busy"]) input.removeAttribute(attribute); input.removeEventListener("focus", open); input.removeEventListener("click", open); input.removeEventListener("input", changeText); input.removeEventListener("keydown", keydown); input.removeEventListener("blur", close); region.removeEventListener("change", changeRegion); form.removeEventListener("submit", submit); };
}
