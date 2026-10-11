import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createLocalReq, type Endpoint, getPayload, type Payload } from "payload";

import { scratchDatabase } from "./db";

export type Booted = { payload: Payload; url: string };

/**
 * Boot Payload on a fresh scratch database. `migrations: "all"` applies every
 * migration; `"legacy"` applies only the two pre-existing ones (old schema).
 */
export async function bootPayload(name: string, migrations: "all" | "legacy" | "none" = "all"): Promise<Booted> {
  const url = await scratchDatabase(name);
  process.env.PAYLOAD_DATABASE_URL = url;
  process.env.PAYLOAD_DB_PUSH = "false";
  process.env.EMAIL_TRANSPORT = "capture";
  process.env.CMS_JOBS_AUTORUN = "false";
  process.env.PAYLOAD_MEDIA_DIR = mkdtempSync(path.join(os.tmpdir(), "gildra-media-"));
  process.env.PAYLOAD_SECRET ||= "local-test-secret-only";
  const { default: config } = await import("../../src/payload.config");
  const payload = await getPayload({ config, key: name });
  const { migrations: all } = await import("../../src/migrations");
  if (migrations !== "none") await payload.db.migrate({ migrations: migrations === "all" ? all : all.slice(0, 2) });
  return { payload, url };
}

export type StaffSpec = { email: string; name?: string; owner?: boolean; sites?: { site: number; role: "admin" | "editor" | "author" | "analyst" }[] };

/** Test-local credential; never used outside the scratch databases. */
export const TEST_PASSWORD = "local-test-password-1";

export async function makeStaff(payload: Payload, spec: StaffSpec) {
  const doc = await payload.create({
    collection: "admins",
    data: {
      email: spec.email,
      name: spec.name ?? spec.email.split("@")[0],
      password: TEST_PASSWORD,
      platformRole: spec.owner ? "owner" : "staff",
      sites: spec.sites ?? [],
    },
    overrideAccess: true,
  });
  return { ...doc, collection: "admins" as const };
}

export async function reloadStaff(payload: Payload, id: number) {
  const doc = await payload.findByID({ collection: "admins", id, depth: 0, overrideAccess: true });
  return { ...doc, collection: "admins" as const };
}

export function as(user: unknown) {
  return { overrideAccess: false as const, user: user as never };
}

type CallOptions = {
  user?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  locale?: string;
};

/** Invoke a root or collection endpoint handler directly with a local request. */
export async function callEndpoint(payload: Payload, path: string, method: string, opts: CallOptions = {}, collection?: string) {
  const list: Endpoint[] = collection
    ? ((payload.collections[collection as never]?.config.endpoints || []) as Endpoint[])
    : ((payload.config.endpoints || []) as Endpoint[]);
  const endpoint = list.find((e) => e.path === path && e.method === method);
  if (!endpoint) throw new Error(`endpoint ${method} ${path} not found`);
  const req = await createLocalReq({ user: opts.user as never, locale: opts.locale as never }, payload);
  const searchParams = new URLSearchParams(opts.query ?? {});
  Object.assign(req, {
    routeParams: opts.params ?? {},
    searchParams,
    headers: new Headers(opts.headers ?? {}),
    json: async () => opts.body ?? {},
  });
  const response = await endpoint.handler(req);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, raw: text, headers: response.headers };
}

/** Minimal Lexical document with one paragraph (plus optional extra nodes). */
export function lexical(text: string, extra: unknown[] = []) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          direction: "ltr",
          format: "",
          indent: 0,
          textFormat: 0,
          children: [{ type: "text", version: 1, text, detail: 0, format: 0, mode: "normal", style: "" }],
        },
        ...extra,
      ],
    },
  };
}

/** 1×1 transparent PNG. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export function pngFile(name = "pixel.png") {
  return { data: PNG_1PX, mimetype: "image/png", name, size: PNG_1PX.length };
}
