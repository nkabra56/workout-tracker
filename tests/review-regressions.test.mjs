import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession, validateRecord, mergeRecords, sameExercise, applySyncRecord} from '../core.js';
import {reconcile} from '../sync-server.mjs';

test('session validation rejects impossible dates and malformed completion/cardio data', () => {
  const session = newSession(0);
  for (const patch of [{date:'2026-02-30'}, {date:'2026-13-01'}, {finished:'false'}, {technique:1}, {cardio:-1}, {cardio:'oops'}]) {
    assert.throws(() => validateRecord('sessions', {...session, ...patch}));
  }
  assert.equal(validateRecord('sessions', {...session, date:'2024-02-29', cardio:'12.5'}), true);
});

test('backup merge ignores transport metadata and deduplicates repeated imports', () => {
  const session = newSession(0), synced = {...session, _base:'v1', _dirty:false};
  assert.deepEqual(mergeRecords([synced], [{...session, _dirty:true}]), [synced]);
  const changed = {...session, notes:'offline correction', _base:'old'};
  const merged = mergeRecords([synced], [changed]);
  assert.equal(merged.length, 2);
  assert.equal(mergeRecords(merged, [{...changed, _base:'new', _dirty:false}]).length, 2);
});

test('long record identities produce conflicts that can be edited and synced again', () => {
  const session = {...newSession(0), id:'a'.repeat(160)};
  const first = reconcile({}, [{store:'sessions',record:session}]);
  const state = reconcile(first, [{store:'sessions',record:{...session,notes:'other'}}]);
  const alternative = Object.values(state).find(item => item.record.conflictOf);
  assert.ok(alternative.record.id.length <= 160);
  assert.doesNotThrow(() => reconcile(state, [{store:'sessions',record:{...alternative.record,notes:'edited'},base:alternative.version}]));
  const imported = mergeRecords([session], [{...session,notes:'backup'}])[1];
  assert.equal(validateRecord('sessions', imported), true);
});

test('remote weigh-in deletion wins over a simultaneous local edit', () => {
  const snapshot = {id:'w1',type:'weighin',value:180,_dirty:true};
  const current = {...snapshot,value:185};
  const result = applySyncRecord(current,snapshot,{store:'settings',record:{...snapshot,_deleted:true},version:'deleted'});
  assert.equal(result._deleted,true);
  assert.equal(result._dirty,false);
  assert.equal(result._base,'deleted');
});

test('previous exercise comparisons keep each-side conventions separate', () => {
  const exercise = newSession(0).exercises[0];
  assert.equal(sameExercise(exercise,{...exercise,each:!exercise.each}),false);
  assert.equal(sameExercise(exercise,{...exercise}),true);
});
