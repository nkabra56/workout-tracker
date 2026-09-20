import test from "node:test";
import assert from "node:assert/strict";
import {
  templates,
  newSession,
  sessionDefinition,
  editSession,
  exerciseIdentity,
  sameExercise,
  validateRecord,
} from "../core.js";
import { reconcile } from "../sync-server.mjs";
test("future templates create independent snapshots and leave default routines untouched", () => {
  const original = newSession(0),
    definition = structuredClone(templates[0]);
  definition.name = "Custom chest";
  definition.exercises.splice(1, 1);
  const future = newSession(0, "lb", 2.5, definition);
  assert.equal(original.exercises.length, 5);
  assert.equal(future.exercises.length, 4);
  assert.equal(templates[0].exercises.length, 5);
  definition.exercises[0].name = "Changed again";
  assert.equal(future.exercises[0].name, "Flat dumbbell bench press");
  validateRecord("sessions", future);
});
test("reordering keeps logged entries by exercise identity", () => {
  const session = newSession(0);
  session.exercises[0].sets[0] = {
    weight: "40",
    reps: "8",
    rir: "3",
    done: true,
  };
  const draft = sessionDefinition(session);
  draft.exercises.reverse();
  const edited = editSession(session, draft);
  const moved = edited.exercises.find(
    (e) => exerciseIdentity(e) === exerciseIdentity(session.exercises[0]),
  );
  assert.equal(moved.sets[0].weight, "40");
  assert.equal(session.exercises[0].name, "Flat dumbbell bench press");
  assert.equal(edited.editArchive.length, 1);
});
test("replacement clears old exercise numbers and preserves archive", () => {
  const session = newSession(0);
  session.exercises[0].sets[0].weight = "40";
  const draft = sessionDefinition(session);
  draft.exercises[0].name = "Machine chest press";
  draft.exercises[0].exerciseId = "custom-chest";
  const edited = editSession(session, draft);
  assert.equal(edited.exercises[0].sets[0].weight, "");
  assert.equal(edited.editArchive[0].exercises[0].sets[0].weight, "40");
  assert.equal(sameExercise(edited.exercises[0], session.exercises[0]), false);
});
test("completed sessions reject editing and server preserves original snapshots", () => {
  const s = newSession(0);
  s.finished = true;
  assert.throws(() => editSession(s, sessionDefinition(s)), /read-only/);
  let state = reconcile({}, [{ store: "sessions", record: s }]);
  const base = state["sessions:" + s.id].version;
  state = reconcile(state, [
    { store: "sessions", base, record: { ...s, title: "Renamed" } },
  ]);
  assert.equal(state["sessions:" + s.id].record.title, templates[0].name);
  assert.equal(Object.keys(state).length, 2);
});
test("custom template sync conflicts stay separate and retry safely", () => {
  const r = {
    id: "template-0",
    type: "template",
    day: 0,
    ...structuredClone(templates[0]),
  };
  validateRecord("settings", r);
  let state = reconcile({}, [{ store: "settings", record: r }]);
  const changed = { ...r, name: "Alternate" };
  state = reconcile(state, [{ store: "settings", record: changed }]);
  assert.equal(Object.keys(state).length, 2);
  assert.equal(
    Object.keys(reconcile(state, [{ store: "settings", record: changed }]))
      .length,
    2,
  );
  assert.equal(state["settings:template-0"].record.name, r.name);
});
test("invalid custom rep/rest/set bounds are rejected", () => {
  const r = {
    id: "template-0",
    type: "template",
    day: 0,
    ...structuredClone(templates[0]),
  };
  r.exercises[0].sets = 0;
  assert.throws(() => validateRecord("settings", r));
  r.exercises[0].sets = 3;
  r.exercises[0].min = 20;
  r.exercises[0].max = 8;
  assert.throws(() => validateRecord("settings", r));
});
