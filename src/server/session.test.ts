import test from "node:test";
import assert from "node:assert/strict";
import { createSession, getSession, listSessions, currentSession, withSessionScope } from "./session.ts";

const input = new TextEncoder().encode('{"Properties":{"coins":42}}');
test("cloud sessions cannot be read/listed through another desktop scope", () => {
  const a = withSessionScope("client-A", () => createSession("A", input));
  const b = withSessionScope("client-B", () => createSession("B", input));
  withSessionScope("client-A", () => {
    assert.equal(getSession(a.id).id, a.id);
    assert.throws(() => getSession(b.id), /Session expired or unavailable/);
    assert.deepEqual(listSessions().map(s => s.id), [a.id]);
    assert.equal(currentSession()?.id, a.id);
  });
  withSessionScope("client-B", () => assert.equal(currentSession()?.id, b.id));
});
test("cloud session expiry requires a new Connect instead of selecting another client's save", (t) => {
  const oldMode = process.env.HC_CLOUD_MODE;
  process.env.HC_CLOUD_MODE = "1";
  try {
    const session = withSessionScope("expiring-client", () => createSession("old", input));
    const later = Date.now() + 31 * 60 * 1000;
    t.mock.method(Date, "now", () => later);
    withSessionScope("expiring-client", () => {
      assert.throws(() => getSession(session.id), /Connect again/);
      assert.equal(currentSession(), undefined);
    });
  } finally {
    if (oldMode === undefined) delete process.env.HC_CLOUD_MODE;
    else process.env.HC_CLOUD_MODE = oldMode;
  }
});
