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
    store: "settings",
    record: {
      id: "a",
      type: "weighin",
      value: 180,
      unit: "lb",
      date: "2024-01-01",
      note: "",
    },
  };
  let state = reconcile({}, [create]);
  assert.equal(Object.keys(reconcile(state, [create])).length, 1);
  const base = state["settings:a"].version;
  state = reconcile(state, [
    {
      store: "settings",
      record: { ...create.record, note: "first edit" },
      base,
    },
  ]);
  const stale = {
    store: "settings",
    record: { ...create.record, note: "conflicting edit" },
    base,
  };
  state = reconcile(state, [stale]);
  assert.equal(Object.keys(state).length, 2);
  assert.equal(Object.keys(reconcile(state, [stale])).length, 2);
  assert.equal(state["settings:a"].record.note, "first edit");
  state = reconcile(state, [
    {
      store: "settings",
      record: { id: "a", _deleted: true },
      base: state["settings:a"].version,
    },
  ]);
  assert.equal(state["settings:a"].record._deleted, true);
});
test("deletion wins for every store even against a stale base, not just sessions", () => {
  const create = {
    store: "settings",
    record: {
      id: "w1",
      type: "weighin",
      value: 180,
      unit: "lb",
      date: "2024-01-01",
      note: "",
    },
  };
  let state = reconcile({}, [create]);
  const base = state["settings:w1"].version;
  // Another device edits the record, advancing its version past this device's base.
  state = reconcile(state, [
    { store: "settings", record: { ...create.record, note: "edited elsewhere" }, base },
  ]);
  // This device deletes it, still holding the stale (pre-edit) base.
  state = reconcile(state, [
    { store: "settings", record: { id: "w1", _deleted: true }, base },
  ]);
  assert.equal(state["settings:w1"].record._deleted, true);
  assert.equal(Object.keys(state).length, 1);
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
