import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,applySyncRecord} from '../core.js';
import {reconcile} from '../sync-server.mjs';
const row=s=>s.exercises[0].sets[0];
test('typing weight, reps, RIR and Done across in-flight acknowledgements creates no self-conflict',()=>{
  let current={...newSession(0),_dirty:true}, state={};
  const key='sessions:'+current.id;
  const send=()=>{const snapshot=structuredClone(current);state=reconcile(state,[{store:'sessions',record:snapshot,base:snapshot._base}]);return snapshot;};
  const receive=snapshot=>{current=applySyncRecord(current,snapshot,state[key]);};
  let snapshot=send(); row(current).weight='40'; receive(snapshot);
  assert.equal(current._dirty,true);assert.equal(row(current).weight,'40');
  snapshot=send(); row(current).reps='8';row(current).rir='2';row(current).done=true;receive(snapshot);
  assert.equal(current._dirty,true);assert.equal(row(current).done,true);
  snapshot=send();receive(snapshot);
  assert.equal(current._dirty,false);assert.equal(Object.keys(state).length,1);
  assert.deepEqual(row(state[key].record),{weight:'40',reps:'8',rir:'2',done:true});
  assert.deepEqual(row(current),row(state[key].record));
  snapshot=send();receive(snapshot);assert.equal(Object.keys(state).length,1);
});
test('a genuine remote edit is not acknowledged as this device snapshot',()=>{
  const source={...newSession(0),_dirty:true},snapshot=structuredClone(source),current=structuredClone(source);
  row(snapshot).weight='40';row(current).weight='45';
  const remote=structuredClone(source);row(remote).weight='60';
  const kept=applySyncRecord(current,snapshot,{store:'sessions',record:remote,version:'remote'});
  assert.equal(row(kept).weight,'45');assert.equal(kept._base,undefined);assert.equal(kept._dirty,true);
});
test('deletion during upload retains tombstone and advances acknowledged base',()=>{
  const snapshot={...newSession(0),_dirty:true},current={...snapshot,_deleted:true};
  const state=reconcile({},[{store:'sessions',record:snapshot}]),item=state['sessions:'+snapshot.id];
  const kept=applySyncRecord(current,snapshot,item);
  assert.equal(kept._deleted,true);assert.equal(kept._dirty,true);assert.equal(kept._base,item.version);
  const remoteDelete={...item,record:{...item.record,_deleted:true}};
  const result=applySyncRecord(snapshot,snapshot,remoteDelete);
  assert.equal(result._deleted,true);assert.equal(result._dirty,false);
});
