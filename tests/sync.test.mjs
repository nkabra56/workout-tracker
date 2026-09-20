import test from "node:test";
import assert from "node:assert/strict";
import { authorized, reconcile } from "../sync-server.mjs";
test("sync authorization fails closed", () => {
  assert.equal(authorized("", ""), false);
  assert.equal(authorized("x", "x".repeat(32)), false);
  assert.equal(authorized("x".repeat(32), "x".repeat(32)), true);
});
test("sync retries, stale edits and deletions preserve records", () => {
  const create = {
    store: "foods",
    record: {
      id: "a",
      name: "Test",
      source: "Label",
      kcal: 100,
      protein: 1,
      carbs: 2,
      fat: 3,
    },
  };
  let state = reconcile({}, [create]);
  assert.equal(Object.keys(reconcile(state, [create])).length, 1);
  const base = state["foods:a"].version;
  state = reconcile(state, [
    {
      store: "foods",
      record: {
        id: "a",
        name: "Test",
        source: "Label",
        kcal: 120,
        protein: 1,
        carbs: 2,
        fat: 3,
      },
      base,
    },
  ]);
  const stale = {
    store: "foods",
    record: {
      id: "a",
      name: "Test",
      source: "Label",
      kcal: 80,
      protein: 1,
      carbs: 2,
      fat: 3,
    },
    base,
  };
  state = reconcile(state, [stale]);
  assert.equal(Object.keys(state).length, 2);
  assert.equal(Object.keys(reconcile(state, [stale])).length, 2);
  assert.equal(state["foods:a"].record.kcal, 120);
  state = reconcile(state, [
    {
      store: "foods",
      record: { id: "a", _deleted: true },
      base: state["foods:a"].version,
    },
  ]);
  assert.equal(state["foods:a"].record._deleted, true);
});

test("signed browser sessions expire and reject tampering", async () => {
  const { issueSession, validSession } = await import("../sync-server.mjs");
  const secret = "a".repeat(64),
    issued = issueSession(secret, 1000);
  assert.equal(validSession("steadily_session=" + issued, secret, 2000), true);
  assert.equal(
    validSession("steadily_session=" + issued + "x", secret, 2000),
    false,
  );
  assert.equal(
    validSession("steadily_session=" + issued, secret, 366 * 86400000),
    false,
  );
});

test("regular use renews sessions and legacy month-long cookies remain valid", async () => {
  const { issueSession, validSession, SESSION_TTL_SECONDS } =
    await import("../sync-server.mjs");
  const { createHmac } = await import("node:crypto");
  const secret = "b".repeat(64),
    day = 86400000,
    original = issueSession(secret, 0),
    renewed = issueSession(secret, 350 * day);
  assert.equal(
    validSession("steadily_session=" + original, secret, 400 * day),
    false,
  );
  assert.equal(
    validSession("steadily_session=" + renewed, secret, 400 * day),
    true,
  );
  const oldExpiry = String(30 * day),
    old =
      oldExpiry +
      "." +
      createHmac("sha256", secret).update(oldExpiry).digest("base64url");
  assert.equal(validSession("steadily_session=" + old, secret, day), true);
  assert.equal(SESSION_TTL_SECONDS, 31536000);
});
