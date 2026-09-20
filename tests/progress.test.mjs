import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyWeighIn, weightSeries, setStats, exerciseGroups, weeklyActivity, inRange } from '../progress.js';
import { validateRecord, newSession, sessionsOnDate, convertWeight } from '../core.js';
import { reconcile } from '../sync-server.mjs';
const w=(id,date,value,unit='lb',extra={})=>({id,type:'weighin',date,value,unit,note:'',...extra});
test('body-weight validation and legacy migration preserve undated values without duplication',()=>{
 const old={bodyWeight:180,bodyWeightUnit:'lb'};
 const legacy=legacyWeighIn(old,[]); assert.equal(legacy.date,null); assert.equal(legacy.value,180);
 assert.equal(validateRecord('settings',legacy),true);
 assert.equal(legacyWeighIn(old,[legacy]),null);
 assert.equal(legacyWeighIn(old,[{...legacy,_deleted:true}]),null);
 for(const patch of [{value:0},{value:NaN},{date:'2026-02-30'},{unit:'stone'},{date:null}])assert.throws(()=>validateRecord('settings',{...w('w','2026-09-01',180),...patch}));
});
test('weight trend uses raw observations and daily means without filling gaps or counting conflicts',()=>{
 const data=[w('a','2026-09-01',180),w('b','2026-09-01',182),w('c','2026-09-03',179),w('d','2026-09-05',178),w('e','2026-09-15',176),w('alt','2026-09-05',300,'lb',{conflictOf:'d'}),w('gone','2026-09-07',300,'lb',{_deleted:true}),w('old',null,190,'lb',{legacy:true})];
 const s=weightSeries(data,'lb',30,'2026-09-20');
 assert.equal(s.raw.length,5); assert.equal(s.average.length,1); assert.equal(s.average[0].date,'2026-09-05'); assert.equal(s.average[0].value,(181+179+178)/3); assert.equal(s.change,-4);
 assert.equal(weightSeries(data,'lb',7,'2026-09-20').change,null);
 assert.equal(weightSeries(data,'kg',30,'2026-09-20').raw[0].value,convertWeight(180,'lb','kg'));
});
test('weigh-in corrections, deletes and stale offline edits use conflict-safe existing sync',()=>{
 const original=w('weight','2026-09-01',180), first=reconcile({},[{store:'settings',record:original}]);
 const base=first['settings:weight'].version;
 const changed=reconcile(first,[{store:'settings',record:{...original,value:181},base}]);
 const stale=reconcile(changed,[{store:'settings',record:{...original,value:179},base}]);
 assert.equal(Object.values(stale).length,2);
 assert.equal(weightSeries(Object.values(stale).map(x=>x.record),'lb',0,'2026-09-20').raw.length,1);
 const deleted=reconcile(stale,[{store:'settings',record:{...changed['settings:weight'].record,_deleted:true},base:changed['settings:weight'].version}]);
 assert.equal(weightSeries(Object.values(deleted).map(x=>x.record),'lb',0,'2026-09-20').raw.length,0);
});
test('exercise progress does not treat missing load as zero or mix units/equipment/conflicts',()=>{
 const s=newSession(0);s.date='2026-09-10';s.finished=true;
 s.exercises[0].equipment='Machine A';s.exercises[0].sets=[{done:true,weight:'40',reps:'8'},{done:true,weight:'',reps:'8'},{done:false,weight:'99',reps:'99'}];
 assert.deepEqual(setStats(s.exercises[0]),{count:2,measured:1,volume:320,top:{weight:40,reps:8}});
 const b=structuredClone(s);b.id='b';b.exercises[0].equipment='Machine B';
 const kg=structuredClone(s);kg.id='kg';kg.unit='kg';
 const alt={...s,id:'alt',conflictOf:s.id};
 const groups=exerciseGroups([s,b,kg,alt],30,'2026-09-20').filter(g=>g.name===s.exercises[0].name);
 assert.equal(groups.length,3);assert.ok(groups.every(g=>g.rows.length===1));
});
test('arbitrary calendar date and Day5 routine survive serialization, resume by exact match and count actual dates',()=>{
 const s=newSession(4,'lb',2.5,undefined,'2026-09-08');
 assert.equal(s.template,4);assert.equal(s.date,'2026-09-08');
 const reload=JSON.parse(JSON.stringify(s));
 assert.equal(sessionsOnDate([reload],s.date,4)[0].id,s.id);
 assert.equal(sessionsOnDate([reload],'2026-09-09',4).length,0);
 assert.equal(sessionsOnDate([{...reload,conflictOf:'x'}],s.date,4).length,0);
 s.finished=true;s.exercises[0].sets[0].done=true;
 const weeks=weeklyActivity([s],30,'2026-09-20');
 assert.equal(weeks.find(w=>w.date==='2026-09-07').sessions,1);
 assert.equal(weeks.find(w=>w.date==='2026-09-14').sessions,0);
 assert.equal(inRange('2026-09-08',7,'2026-09-20'),false);
 assert.equal(inRange('2026-09-21',0,'2026-09-20'),false);
 assert.throws(()=>newSession(4,'lb',2.5,undefined,'2026-02-30'));
});

test('exercise chart metrics use actual sessions, skip incomplete volume and retain explicit zero load',async()=>{
 const {exerciseSeries}=await import('../progress.js');
 const make=(date,sets)=>{const session=newSession(4,'lb',2.5,undefined,date);session.finished=true;session.exercises[0].sets=sets;return session;};
 const a=make('2026-09-08',[{done:true,weight:40,reps:10},{done:true,weight:40,reps:8}]);
 const b=make('2026-09-15',[{done:true,weight:45,reps:8},{done:true,weight:'',reps:8}]);
 const zero=make('2026-09-18',[{done:true,weight:0,reps:10}]);
 const future=make('2026-09-25',[{done:true,weight:60,reps:10}]);
 const group=exerciseGroups([a,b,zero,future,{...a,id:'alt',conflictOf:a.id}],0,'2026-09-20')[0];
 assert.deepEqual(exerciseSeries(group,'load').points.map(p=>[p.date,p.value]),[['2026-09-08',40],['2026-09-15',45],['2026-09-18',0]]);
 assert.deepEqual(exerciseSeries(group,'reps').points.map(p=>p.value),[10,8,10]);
 assert.deepEqual(exerciseSeries(group,'volume').points.map(p=>p.value),[720,0]);
 assert.equal(exerciseSeries(group,'volume').missing,1);
 assert.equal(exerciseSeries(group,'volume').unit,'lb·reps');
 assert.equal(exerciseSeries(undefined).points.length,0);
});
