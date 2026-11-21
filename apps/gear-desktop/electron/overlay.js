(() => {
  // Read the current character tab, including the user's selected result.
  // Closed disclosures and inactive tabs can contain older suggestions.
  const root = document.querySelector('[data-tool-panel="upgrades"]');
  const visible = node => node && node.getClientRects().length && !node.closest('[hidden]');
  if (!visible(root)) return null;
  const text = node => (node?.innerText || '').replace(/\s+/g, ' ').trim();
  const first = (s, base = root) => [...base.querySelectorAll(s)].find(visible);
  const nameOf = node => node?.querySelector('button[data-quality]')?.getAttribute('aria-label')?.replace(/\. (?:Описание предмета|Item details)$/, '') || '';
  const parts = [];
  const add = (s, base = root) => { const v = text(first(s, base)); if (v) parts.push(v); };
  const auction = first('[data-auction-assembly-result]');
  const badges = [...root.querySelectorAll('[data-upgrade-slot] [data-source]')].filter(visible);
  const section = document.querySelector('[data-character-identity] h1');
  const ru = document.documentElement.lang.startsWith('ru');
  const statuses = [...root.querySelectorAll('[role="alert"], [data-auction-gear] strong[role="status"], [data-gear-farm][aria-busy="true"] [role="status"]')].filter(visible);
  for (const entry of statuses) {
    parts.push(text(entry));
    const progress = entry.parentElement?.querySelector('progress[value]');
    if (progress) parts.push(progress.value + ' / ' + progress.max);
  }
  if (auction) {
    add('[data-auction-primary-title]', auction);
    if (auction.dataset.exhaustive === 'false') parts.push(ru ? 'Проверена часть вариантов.' : 'Search is partial.');
    add('[role="status"]', auction);
    add('[data-auction-primary-dps]', auction);
    add('[data-auction-primary-cost]', auction);
    for (const row of auction.querySelectorAll('[data-auction-shopping-row]:not([data-purchased])')) {
      const name = nameOf(row) || text(row.querySelector('strong'));
      const price = text(row.firstElementChild?.lastElementChild);
      if (name) parts.push([name, price, text(row.querySelector('[data-shopping-status]'))].filter(Boolean).join(' · '));
    }
  }
  if (badges.length) {
    for (const badge of badges) parts.push([nameOf(badge), text(badge)].filter(Boolean).join(' · '));
  } else {
    for (const target of [...root.querySelectorAll('[data-farm-verification="simulated"]')].filter(visible)) {
      const activity = text(target.closest('[data-farm-access]')?.querySelector('h4'));
      parts.push([activity,text(target)].filter(Boolean).join(' · '));
    }
  }
  if (!parts.length) {
    for (const status of [...root.querySelectorAll('[role="status"]')].filter(visible)) parts.push(text(status));
  }
  return { title: text(section), lines: [...new Set(parts.filter(Boolean))],
    empty: ru ? 'Запустите подбор в приложении.' : 'Start a gear search in the app.' };
})()
