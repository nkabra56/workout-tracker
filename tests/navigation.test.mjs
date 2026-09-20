import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFor, sectionLinks } from '../navigation.js';
import { renderProgress } from '../progress.js';
import { newSession } from '../core.js';
test('named subsection routes retain major area and stable reloadable session identity',()=>{
 assert.equal(routeFor('#nutrition/recipe').area,'today');
 assert.deepEqual(routeFor('#workout/session/saved-123'),{area:'workout',section:'session',id:'saved-123'});
 assert.equal(routeFor('#workout/session/<script>').id,null);
 assert.equal(routeFor('#progress').section,'body');
 assert.equal(routeFor('#progress/unknown').section,'body');
 assert.equal(routeFor('#unknown').area,'today');
 for(const path of ['#workout/routines','#workout/history','#progress/exercises','#progress/activity'])assert.notEqual(routeFor(path).section,undefined);
});
test('section navigation identifies one active page and keeps named workout destinations',()=>{
 const html=sectionLinks('workout','history');
 assert.match(html,/href="#workout\/history" aria-current="page"/);
 assert.match(html,/href="#workout\/routines"/);
 assert.equal((html.match(/aria-current/g)||[]).length,1);
});
test('Progress pages separate body weight, exercise charts and activity without removing capabilities',()=>{
 const s=newSession(4,'lb',2.5,undefined,'2026-09-08');s.finished=true;s.exercises[0].sets[0]={done:true,weight:40,reps:10,rir:3};
 const args={sessions:[s],weighIns:[],range:90,unit:'lb',exerciseKey:'',draft:null,today:'2026-09-20',esc:x=>String(x??'')};
 const body=renderProgress({...args,view:'body'});
 assert.match(body,/Log body weight/);assert.doesNotMatch(body,/<h2>Exercise charts/);assert.doesNotMatch(body,/<h2>Training consistency/);
 const exercises=renderProgress({...args,view:'exercises'});
 assert.match(exercises,/progress-metric/);assert.match(exercises,/Chart values/);assert.doesNotMatch(exercises,/weight-form/);
 const activity=renderProgress({...args,view:'activity'});
 assert.match(activity,/<h2>Training consistency/);assert.match(activity,/#workout\/history/);assert.doesNotMatch(activity,/progress-metric/);
});
