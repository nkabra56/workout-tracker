import test from "node:test";
import assert from "node:assert/strict";
import {
  templates,
  newSession,
  recipe,
  totals,
  suggestion,
  mergeRecords,
} from "../core.js";
test("five routines preserve exercise counts, sets and different targets", () => {
  assert.deepEqual(
    templates.map((t) => t.exercises.length),
    [5, 6, 4, 6, 4],
  );
  assert.deepEqual(
    templates.map((t) => t.exercises.reduce((n, e) => n + e.sets, 0)),
    [13, 14, 9, 12, 9],
  );
  assert.equal(templates[1].exercises[0].max, 8);
  assert.equal(templates[4].exercises[1].max, 12);
  assert.equal(templates[0].exercises[4].each, true);
});
test("new sessions have unique identities and untouched independent sets", () => {
  const a = newSession(0, "kg"),
    b = newSession(0, "kg");
  a.exercises[0].sets[0].done = true;
  assert.notEqual(a.id, b.id);
  assert.equal(a.exercises[0].sets[1].done, false);
  assert.equal(b.exercises[0].sets[0].done, false);
});
test("recipe includes oil and cooked yield; portions scale all macros", () => {
  const r = recipe(
    [
      { food: { kcal: 100, protein: 10, carbs: 10, fat: 2 }, grams: 200 },
      { food: { kcal: 900, protein: 0, carbs: 0, fat: 100 }, grams: 10 },
    ],
    400,
  );
  assert.equal(r.kcal, 72.5);
  assert.ok(Math.abs(r.fat - 3.5) < 1e-10);
  assert.equal(totals([{ food: r, grams: 200 }]).protein, 10);
  assert.throws(() => recipe([], 0));
});
test("progression requires every set, RIR and technique", () => {
  const e = {
    min: 8,
    max: 12,
    sets: [{ weight: 10, reps: 12, rir: 2, done: true }],
  };
  assert.match(suggestion(e, 2, 1, true), /Consider/);
  assert.doesNotMatch(suggestion(e, 2, 1, false), /Consider/);
  e.sets[0].rir = 1;
  assert.doesNotMatch(suggestion(e, 2, 1, true), /Consider/);
});
test("backup retries deduplicate and differing records survive", () => {
  const a = { id: "a", v: 1 },
    b = { id: "a", v: 2 };
  const once = mergeRecords([a], [a, b]);
  assert.equal(once.length, 2);
  assert.equal(mergeRecords(once, [a, b]).length, 2);
  assert.equal(once[0].v, 1);
});
