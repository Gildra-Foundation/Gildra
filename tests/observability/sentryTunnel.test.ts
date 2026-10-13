import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { envelopeTarget, parseDsn, upstreamEnvelopeUrl } from "../../lib/observability/sentryTunnel.ts";

const siteDsn = "http://0123456789abcdef@glitchtip:8000/1";
const envelope = (dsn: unknown) => `${JSON.stringify({ event_id: "e", dsn })}\n{"type":"event"}\n{"message":"x"}\n`;

describe("error-report tunnel", () => {
  it("reads the project and public key of a DSN", () => {
    assert.deepEqual(parseDsn(siteDsn), { projectId: "1", publicKey: "0123456789abcdef" });
    assert.equal(parseDsn(undefined), null);
    assert.equal(parseDsn("http://glitchtip:8000/1"), null);
    assert.equal(parseDsn("http://key@glitchtip:8000/not-a-project"), null);
  });

  it("forwards only envelopes built for the site's own DSN", () => {
    const allowed = parseDsn(siteDsn)!;
    assert.deepEqual(envelopeTarget(envelope(siteDsn), allowed), allowed);
    assert.equal(envelopeTarget(envelope("http://0123456789abcdef@glitchtip:8000/2"), allowed), null);
    assert.equal(envelopeTarget(envelope("http://other@glitchtip:8000/1"), allowed), null);
    assert.equal(envelopeTarget(envelope(42), allowed), null);
    assert.equal(envelopeTarget("not json\n{}", allowed), null);
  });

  it("authenticates upstream with the key in the query", () => {
    assert.equal(
      upstreamEnvelopeUrl("http://glitchtip:8000/", { projectId: "1", publicKey: "abc" }),
      "http://glitchtip:8000/api/1/envelope/?sentry_key=abc&sentry_version=7",
    );
  });
});
