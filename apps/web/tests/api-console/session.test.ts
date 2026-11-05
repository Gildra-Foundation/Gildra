import assert from "node:assert/strict";
import test from "node:test";

// The console session route answers 401 to a guest and 200 with the user once signed in.
const realFetch = globalThis.fetch;
async function session(upstream: () => Promise<Response>) {
  globalThis.fetch = (async () => upstream()) as typeof fetch;
  try {
    const { GET } = await import("../../components/api-console/sessionRoute.ts");
    return await GET(new Request("https://api.gildra.net/api-console/session", { headers: { cookie: "gildra_session=x" } }));
  } finally { globalThis.fetch = realFetch; }
}

test("guest: 401 with no user", async () => {
  const response = await session(async () => new Response("{}", { status: 401 }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { user: null });
});

test("API down: still a guest, never 404 or 500", async () => {
  const response = await session(async () => { throw new Error("down"); });
  assert.equal(response.status, 401);
});

test("signed in: 200 with the user", async () => {
  const user = { id: "1", email: "admin@example.com" };
  const response = await session(async () => Response.json({ user }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user });
});
