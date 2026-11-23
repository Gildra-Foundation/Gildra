(() => {
  const root = document.querySelector('[data-tool-panel="upgrades"]');
  const visible = node => node && node.getClientRects().length && !node.closest('[hidden]');
  if (!visible(root)) return null;
  const text = node => (node?.innerText || '').replace(/\s+/g, ' ').trim();
  const first = (s, base = root) => [...base.querySelectorAll(s)].find(visible);
  const descriptor = node => {
    const trigger = node?.querySelector('[data-overlay-item]');
    return trigger ? JSON.parse(trigger.dataset.overlayItem) : null;
  };
  const rows = [], metrics = [], seen = new Set();
  let progress = null;
  function add(kind, label, detail = '', payload = null) {
    const key = JSON.stringify([kind,label,detail,payload]);
    if (!label || seen.has(key)) return;
    seen.add(key);
    rows.push({kind,label,detail,...payload});
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
      const name=text(row.querySelector('strong'));
      const payload=descriptor(row.firstElementChild) || {item:{itemId:Number(row.dataset.shoppingItemId),name},consumable:true};
      add('item',payload.item.name,[text(row.firstElementChild?.lastElementChild),text(row.querySelector('[data-shopping-status]'))].filter(Boolean).join(' · '),payload);
    }
  }
  for (const badge of [...root.querySelectorAll('[data-upgrade-slot] [data-source]')].filter(visible)) {
    const payload=descriptor(badge);
    const worn=badge.closest('[data-upgrade-slot]')?.querySelector('b[title]')?.textContent;
    add('item',payload?.item.name || text(badge),[worn && (document.documentElement.lang==='ru'?'Надето: ':'Equipped: ')+worn,text(badge)].filter(Boolean).join(' · '),payload);
  }
  for (const target of [...root.querySelectorAll('[data-farm-verification="simulated"]')].filter(visible)) {
    const payload=descriptor(target);
    const activity=text(target.closest('[data-farm-access]')?.querySelector('h4'));
    add('farm',payload?.item.name || text(target),[activity,text(target)].filter(Boolean).join(' · '),payload);
  }
  if (!rows.length && !metrics.length) for(const entry of [...root.querySelectorAll('[role="status"]')].filter(visible))add('status',text(entry));
  return {title:text(document.querySelector('[data-character-identity] h1')),rows,metrics,progress};
})()
