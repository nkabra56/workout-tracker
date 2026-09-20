import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession, templates, sessionCorrection, saveSessionCorrection, mergeRecords} from '../core.js';
import {reconcile, syncDisk} from '../sync-server.mjs';
import {exerciseGroups, exerciseSeries, weeklyActivity} from '../progress.js';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const today='2026-09-20';
function recorded() {
  const s=newSession(0,'lb',2.5,templates[0],'2026-09-18');
  s.finished=true;
  Object.assign(s.exercises[0].sets[0],{weight:'40',reps:'8',rir:'2',done:true});
  return s;
}
test('completed correction is detached, cancel leaves data intact, save preserves identity and snapshot',()=>{
  const s=recorded(), original=structuredClone(s), routine=structuredClone(templates[0]);
  const abandoned=sessionCorrection(s); abandoned.notes='discard'; abandoned.exercises[0].sets[0].weight='99';
  assert.deepEqual(s,original);
  const d=sessionCorrection(s); d.date='2026-09-17'; d.notes='corrected'; d.cardio='12';
  Object.assign(d.exercises[0].sets[0],{weight:'45',reps:'10',rir:'1',done:true});
  const corrected=saveSessionCorrection(s,d,today);
  assert.equal(corrected.id,s.id); assert.equal(corrected.createdAt,s.createdAt);
  assert.equal(corrected.date,'2026-09-17'); assert.equal(corrected.notes,'corrected');
  assert.equal(corrected.exercises[0].sets[0].weight,'45');
  assert.deepEqual(corrected.exercises[0].rest,s.exercises[0].rest);
  assert.deepEqual(templates[0],routine); assert.deepEqual(s,original);
  d.date='2026-02-30'; assert.throws(()=>saveSessionCorrection(s,d,today),/valid workout date/);
  d.date='2026-09-21'; assert.throws(()=>saveSessionCorrection(s,d,today),/future workout/);
  d.finished=false; assert.equal(saveSessionCorrection(s,d,today).finished,false);
});
test('completed corrections change chart values, actual dates, set counts and completion totals',()=>{
  const s=recorded(),d=sessionCorrection(s);
  d.date='2026-09-10'; d.exercises[0].sets[0].weight='50'; d.exercises[0].sets[0].reps='10';
  const corrected=saveSessionCorrection(s,d,today);
  const group=exerciseGroups([corrected],30,today)[0];
  assert.equal(exerciseSeries(group,'volume').points[0].value,500);
  assert.equal(exerciseSeries(group).points[0].date,'2026-09-10');
  assert.equal(weeklyActivity([corrected],30,today).find(w=>w.date==='2026-09-07').sessions,1);
  d.exercises[0].sets[0].done=false;
  const unmarked=saveSessionCorrection(s,d,today);
  assert.equal(exerciseSeries(exerciseGroups([unmarked],30,today)[0]).points.length,0);
  d.finished=false;
  assert.equal(exerciseGroups([saveSessionCorrection(s,d,today)],30,today).length,0);
});
test('versioned completed edit succeeds, stale correction remains an excluded alternative',()=>{
  const s=recorded(), key='sessions:'+s.id;
  let state=reconcile({},[{store:'sessions',record:s}]); const base=state[key].version;
  const d=sessionCorrection(s);d.notes='first correction';
  state=reconcile(state,[{store:'sessions',record:saveSessionCorrection(s,d,today),base}]);
  assert.equal(state[key].record.notes,'first correction');
  d.notes='stale correction';const stale={store:'sessions',record:saveSessionCorrection(s,d,today),base};
  state=reconcile(state,[stale]); assert.equal(Object.keys(state).length,2);
  assert.equal(Object.keys(reconcile(state,[stale])).length,2);
  assert.equal(weeklyActivity(Object.values(state).map(x=>x.record),30,today).reduce((n,w)=>n+w.sessions,0),1);
});
test('offline deletion survives disk reload, stale edits, retries and stale backup import',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lifty-session-delete-'));
  try {
    const s=recorded(),key='sessions:'+s.id;
    const first=await syncDisk(dir,[{store:'sessions',record:s}]);const base=first[0].version;
    const d=sessionCorrection(s);d.notes='newer edit'; const edit={store:'sessions',record:saveSessionCorrection(s,d,today),base};
    await syncDisk(dir,[edit]);
    const deletion={store:'sessions',record:{...s,_deleted:true},base};
    let rows=await syncDisk(dir,[deletion]);
    assert.equal(rows.find(x=>x.record.id===s.id).record._deleted,true);
    assert.equal(rows.find(x=>x.record.id===s.id).record.notes,'newer edit');
    rows=await syncDisk(dir,[edit,deletion]);
    assert.equal(rows.length,1); assert.equal(rows[0].record._deleted,true);
    const reverse=reconcile(reconcile({},[{store:'sessions',record:s},deletion]),[edit]);
    assert.equal(reverse[key].record._deleted,true);assert.equal(Object.keys(reverse).length,1);
    const reload=await syncDisk(dir,[]);const records=reload.map(x=>x.record);
    assert.equal(exerciseGroups(records,30,today).length,0);
    assert.equal(weeklyActivity(records,30,today).reduce((n,w)=>n+w.sessions,0),0);
    assert.equal(mergeRecords(records,[s],true)[0]._deleted,true);
    assert.equal(mergeRecords([s],records,true)[0]._deleted,true);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
