import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const context = new AsyncLocalStorage();
const waiting = new Map();
export const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');

// Data reads go through the user's signed-in WebView. Node never receives cookies.
export function dataResponse(query, signal = AbortSignal.timeout(50_000)) {
  const id = randomUUID();
  const current = context.getStore();
  if (query.read !== 'session' && !current?.owner) throw new Error('session_expired');
  if (current?.owner) query = { ...query, owner: current.owner };
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(50_000)]);
  deadline.throwIfAborted();
  return new Promise((resolve, reject) => {
    function abort() {
      waiting.delete(id);
      reject(deadline.reason);
    }
    waiting.set(id, (packet) => {
      deadline.removeEventListener('abort', abort);
      resolve(new Response(packet.body, { status: packet.status, headers: { 'Content-Type': 'application/json' } }));
    });
    deadline.addEventListener('abort', abort, { once: true });
    send({ type: 'read', id, query: new URLSearchParams(query).toString() });
  });
}

export function handleRead(packet) {
  const complete = waiting.get(packet.id);
  waiting.delete(packet.id);
  complete?.(packet);
}

export async function data(query, signal) {
  const response = await dataResponse(query, signal);
  if (!response.ok) throw new Error(response.status === 401 ? 'session_expired' : 'desktop_data_unavailable');
  return response.json();
}

export async function auth() {
  const session = await dataResponse({ read: 'session' });
  if (session.status === 401) return null;
  if (!session.ok) throw new Error('desktop_data_unavailable');
  const { protocol, owner } = await session.json();
  if (protocol !== 1 || !/^[0-9a-f]{64}$/.test(owner)) throw new Error('desktop_version_mismatch');
  context.getStore().owner = owner;
  return { battleNetAccessToken: owner };
}
