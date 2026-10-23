export async function requestJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const deadline = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const response = await fetch(path, { credentials: "include", signal: requestSignal });
  if (!response.ok) {
    let detail = "Не удалось загрузить данные Genshin Impact";
    try {
      const body = await response.json() as { detail?: string };
      detail = body.detail ?? detail;
    } catch { /* response without JSON */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}
