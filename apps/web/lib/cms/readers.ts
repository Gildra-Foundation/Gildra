// Shared CMS contract, mirrored in riftden-platform/apps/lol/src/lib/cms; keep both copies identical.
/**
 * Per-site reader proxy (`/api/readers/<action>`) in front of the CMS member API.
 *
 * - The site is fixed on the server (`deps.site`); the browser never chooses it.
 * - The CMS token lives only in a first-party httpOnly, SameSite=Lax cookie;
 *   responses never contain it.
 * - Every mutation requires `Origin` to equal the site's public origin exactly
 *   (plus `Sec-Fetch-Site: same-origin` when the browser sends it) and a JSON body.
 * - Each action accepts a fixed set of fields with type/length limits and only
 *   reaches one CMS endpoint; answers are re-shaped, never passed through.
 *
 * Framework-free (Request → Response) so it is unit-testable.
 */
export type ReaderDeps = {
  cmsUrl: string;
  site: string;
  publicOrigin: string;
  /** Secure cookie (HTTPS); also selects the `__Host-` cookie prefix. */
  secure: boolean;
  cookieBase: string;
  fetch?: typeof fetch;
  now?: () => number;
};

export const READER_ACTIONS = ["availability", "session", "register", "login", "logout", "verify", "forgot", "reset", "profile", "join"] as const;
export type ReaderAction = (typeof READER_ACTIONS)[number];

const MAX_BODY = 8 * 1024;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const HANDLE = /^[a-z0-9_-]{3,30}$/;

type Body = Record<string, unknown>;
type Spec = Record<string, (v: unknown) => boolean>;

const str = (min: number, max: number) => (v: unknown) => typeof v === "string" && v.length >= min && v.length <= max;
const SPECS: Partial<Record<ReaderAction, { required: Spec; optional?: Spec }>> = {
  register: { required: { email: (v) => typeof v === "string" && v.length <= 254 && EMAIL.test(v), password: str(10, 128), displayName: str(1, 60) } },
  login: { required: { email: str(3, 254), password: str(1, 128) }, optional: { enroll: (v) => typeof v === "boolean" } },
  verify: { required: { token: (v) => typeof v === "string" && /^[A-Za-z0-9._~-]{8,512}$/.test(v) } },
  forgot: { required: { email: (v) => typeof v === "string" && v.length <= 254 && EMAIL.test(v) } },
  reset: { required: { token: (v) => typeof v === "string" && /^[A-Za-z0-9._~-]{8,512}$/.test(v), password: str(10, 128) } },
  profile: {
    required: {},
    optional: {
      displayName: str(1, 60),
      bio: str(0, 500),
      handle: (v) => typeof v === "string" && HANDLE.test(v),
      visibility: (v) => v === "public" || v === "private",
    },
  },
  logout: { required: {} },
  join: { required: {} },
};

export const cookieName = (deps: Pick<ReaderDeps, "secure" | "cookieBase">) => (deps.secure ? `__Host-${deps.cookieBase}` : deps.cookieBase);

