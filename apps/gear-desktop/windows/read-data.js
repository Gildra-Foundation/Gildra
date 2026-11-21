async ({id, query}) => {
  if (window.top !== window || location.origin !== 'https://wowarcana.com') return;
  let status = 503, body = '{"error":"desktop_data_unavailable"}';
  try {
    const response = await fetch('/api/wow/gear-desktop-data?' + query, {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(45000)
    });
    status = response.status;
    if (response.headers.get('content-type')?.includes('application/json')) body = await response.text();
    else if (response.ok) status = 502;
  } catch { /* Navigation, timeout or a disconnected site. */ }
  window.chrome.webview.postMessage({id, status, body});
}
