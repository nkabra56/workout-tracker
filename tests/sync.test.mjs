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