function reply(body: unknown, status = 200, setCookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function sessionCookie(deps: ReaderDeps, token: string, exp: number): string {
  const now = Math.floor((deps.now ?? Date.now)() / 1000);
  const maxAge = Math.max(60, Math.min(exp - now, 7 * 24 * 3600));
  return `${cookieName(deps)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${deps.secure ? "; Secure" : ""}`;
}

const clearCookie = (deps: ReaderDeps) => `${cookieName(deps)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${deps.secure ? "; Secure" : ""}`;

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      const value = rest.join("=");
      return /^[A-Za-z0-9._-]{20,4096}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** Exact-origin CSRF check for state-changing requests. */
export function sameOrigin(request: Request, publicOrigin: string): boolean {
  if (request.headers.get("origin") !== publicOrigin) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

async function readBody(request: Request, spec: { required: Spec; optional?: Spec }): Promise<Body | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const allowed = { ...spec.required, ...spec.optional };
  for (const [key, value] of Object.entries(body)) {
    if (!(key in allowed) || !allowed[key](value)) return null;
  }
  for (const key of Object.keys(spec.required)) if (!(key in (body as Body))) return null;
  return body as Body;
}

function clientHeaders(request: Request, token?: string | null): Headers {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  if (token) headers.set("authorization", `JWT ${token}`);
  // Lets the CMS rate-limit per visitor; the value comes from this site's own reverse proxy.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) headers.set("x-forwarded-for", forwarded);
  return headers;
}

async function cms(deps: ReaderDeps, request: Request, path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) {
  const doFetch = deps.fetch ?? fetch;
  try {
    const response = await doFetch(`${deps.cmsUrl}${path}`, {
      method: init.method ?? "GET",
      headers: clientHeaders(request, init.token),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, data };
  } catch {
    return { status: 502, data: {} };
  }
}

const unavailable = () => reply({ status: "unavailable" }, 502);

export async function handleReader(actionRaw: string, request: Request, deps: ReaderDeps): Promise<Response> {
  const action = READER_ACTIONS.find((a) => a === actionRaw);
  if (!action) return reply({ status: "not-found" }, 404);
  const method = request.method.toUpperCase();
  const reading = method === "GET";
  const allowedMethod =
    action === "availability" || action === "session" ? method === "GET" : action === "profile" ? method === "GET" || method === "PATCH" : method === "POST";
  if (!allowedMethod) return reply({ status: "method-not-allowed" }, 405);
  if (!reading && !sameOrigin(request, deps.publicOrigin)) return reply({ status: "forbidden" }, 403);

  const spec = SPECS[action];
  const body = !reading && spec ? await readBody(request, spec) : {};
  if (!reading && body === null) return reply({ status: "invalid" }, 400);
  const token = readCookie(request, cookieName(deps));
  const site = encodeURIComponent(deps.site);

  switch (action) {
    case "availability": {
      const r = await cms(deps, request, `/api/members/availability?site=${site}`);
      if (r.status !== 200) return unavailable();
      return reply({ registration: r.data.registration, email: r.data.email });
    }
    case "register": {
      const r = await cms(deps, request, "/api/members/register", { method: "POST", body: { site: deps.site, ...body } });
      const known = ["pending-verification", "registration-closed", "unavailable", "invalid", "rate-limited"];
      const status = typeof r.data.status === "string" && known.includes(r.data.status) ? r.data.status : r.status >= 500 ? "unavailable" : "error";
      return reply({ status, ...(status === "invalid" && Array.isArray(r.data.fields) ? { fields: r.data.fields } : {}) }, r.status === 202 ? 202 : r.status || 502);
    }
    case "login": {
      const r = await cms(deps, request, "/api/members/site-login", {
        method: "POST",
        body: { site: deps.site, email: body!.email, password: body!.password, ...(body!.enroll === true ? { enroll: true } : {}) },
      });
      if (r.status === 200 && typeof r.data.token === "string" && typeof r.data.exp === "number") {
        return reply({ status: "ok", enrolled: r.data.enrolled === true }, 200, sessionCookie(deps, r.data.token, r.data.exp));
      }
      const known = ["invalid-credentials", "email-not-verified", "locked", "enrollment-available", "rate-limited"];
      const status = typeof r.data.status === "string" && known.includes(r.data.status) ? r.data.status : "unavailable";
      return reply({ status }, r.status >= 400 && r.status < 600 ? r.status : 502);
    }
    case "logout": {
      if (token) await cms(deps, request, "/api/members/logout", { method: "POST", token });
      return reply({ status: "signed-out" }, 200, clearCookie(deps));
    }
    case "session": {
      if (!token) return reply({ authenticated: false });
      const r = await cms(deps, request, `/api/members/session?site=${site}`, { token });
      if (r.status === 401 || (r.status === 200 && r.data.authenticated !== true && r.data.membership === undefined)) {
        return reply({ authenticated: false }, 200, clearCookie(deps));
      }
      if (r.status !== 200) return unavailable();
      const profile = r.data.profile as { handle?: unknown; displayName?: unknown; visibility?: unknown } | null;
      return reply({
        authenticated: r.data.authenticated === true,
        membership: typeof r.data.membership === "string" ? r.data.membership : "none",
        profile: profile ? { handle: profile.handle ?? null, displayName: profile.displayName ?? null, visibility: profile.visibility ?? null } : null,
      });
    }
    case "verify": {
      const r = await cms(deps, request, `/api/members/verify/${encodeURIComponent(String(body!.token))}`, { method: "POST" });
      return r.status === 200 ? reply({ status: "verified" }) : reply({ status: r.status >= 500 ? "unavailable" : "invalid-token" }, r.status >= 500 ? 502 : 400);
    }
    case "forgot": {
      const r = await cms(deps, request, "/api/members/site-forgot-password", { method: "POST", body: { site: deps.site, email: body!.email } });
      if (r.status === 202) return reply({ status: "sent-if-exists" }, 202);
      if (r.status === 503) return reply({ status: "unavailable", reason: "email-not-configured" }, 503);
      if (r.status === 429) return reply({ status: "rate-limited" }, 429);
      return unavailable();
    }
    case "reset": {
      const r = await cms(deps, request, "/api/members/reset-password", { method: "POST", body: { token: body!.token, password: body!.password } });
      // The reset logs in on the CMS domain only; the reader signs in here afterwards.
      return r.status === 200 ? reply({ status: "reset" }) : reply({ status: r.status >= 500 ? "unavailable" : "invalid-token" }, r.status >= 500 ? 502 : 400);
    }
    case "join": {
      if (!token) return reply({ status: "unauthenticated" }, 401);
      const r = await cms(deps, request, "/api/members/join", { method: "POST", body: { site: deps.site }, token });
      const status = typeof r.data.status === "string" ? r.data.status : "unavailable";
      return reply({ status }, r.status || 502);
    }
    case "profile": {
      if (!token) return reply({ status: "unauthenticated" }, 401);
      const session = await cms(deps, request, `/api/members/session?site=${site}`, { token });
      if (session.status !== 200 || session.data.authenticated !== true) return reply({ status: "unauthenticated" }, 401, clearCookie(deps));
      // Look the profile up by its handle (from the session): readers may not filter on the
      // `member` relation, whose read access is document-bound in the CMS.
      const handle = (session.data.profile as { handle?: unknown } | null | undefined)?.handle;
      const found =
        typeof handle === "string" && handle
          ? await cms(deps, request, `/api/member-profiles?where[handle][equals]=${encodeURIComponent(handle)}&limit=1&depth=0`, { token })
          : { status: 200, data: { docs: [] } as Record<string, unknown> };
      if (found.status !== 200) return unavailable();
      const current = ((found.data.docs as Record<string, unknown>[] | undefined) ?? [])[0];
      const shape = (p: Record<string, unknown> | undefined) =>
        p ? { handle: p.handle ?? null, displayName: p.displayName ?? null, bio: p.bio ?? null, visibility: p.visibility ?? null } : null;
      if (reading) return reply({ profile: shape(current) });
      const changes = body!;
      if (Object.keys(changes).length === 0) return reply({ status: "invalid" }, 400);
      // A new profile needs its own handle and display name.
      if (!current && (typeof changes.handle !== "string" || typeof changes.displayName !== "string")) return reply({ status: "invalid", fields: ["handle"] }, 400);
      const r = current
        ? await cms(deps, request, `/api/member-profiles/${encodeURIComponent(String(current.id))}`, { method: "PATCH", body: changes, token })
        : await cms(deps, request, "/api/member-profiles", { method: "POST", body: changes, token });
      if (r.status === 200 || r.status === 201) return reply({ status: "saved", profile: shape((r.data.doc as Record<string, unknown>) ?? undefined) });
      return reply({ status: r.status === 400 ? "invalid" : r.status === 403 ? "forbidden" : "unavailable" }, r.status === 400 || r.status === 403 ? r.status : 502);
    }
  }
}
