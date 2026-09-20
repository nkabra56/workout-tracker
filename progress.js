import { sectionLinks } from "./navigation.js";
import { convertWeight, exerciseIdentity, templates } from './core.js';
const DAY = 86400000;
export const dateNumber = date => Date.parse(date + 'T00:00:00Z');
export const isoDate = n => new Date(n).toISOString().slice(0,10);
export function inRange(date, days, today) {
  const n = dateNumber(date), end = dateNumber(today);
  return Number.isFinite(n) && n <= end && (!days || n >= end - (days - 1) * DAY);
}
export function legacyWeighIn(settings, records) {
  if (records.some(r => r.id === 'bodyweight-legacy') || !(Number(settings.bodyWeight) > 0 && Number(settings.bodyWeight) <= 2000)) return null;
  return {id:'bodyweight-legacy', type:'weighin', value:Number(settings.bodyWeight), unit:settings.bodyWeightUnit || settings.unit || 'lb', date:null, legacy:true, note:'Saved in previous preferences; measurement date was not recorded.'};
}
export function weightSeries(records, unit, days, today) {
  const all = records.filter(r => r.type === 'weighin' && !r._deleted && !r.conflictOf && r.date && inRange(r.date,0,today)).map(r => ({...r,value:convertWeight(r.value,r.unit,unit)})).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const daily = new Map();
  for (const r of all) {const v=daily.get(r.date)||[];v.push(r.value);daily.set(r.date,v);}
  const means = [...daily].map(([date,values])=>({date,value:values.reduce((a,b)=>a+b,0)/values.length}));
  const raw = all.filter(r=>inRange(r.date,days,today));
  const average = means.filter(r=>inRange(r.date,days,today)).flatMap(r=>{
    const window=means.filter(p=>dateNumber(p.date)<=dateNumber(r.date) && dateNumber(p.date)>dateNumber(r.date)-7*DAY);
    return window.length>=3 ? [{date:r.date,value:window.reduce((sum,p)=>sum+p.value,0)/window.length,count:window.length}] : [];
  });
  return {raw,average,change:raw.length>=2 && raw[0].date!==raw.at(-1).date ? raw.at(-1).value-raw[0].value : null};
}
const numeric = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value)>=0;
export function setStats(ex) {
  const done=ex.sets.filter(s=>s.done), loaded=done.filter(s=>numeric(s.weight)&&numeric(s.reps)&&Number(s.reps)>0);
  const top=[...loaded].sort((a,b)=>Number(b.weight)-Number(a.weight)||Number(b.reps)-Number(a.reps))[0];
  return {count:done.length, measured:loaded.length, volume:loaded.reduce((sum,s)=>sum+Number(s.weight)*Number(s.reps),0), top:top ? {weight:Number(top.weight),reps:Number(top.reps)} : null};
}
export function exerciseGroups(sessions, days, today) {
  const groups=new Map();
  for (const session of sessions.filter(s=>s.finished&&!s._deleted&&!s.conflictOf&&inRange(s.date,days,today)).sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||a.id).localeCompare(b.createdAt||b.id))) {
    for (const ex of session.exercises) {
      const key=JSON.stringify([session.template,exerciseIdentity(ex),ex.min,ex.max,!!ex.each,ex.equipment||'',session.unit]);
      if(!groups.has(key))groups.set(key,{key,name:ex.name,day:session.template+1,min:ex.min,max:ex.max,each:!!ex.each,equipment:ex.equipment||'',unit:session.unit,rows:[]});
      groups.get(key).rows.push({session,ex,...setStats(ex)});
    }
  }
  return [...groups.values()];
}
export function weeklyActivity(sessions, days, today) {
  const end=dateNumber(today), dow=(new Date(end).getUTCDay()+6)%7, monday=end-dow*DAY;
  const weeks=Array.from({length:days?Math.min(13,Math.ceil((days+dow)/7)):12},(_,i)=>({date:isoDate(monday-(i)*7*DAY),sessions:0,sets:0})).reverse();
  for(const s of sessions.filter(s=>s.finished&&!s._deleted&&!s.conflictOf&&inRange(s.date,days,today))) {
    const n=dateNumber(s.date), week=weeks.find(w=>n>=dateNumber(w.date)&&n<dateNumber(w.date)+7*DAY);
    if(week){week.sessions++;week.sets+=s.exercises.reduce((sum,e)=>sum+setStats(e).count,0);}
  }
  return weeks;
}
export function exerciseSeries(group, metric = 'load') {
  const modes = {
    load: {label:'Heaviest load', unit:group?.unit || 'lb', description:'Heaviest fully recorded completed set in each session.'},
    reps: {label:'Reps at heaviest load', unit:'reps', description:'Reps in the heaviest fully recorded completed set. Loads may differ; more reps alone does not prove increased strength.'},
    volume: {label:'Completed load-volume', unit:(group?.unit || 'lb')+'·reps', description:'Sum of weight × reps. Only sessions with load and reps recorded for every completed set are plotted. Set counts can differ.'}
  };
  const mode = modes[metric] || modes.load;
  const points = (group?.rows || []).flatMap(r => {
    if (metric === 'volume') return r.count > 0 && r.measured === r.count ? [{date:r.session.date,value:r.volume,detail:r.count+' completed sets',id:r.session.id}] : [];
    return r.top ? [{date:r.session.date,value:metric==='reps'?r.top.reps:r.top.weight,detail:r.top.weight+' '+group.unit+' × '+r.top.reps+' reps',id:r.session.id}] : [];
  });
  return {...mode,points,missing:(group?.rows.length || 0)-points.length};
}
const fmt=n=>Number(n.toFixed(1)).toLocaleString();
const signed=n=>(n>0?'+':'')+fmt(n);
function chart(raw, average, unit, esc, connect = false) {
  if(!raw.length)return '<p class="empty-progress">No recorded points for this chart in the selected period.</p>';
  const points=[...raw,...average], values=points.map(p=>p.value), lo=Math.min(...values), hi=Math.max(...values), pad=Math.max((hi-lo)*.15,.5), min=Math.max(0,lo-pad),max=hi+pad;
  const start=dateNumber(raw[0].date),end=dateNumber(raw.at(-1).date);
  const x=p=>end===start?170:48+(dateNumber(p.date)-start)/(end-start)*264;
  const y=p=>132-(p.value-min)/(max-min)*106;
  return `<svg class="progress-chart" viewBox="0 0 330 174" role="img" aria-label="Recorded ${esc(unit)} measurements from ${raw[0].date} to ${raw.at(-1).date}. ${average.length?'Dots are actual entries; rings are available seven-day averages.':'Dots are actual recorded sessions.'} No missing measurements are filled."><line x1="48" x2="312" y1="132" y2="132" class="chart-grid"/><line x1="48" x2="312" y1="26" y2="26" class="chart-grid"/><text x="3" y="31">${fmt(max)}</text><text x="3" y="136">${fmt(min)}</text><text x="48" y="161">${raw[0].date.slice(5)}</text>${end!==start?`<text x="312" y="161" text-anchor="end">${raw.at(-1).date.slice(5)}</text>`:''}${connect&&raw.length>1?`<polyline points="${raw.map(p=>`${x(p)},${y(p)}`).join(' ')}" class="chart-connection"/>`:''}${raw.map(p=>`<circle cx="${x(p)}" cy="${y(p)}" r="3.5" class="chart-point"><title>${p.date}: ${fmt(p.value)} ${esc(unit)}</title></circle>`).join('')}${average.map(p=>`<circle cx="${x(p)}" cy="${y(p)}" r="5.5" class="chart-average"><title>${p.date}: seven-day mean ${fmt(p.value)} ${esc(unit)} from ${p.count} recorded days</title></circle>`).join('')}</svg>`;
}
export function renderProgress({sessions,weighIns,range,unit,exerciseKey,exerciseMetric="load",view="body",draft,today,esc}) {
  const days=Number(range), series=weightSeries(weighIns,unit,days,today), groups=exerciseGroups(sessions,days,today), group=groups.find(g=>g.key===exerciseKey)||groups[0], weeks=weeklyActivity(sessions,days,today);
  const visible=weighIns.filter(r=>!r._deleted&&(!r.date||inRange(r.date,days,today))).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const latest=series.raw.at(-1), prior=series.raw[0], selected=group?.rows.at(-1), previous=group?.rows.at(-2), plot=exerciseSeries(group,exerciseMetric);
  const counts=sessions.filter(s=>s.finished&&!s._deleted&&!s.conflictOf&&inRange(s.date,days,today));
  const form=draft||{date:today,value:'',unit,note:''};
  const header = `<div class="page-title"><div><p class="eyebrow">THE LONG VIEW</p><h1>Progress</h1></div><label class="progress-filter">Period<select id="progress-range">${[[7,'7 days'],[30,'30 days'],[90,'90 days'],[0,'All time']].map(([n,label])=>`<option value="${n}" ${n===days?'selected':''}>${label}</option>`).join('')}</select></label></div>
`;
  const body = `  <article class="progress-card"><div class="section-title"><h2>Body weight</h2><label class="progress-filter">Display<select id="progress-unit"><option ${unit==='lb'?'selected':''}>lb</option><option ${unit==='kg'?'selected':''}>kg</option></select></label></div><p>Separate from the weights you lift.</p>
  <div class="weight-summary"><strong>${latest?fmt(latest.value):'—'} <small>${unit}</small></strong><span>${latest?`Latest in period · ${latest.date}`:'No dated entry in this period'}</span></div>
  <details id="weight-entry" ${draft?'open':''}><summary class="weight-log-action">${draft?'Edit body weight':'Log body weight'}</summary><form id="weight-form" data-unit="${form.unit}"><input type="hidden" name="recordId" value="${esc(form.id||'')}"><div class="weight-fields"><label>Date<input type="date" name="date" max="${today}" value="${form.date||''}" required></label><label>Weight<input type="number" name="value" inputmode="decimal" min="0.1" max="2000" step="any" value="${form.value===''?'':String(form.value)}" required></label><label>Unit<select name="unit" id="weight-entry-unit"><option ${form.unit==='lb'?'selected':''}>lb</option><option ${form.unit==='kg'?'selected':''}>kg</option></select></label></div><label>Note (optional)<input name="note" maxlength="500" value="${esc(form.note||'')}" placeholder="e.g. morning measurement"></label><div class="weight-actions"><button>${draft?'Save correction':'Save body weight'}</button><button type="button" class="secondary" id="weight-cancel">Cancel</button></div></form></details>
  ${chart(series.raw,series.average,unit,esc)}<p class="chart-legend">Blue dots: recorded weight · pale rings: 7-day mean.</p><p class="progress-caption">${series.change===null?'Add measurements on at least two dates to see change.':`${signed(series.change)} ${unit} from ${prior.date} to ${latest.date} (${Math.round((dateNumber(latest.date)-dateNumber(prior.date))/DAY)} days between actual entries).`}</p><p class="progress-caption">${series.average.length?`Latest 7-day mean: ${fmt(series.average.at(-1).value)} ${unit} on ${series.average.at(-1).date}. `:''}A mean appears with at least 3 recorded days in a 7-day window; each recorded day counts equally. Missing days are never filled.</p>
  <details><summary>Weight history · ${visible.length} ${visible.length===1?'entry':'entries'}</summary>${visible.map(r=>`<div class="weight-history"><div><b>${fmt(convertWeight(r.value,r.unit,unit))} ${unit}</b><small>${r.date||'Date not recorded · previous preference'}${r.unit!==unit?` · entered ${fmt(r.value)} ${r.unit}`:''}${r.conflictOf?' · Alternative, excluded from trend':''}</small>${r.note?`<p>${esc(r.note)}</p>`:''}</div><div class="weight-actions"><button class="secondary" data-weight-edit="${r.id}">${r.date?'Edit':'Add date'}</button><button class="secondary" data-weight-delete="${r.id}">Delete</button></div></div>`).join('')||'<p>No entries in this period.</p>'}</details></article>
`;
  const activity = `  <article class="progress-card"><h2>Training consistency</h2><div class="metrics"><div><strong>${counts.length}</strong><small>Completed sessions</small></div><div><strong>${counts.reduce((n,s)=>n+s.exercises.reduce((m,e)=>m+setStats(e).count,0),0)}</strong><small>Completed sets</small></div></div><p class="progress-caption">Within the selected period. In-progress sessions and conflict alternatives are excluded.</p><div class="weekly-chart" role="img" aria-label="Weekly completed sessions; exact counts in weekly details below">${weeks.slice(-6).map(w=>`<div><meter min="0" max="${Math.max(1,...weeks.map(x=>x.sessions))}" value="${w.sessions}" aria-label="Week ${w.date}: ${w.sessions} sessions"></meter><span>${w.date.slice(5)}</span><b>${w.sessions}</b></div>`).join('')}</div>${weeks.length>6?'<p class="progress-caption">Chart shows the latest 6 weeks in this period.</p>':''}<details><summary>Weekly details${!days?' · latest 12 weeks':''}</summary>${weeks.map(w=>`<p>Week of ${w.date}: ${w.sessions} sessions · ${w.sets} sets</p>`).join('')}<p>Boundary weeks may be partial. Each week starts Monday.</p></details></article>
<a class="section-card" href="#workout/history"><strong>Session history</strong><span>Open completed, unfinished and planned workouts →</span></a>`;
  const exercises = `  <article class="progress-card" id="exercise-charts"><h2>Exercise charts</h2>${groups.length?`<label>Comparable exercise<select id="progress-exercise">${groups.map(g=>`<option value="${esc(g.key)}" ${g===group?'selected':''}>D${g.day} · ${esc(g.name)} · ${g.min}–${g.max} · ${esc(g.equipment||'unlabeled equipment')} · ${g.unit}</option>`).join('')}</select></label><p class="progress-caption">Same exercise identity, day, rep target, equipment and unit. Label equipment in your workout to distinguish machines. ${group.each?'Loads/reps are entered per side; volume is not doubled.':''}</p><div class="weight-summary"><strong>${selected.top?`${fmt(selected.top.weight)} <small>${group.unit} × ${selected.top.reps}</small>`:'—'}</strong><span>Heaviest completed set · ${selected.session.date}</span></div><p>${previous&&previous.top&&selected.top?`${signed(selected.top.weight-previous.top.weight)} ${group.unit}; ${signed(selected.top.reps-previous.top.reps)} reps at each session’s heaviest load vs ${previous.session.date}.`:'Complete two comparable sessions with recorded loads and reps to compare.'}</p><p class="progress-caption">${previous&&selected.top&&previous.top&&selected.top.weight!==previous.top.weight?'Reps were performed at different loads; these changes are not equivalent. ':''}Recorded performance, not an estimate of muscle growth or maximal strength.</p>${`<label>Chart metric<select id="progress-metric">${[["load","Load"],["reps","Reps"],["volume","Volume"]].map(([value,label])=>`<option value="${value}" ${value===exerciseMetric?"selected":""}>${label}</option>`).join("")}</select></label><h3 class="chart-title">${plot.label} <small>(${plot.unit})</small></h3>${chart(plot.points,[],plot.unit,esc,true)}<p class="chart-legend">${plot.points.length===1?"One recorded point; complete another comparable session to see change.":plot.points.length>1?"Dots are recorded sessions; lines only connect observations, not estimated workouts.":"Complete a comparable session with the required values to start this chart."}</p><p class="progress-caption">${plot.description} ${plot.missing?`${plot.missing} sessions omitted because required values are missing.`:""}</p><details><summary>Chart values · ${plot.points.length} points</summary>${plot.points.map(p=>`<p><b>${p.date}</b> · ${fmt(p.value)} ${plot.unit}<br>${esc(p.detail)}</p>`).join("")||"<p>No recorded points.</p>"}</details>`}<p><b>${selected.count} completed sets · ${selected.measured?fmt(selected.volume)+' '+group.unit+'·reps':'No recorded load-volume'}</b></p><p class="progress-caption">Load-volume sums weight × reps for ${selected.measured} fully recorded sets in the latest session. ${selected.count-selected.measured} completed sets lack load or reps. Zero load is allowed; missing values are not zero. Compare only this equipment and recording convention.</p><details><summary>Comparable session details · ${group.rows.length}</summary>${[...group.rows].reverse().map(r=>`<p><b>${r.session.date}</b> · ${r.count} completed sets<br>${r.top?`${fmt(r.top.weight)} ${group.unit} × ${r.top.reps} heaviest set`:'No complete load/rep entry'} · ${r.measured?`${fmt(r.volume)} ${group.unit}·reps`:'volume unavailable'}<br>${r.ex.sets.filter(s=>s.done).map(s=>`${numeric(s.weight)?fmt(Number(s.weight)):'—'} ${group.unit} × ${numeric(s.reps)?fmt(Number(s.reps)):'—'}`).join(', ')}</p>`).join('')}</details>`:'<p>Finish a workout to see exercise progress. Your first completed session becomes the baseline.</p>'}</article>
`;
  return header + sectionLinks('progress',view) + ({body,exercises,activity}[view] || body);
}
