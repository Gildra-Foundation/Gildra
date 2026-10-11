import pg from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TEST_DB = /^payload_[a-z0-9_]*test[a-z0-9_]*$/;

/**
 * Refuse to run against anything that is not a local test database. The
 * connection string itself is never printed.
 */
export function safeTestUrl(): URL {
  const raw = process.env.PAYLOAD_DATABASE_URL;
  if (!raw) throw new Error("PAYLOAD_DATABASE_URL is not set; integration tests need the isolated TEST database.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PAYLOAD_DATABASE_URL is not a valid URL.");
  }
  const database = url.pathname.replace(/^\//, "");
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error("Refusing to test: database host is not local.");
  if (!TEST_DB.test(database)) throw new Error("Refusing to test: database name does not look like a payload_*test* database.");
  return url;
}

/**
 * Recreate `<testdb>__<name>` inside the same isolated test server and return
 * its URL. The shared test database itself is never modified by the tests.
 */
export async function scratchDatabase(name: string): Promise<string> {
  if (!/^[a-z0-9_]{1,30}$/.test(name)) throw new Error("invalid scratch name");
  const base = safeTestUrl();
  const database = `${base.pathname.replace(/^\//, "")}__${name}`;
  if (!TEST_DB.test(database)) throw new Error("invalid scratch database name");
  const client = new pg.Client({ connectionString: base.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }
  const url = new URL(base.toString());
  url.pathname = `/${database}`;
  return url.toString();
}

export async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
