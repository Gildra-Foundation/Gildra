(() => {
  if (window !== window.top || location.origin !== 'https://wowarcana.com') return;
  const paths = new Set(['/api/wow/auction-gear-plans', '/api/wow/gear-farm-plans', '/api/wow/auction-shopping-list']);
  const web = window.chrome.webview;
  const original = window.fetch.bind(window);
  const pending = new Map();
  web.addEventListener('message', ({data}) => {
    if (data?.type === 'gear-response') pending.get(data.id)?.(data);
  });
  window.fetch = async function(input, init) {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin || !paths.has(url.pathname)) return original(input, init);
    const req = new Request(input, init);
    req.signal.throwIfAborted();
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return new Response(null, {status:405});
    const id = crypto.randomUUID();
    const body = req.method === 'POST' ? await req.text() : null;
    if (body && new TextEncoder().encode(body).length > 4 * 1024 * 1024) return new Response(null, {status:413});
    req.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => {
        pending.delete(id);
        web.postMessage({type:'gear-cancel', id});
        reject(req.signal.reason);
      };
      pending.set(id, response => {
        pending.delete(id);
        req.signal.removeEventListener('abort', abort);
        resolve(new Response(response.body, {status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}}));
      });
      req.signal.addEventListener('abort', abort, {once:true});
      web.postMessage({type:'gear-request', id, method:req.method, path:url.pathname + url.search, body});
    });
  };
})();
