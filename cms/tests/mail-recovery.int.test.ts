import net from "node:net";
import { once } from "node:events";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import { assertStaffRecoveryAvailable, buildEmailAdapter } from "../src/email";
import { bootPayload, makeStaff, TEST_PASSWORD } from "./helpers/payload";

let payload: Payload;
let originalEmail: Payload["email"];
const cleanups: (() => Promise<void>)[] = [];

async function smtp(rejectRecipient = false) {
  const messages: string[] = [];
  const commands: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    socket.write("220 local.test ESMTP\r\n");
    let buffer = "", data = false, body: string[] = [];
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      for (;;) {
        const end = buffer.indexOf("\r\n"); if (end < 0) break;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { messages.push(body.join("\r\n")); body = []; data = false; socket.write("250 queued\r\n"); }
          else body.push(line);
          continue;
        }
        const command = line.split(" ")[0].toUpperCase(); commands.push(command);
        if (command === "EHLO" || command === "HELO") socket.write("250-local.test\r\n250 PIPELINING\r\n");
        else if (command === "STARTTLS") socket.write("454 TLS unavailable\r\n");
        else if (command === "RCPT" && rejectRecipient) socket.write("550 private-recipient-marker@example.test rejected\r\n");
        else if (command === "DATA") { data = true; socket.write("354 send message\r\n"); }
        else if (command === "QUIT") { socket.end("221 bye\r\n"); }
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as net.AddressInfo;
  cleanups.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  return { port: address.port, messages, commands };
}
function configure(port: number, production = false) {
  vi.stubEnv("EMAIL_TRANSPORT", "smtp"); vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", String(port)); vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_USER", ""); vi.stubEnv("SMTP_PASS", "");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "team@example.test");
  vi.stubEnv("NODE_ENV", production ? "production" : "test");
}
async function useSMTP(port: number) {
  configure(port);
  const adapter = await buildEmailAdapter(); payload.email = await adapter({ payload });
}
beforeAll(async () => {
  process.env.PAYLOAD_PUBLIC_URL = "https://cms.example.test";
  ({ payload } = await bootPayload("mail_recovery")); originalEmail = payload.email;
});
afterEach(async () => { payload.email = originalEmail; vi.unstubAllEnvs(); for (const close of cleanups.splice(0)) await close(); });
afterAll(async () => { await payload?.db.destroy?.(); });

function resetToken(message: string) {
  const separator = message.indexOf("\r\n\r\n");
  const headers = message.slice(0, separator), body = message.slice(separator + 4);
  // The localized HTML can use either MIME transfer encoding.
  const decoded = /content-transfer-encoding:\s*base64/i.test(headers)
    ? Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8")
    : body.replace(/=\r\n/g, "").replace(/=([\dA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const url = /https:\/\/cms\.example\.test\/admin\/reset\/([a-f0-9]+)/.exec(decoded);
  expect(url).not.toBeNull(); return url![1];
}

describe("staff SMTP password recovery", () => {
  it("requires STARTTLS in production before credentials or mail can leave", async () => {
    const server = await smtp(); configure(server.port, true); vi.stubEnv("SMTP_USER", "private-user"); vi.stubEnv("SMTP_PASS", "private-password");
    await expect(assertStaffRecoveryAvailable()).rejects.toMatchObject({ status: 503 });
    expect(server.commands).toContain("STARTTLS");
    expect(server.commands).not.toContain("AUTH"); expect(server.commands).not.toContain("MAIL");
  });

  it("sends the trusted reset link over SMTP, accepts it once and revokes old sessions", async () => {
    const server = await smtp(); await useSMTP(server.port);
    const staff = await makeStaff(payload, { email: "reset@staff.test", owner: true });
    const oldLogin = await payload.login({ collection: "admins", data: { email: staff.email, password: TEST_PASSWORD } });
    await payload.forgotPassword({ collection: "admins", data: { email: staff.email } });
    expect(server.messages).toHaveLength(1);
    const token = resetToken(server.messages[0]);
    await payload.resetPassword({ collection: "admins", data: { token, password: "new-password-only-in-test-2" }, overrideAccess: true });
    await expect(payload.login({ collection: "admins", data: { email: staff.email, password: TEST_PASSWORD } })).rejects.toThrow();
    await expect(payload.login({ collection: "admins", data: { email: staff.email, password: "new-password-only-in-test-2" } })).resolves.toHaveProperty("token");
    await expect(payload.resetPassword({ collection: "admins", data: { token, password: "reused-token-test-password" }, overrideAccess: true })).rejects.toThrow();
    const auth = await payload.auth({ headers: new Headers({ authorization: `JWT ${oldLogin.token}` }) });
    expect(auth.user).toBeNull();
  });

  it("does not send or expose a token for an unknown staff address", async () => {
    const server = await smtp(); await useSMTP(server.port);
    await expect(payload.forgotPassword({ collection: "admins", data: { email: "absent@staff.test" } })).resolves.toBeNull();
    expect(server.messages).toHaveLength(0);
  });

  it("rejects expired staff reset links", async () => {
    const server = await smtp(); await useSMTP(server.port);
    const staff = await makeStaff(payload, { email: "expired@staff.test", owner: true });
    await payload.forgotPassword({ collection: "admins", data: { email: staff.email } });
    const token = resetToken(server.messages[0]);
    await payload.update({ collection: "admins", id: staff.id, overrideAccess: true, data: { resetPasswordExpiration: new Date(0).toISOString() } });
    await expect(payload.resetPassword({ collection: "admins", data: { token, password: "expired-link-test-password" }, overrideAccess: true })).rejects.toThrow();
  });

  it("returns the same unavailable response for known and unknown addresses during an SMTP outage", async () => {
    const staff = await makeStaff(payload, { email: "outage@staff.test", owner: true });
    const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as net.AddressInfo).port; await new Promise<void>((resolve) => server.close(() => resolve()));
    configure(port);
    const errors = [];
    for (const email of [staff.email, "unknown-outage@staff.test"]) {
      try { await payload.forgotPassword({ collection: "admins", data: { email } }); }
      catch (error) { const e = error as Error & { status: number }; errors.push({ message: e.message, status: e.status }); }
    }
    expect(errors).toHaveLength(2); expect(errors[0]).toEqual(errors[1]); expect(errors[0].status).toBe(503);
  });

  it("redacts recipient-specific SMTP failures from public errors", async () => {
    const server = await smtp(true); await useSMTP(server.port);
    let failure: unknown;
    try { await payload.email.sendEmail({ to: "private-recipient-marker@example.test", subject: "test", text: "test" }); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ status: 503 });
    expect(String(failure)).not.toContain("private-recipient-marker");
  });
});
