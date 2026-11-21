(() => {
  const root = document.querySelector('[data-tool-panel="upgrades"]');
  const visible = node => node && node.getClientRects().length && !node.closest('[hidden]');
  if (!visible(root)) return null;
  const text = node => (node?.innerText || '').replace(/\s+/g, ' ').trim();
  const first = (s, base = root) => [...base.querySelectorAll(s)].find(visible);
  const nameOf = node => node?.querySelector('button[data-quality]')?.getAttribute('aria-label')?.replace(/\. (?:Описание предмета|Item details)$/, '') || '';
  const rows = [], metrics = [], seen = new Set();
  let progress = null;
  function add(kind, label, detail = '') {
    if (!label || seen.has(label+'\n'+detail)) return;
    seen.add(label+'\n'+detail);
    rows.push({kind, label, detail});
  }
  const statuses = root.querySelectorAll('[role="alert"], [data-auction-gear] strong[role="status"], [data-gear-farm][aria-busy="true"] [role="status"]');
  for (const entry of [...statuses].filter(visible)) {
    add(entry.matches('[role="alert"]') ? 'alert' : 'status', text(entry));
    const meter = entry.parentElement?.querySelector('progress[value]');
    if (meter?.max > 0) progress = {value:meter.value, max:meter.max};
  }
  const auction = first('[data-auction-assembly-result]');
  if (auction) {
    add('result', text(first('[data-auction-primary-title]', auction)));
    if (auction.dataset.exhaustive === 'false') add('status', document.documentElement.lang==='ru'?'Проверена часть вариантов.':'Search is partial.');
    add('status', text(first('[role="status"]', auction)));
    for (const attr of ['dps','cost']) {
      const field = first('[data-auction-primary-'+attr+']', auction);
      if (field) metrics.push({label:text(field.querySelector('dt')),value:text(field.querySelector('dd'))});
    }
    for (const row of [...auction.querySelectorAll('[data-auction-shopping-row]:not([data-purchased])')].filter(visible)) {
      add('item',nameOf(row)||text(row.querySelector('strong')),
        [text(row.firstElementChild?.lastElementChild),text(row.querySelector('[data-shopping-status]'))].filter(Boolean).join(' · '));
    }
  }
  const badges = [...root.querySelectorAll('[data-upgrade-slot] [data-source]')].filter(visible);
  for (const badge of badges) add('item',nameOf(badge)||text(badge),nameOf(badge)?text(badge):'');
  if (!badges.length) {
    for (const target of [...root.querySelectorAll('[data-farm-verification="simulated"]')].filter(visible)) {
      const activity=text(target.closest('[data-farm-access]')?.querySelector('h4'));
      add('farm',activity||text(target),activity?text(target):'');
    }
  }
  if (!rows.length && !metrics.length) for(const entry of [...root.querySelectorAll('[role="status"]')].filter(visible))add('status',text(entry));
  return {title:text(document.querySelector('[data-character-identity] h1')),rows,metrics,progress};
})()
