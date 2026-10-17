let sequence = 0;

/** One inert viewport copy; offscreen descendants are never cloned. */
export function transitionSnapshot(frame: HTMLElement, className: string) {
  const visibleCopy = (source: Element): Element | null => {
    if (/^(SCRIPT|IFRAME|AUDIO|VIDEO)$/.test(source.tagName)) return null;
    const copy = source.cloneNode(false) as Element;
    const box = source.getBoundingClientRect();
    if (!box.width && !box.height && source instanceof HTMLElement && getComputedStyle(source).display === "none") return copy;
    if (box.width && box.height && (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth)) {
      // Empty boxes keep the layout of the visible siblings without copying
      // the contents of long tables/lists below the viewport.
      if (copy instanceof HTMLElement) { copy.style.width = `${box.width}px`; copy.style.height = `${box.height}px`; }
      return copy;
    }
    if (source instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
      // GPU-to-canvas copy rather than synchronous PNG/base64 encoding.
      try { copy.getContext("2d")?.drawImage(source, 0, 0); } catch { /* A protected canvas may be blank in this inert copy. */ }
    } else if (copy instanceof HTMLInputElement || copy instanceof HTMLTextAreaElement) {
      copy.value = ""; copy.removeAttribute("value");
    } else for (const child of source.childNodes) {
      const frozen = child instanceof Element ? visibleCopy(child) : child.cloneNode();
      if (frozen) copy.append(frozen);
    }
    return copy;
  };
  const viewport = document.createElement("div");
  viewport.className = className;
  // RouteTransitionGate changes its atlas scope when the destination is home.
  // The outgoing copy must keep its own scope until the ice has left, otherwise
  // its inherited tokens/fonts disappear and the frozen page reflows mid-turn.
  const scope = frame.closest<HTMLElement>(".workspace-content");
  if (scope) viewport.classList.add(...scope.classList);
  viewport.style.cssText = `position:absolute;inset:0;overflow:hidden;width:${innerWidth}px;height:${innerHeight}px`;
  const capture = (source: HTMLElement) => {
    const copy = visibleCopy(source) as HTMLElement | null;
    if (!copy) return;
    const box = source.getBoundingClientRect();
    copy.removeAttribute("data-book-route-frame"); copy.removeAttribute("data-route-state");
    copy.style.cssText = `position:absolute;top:${box.top}px;left:${box.left}px;width:${box.width}px;margin:0;opacity:1;transform:none`;
    viewport.append(copy);
  };
  capture(frame);
  for (const layer of document.querySelectorAll<HTMLElement>("header[data-atlas-scope], dialog[open]")) if (!frame.contains(layer)) capture(layer);
  const prefix = `route-snapshot-${++sequence}-`, ids = new Map<string, string>();
  viewport.querySelectorAll("[id]").forEach(element => { const id = element.id; element.id = prefix + id; ids.set(id, element.id); });
  viewport.querySelectorAll("*").forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === "id") continue;
      let value = attribute.value.replace(/url\(["']?#([^\s)"']+)["']?\)/g, (match, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#") && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  });
  return viewport;
}
