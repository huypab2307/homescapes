import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./api.ts";

test("legacy tabs keep reads, Save, cards, cosmetics and Push on the displayed session", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: URL; body: Record<string, unknown> }> = [];
  let pulled = "account-A";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), "http://test.local");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    const id = url.pathname === "/api/device/pull" ? pulled : body.sessionId ?? url.searchParams.get("sessionId") ?? "temporary-donor";
    const response = { ok: true, overview: { meta: { id } }, values: {}, fields: [], state: {}, summary: [] };
    return new Response(JSON.stringify(response), { status: 200 });
  }) as typeof fetch;
  try {
    await api.pull("serial-A");
    await api.overview();
    await api.values();
    await api.discover("Currency.");
    await api.apply([{ path: "Properties.coins", value: 123 }], true);
    await api.cardsGrant({ cards: [1], copies: 1 });
    await api.cosmeticsApply({ grant: {} });
    await api.push("serial-A");
    for (const call of calls.slice(1)) {
      assert.equal(call.body.sessionId ?? call.url.searchParams.get("sessionId"), "account-A");
    }
    await api.values("explicit-B");
    assert.equal(calls.at(-1)!.url.searchParams.get("sessionId"), "explicit-B");
    await api.values();
    assert.equal(calls.at(-1)!.url.searchParams.get("sessionId"), "account-A");
    pulled = "account-B";
    await api.pull("serial-B");
    await api.apply([], false);
    assert.equal(calls.at(-1)!.body.sessionId, "account-B");
  } finally {
    globalThis.fetch = original;
  }
});
