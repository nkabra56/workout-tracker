import { routeFor, sectionLinks } from "./navigation.js";
import { renderProgress, legacyWeighIn } from "./progress.js";
import { startAutomaticSync } from "./automatic-sync.js";
import {
  templates,
  newSession,
  validDate,
  sessionsOnDate,
  convertWeight,
  day,
  uid,
  macros,
  suggestion,
  mergeRecords,
  validateRecord,
  exerciseIdentity,
  sameExercise,
  sessionDefinition,
  editSession,
  validDefinition,
} from "./core.js";
import { draftFor, renderEditor, updateDraft } from "./editor.js";
import { readAll, write, remove, sync } from "./storage.js";
if (navigator.locks) {
  const acquired = await new Promise((resolve) =>
    navigator.locks.request(
      "steadily-editor",
      { ifAvailable: true },
      (lock) => {
        resolve(!!lock);
        return lock ? new Promise(() => {}) : undefined;
      },
    ),
  );
  if (!acquired) {
    document.body.textContent =
      "Lifty is open in another tab. Close that tab, then reload here to edit safely.";
    await new Promise(() => {});
  }
}
const app = document.querySelector("#app"),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let syncBusy = false;
let workoutDate = day(), workoutRoutine = 0;
let weighIns = [], progressRange = 90, progressUnit = "lb", progressExercise = "", progressMetric = "load", weightDraft = null;

let definitions = structuredClone(templates),
  templateRecords = [],
  editing = null;
let sessions = [],
  foods = [],
  logs = [],
  settings = {
    id: "preferences",
    unit: "lb",
    increment: 2.5,
    schedule: [0, 1, 2, 3, -1, 4, -1],
    diet: "",
  },
  active,
  timerEnd = 0;
const num = (name, label, value = "", step = "any") =>
  `<label>${label}<input name="${name}" inputmode="decimal" type="number" min="0" step="${step}" value="${esc(value)}" required></label>`;
const toast = (s) => {
  document.querySelector("#toast").textContent = s;
  setTimeout(() => (document.querySelector("#toast").textContent = ""), 5000);
};
async function save(store, r) {
  validateRecord(store, r);
  document.querySelector("#status").textContent = "Saving…";
  try {
    await write(store, r);
    document.querySelector("#status").textContent =
      "Saved on this device · pending Pi sync";
  } catch (e) {
    document.querySelector("#status").textContent =
      "SAVE FAILED — export a backup now";
    throw e;
  }
}
function heading(kicker, title, subtitle) {
  return `<div class="intro"><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div>`;
}
function render() {
  const currentRoute = routeFor(location.hash);
  if (editing && currentRoute.area === "workout") {
    app.innerHTML = renderEditor(
      editing,
      !!active && !active.finished && active.template === editing.day,
      templateRecords.filter((r) => r.day === editing.day && r.conflictOf),
    );
    return;
  }
  const route = currentRoute.area;
  if (route === "workout") active = currentRoute.section === "session" ? sessions.find(s=>s.id===currentRoute.id) : null;
  document
    .querySelectorAll("nav a")
    .forEach((a) => {
      const selected = a.hash === `#${route}`;
      a.classList.toggle("selected", selected);
      if (selected) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  (
    ({
      today: today,
      workout: workout,
      progress: progress,
      settings: preferences,
    })[route] || workout
  )();
}
function today() {
  const date = day(),
    start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const week = sessions.filter(
    (s) =>
      s.finished &&
      !s.conflictOf && !s._deleted && s.date <= date &&
      Date.parse(s.date + "T12:00:00") >= start.getTime(),
  );
  const pending = sessions
    .filter((s) => !s.finished && !s.conflictOf && !s._deleted && s.date <= date)
    .sort((a, b) =>
      (b.createdAt || b.date).localeCompare(a.createdAt || a.date),
    )[0];
  const scheduled = settings.schedule[(new Date().getDay() + 6) % 7];
  const chosen =
    pending?.template ??
    (scheduled >= 0 ? scheduled : (settings.schedule.find((x) => x >= 0) ?? 0));
  const def = pending ? sessionDefinition(pending) : definitions[chosen];
  const complete = pending
    ? pending.exercises.reduce(
        (n, e) => n + e.sets.filter((s) => s.done).length,
        0,
      )
    : 0;
  const count = def.exercises.reduce((n, e) => n + e.sets, 0);
  app.innerHTML = `<div class="page-title"><div><p class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</p><h1>Today</h1></div><a class="round-link" href="#settings" aria-label="Your preferences">${personIcon}</a></div><div class="day-strip" aria-label="This week">${Array.from(
    { length: 7 },
    (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = d.toLocaleDateString("en-CA"),
        done = week.some((s) => s.date === ds);
      return `<div class="${ds === date ? "current-day" : ""}"><span>${["M", "T", "W", "T", "F", "S", "S"][i]}</span><b>${d.getDate()}</b><i class="${done ? "logged-day" : ""}" aria-label="${done ? "Workout complete" : "No completed workout"}"></i></div>`;
    },
  ).join(
    "",
  )}</div><article class="workout-hero"><div class="hero-top"><span class="eyebrow">${pending ? "CONTINUE YOUR SESSION" : scheduled < 0 ? "REST DAY · YOUR NEXT WORKOUT" : "YOUR WORKOUT"}</span><span class="day-pill">Day ${chosen + 1}</span></div><h2>${esc(def.name)}</h2><p>${def.exercises.length} exercises <span>·</span> ${count} working sets <span>·</span> ${pending ? pending.unit : settings.unit}</p>${pending ? `<div class="session-progress"><progress value="${complete}" max="${count}" aria-label="Completed sets"></progress><small>${complete} of ${count} sets complete</small></div>` : ""}<button class="primary-wide" ${pending ? `data-resume="${pending.id}"` : `data-choose="${chosen}"`}>${pending ? "Resume workout" : "Choose date & workout"} <span aria-hidden="true">→</span></button><a class="subtle-link" href="#workout/log">Choose any date or routine</a></article><div class="section-title section-label"><h2>This week</h2><a href="#progress/activity">Activity →</a></div><article class="week-summary"><div><strong>${week.length}</strong><span>sessions completed</span></div><p>Logged on your actual workout dates.<br>Build consistency at your own pace.</p></article><div class="section-cards today-links"><a class="section-card" href="#progress/body"><strong>Body weight</strong><span>Log a measurement or view your trend →</span></a><a class="section-card" href="#progress/exercises"><strong>Exercise charts</strong><span>Loads, reps and volume over time →</span></a></div>`;
}
const personIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg>';
function workoutChooser() {
  const existing = sessionsOnDate(sessions, workoutDate, workoutRoutine);
  const pending = existing.filter(s => !s.finished);
  return `<article class="workout-picker"><h2>Choose your workout</h2><p>Routine Day 1–5 is a plan label, not a weekday. Pick any routine for any calendar date.</p><form id="workout-start"><label class="date-control"><span>Workout date</span><input id="workout-date" name="date" type="date" value="${workoutDate}" required></label><label>Routine<select id="workout-routine" name="routine">${definitions.map((d,i)=>`<option value="${i}" ${i===workoutRoutine?'selected':''}>Day ${i+1} · ${esc(d.name)}</option>`).join('')}</select></label><p>${workoutDate>day()?'Future date · planned session. It will not count as completed training.':'Log your workout on this date, regardless of your optional weekly schedule.'}</p><button ${pending.length>1?'disabled':''}>${pending.length===1?'Resume this workout':pending.length>1?'Choose an existing session below':existing.length?'Start another session':workoutDate>day()?'Plan workout':'Start workout'}</button></form>${existing.length?`<div class="existing-workouts"><h3>Already on ${workoutDate}</h3>${existing.map((r,i)=>`<button class="secondary history" data-resume="${r.id}">${r.finished?'View completed':r.date>day()?'Open planned':'Resume'} session ${i+1} · ${esc(r.title || definitions[r.template].name)}</button>`).join('')}${pending.length?'<button class="secondary" id="workout-additional">Start a separate session</button>':''}</div>`:''}</article><div class="section-cards"><a class="section-card" href="#workout/routines"><strong>Workout routines</strong><span>Browse and edit your five templates →</span></a><a class="section-card" href="#workout/history"><strong>Session history</strong><span>Resume, review or open a planned workout →</span></a></div>`;
}
function workoutRoutines() {
  return `<p>Day numbers label routines. Choose any one on any date.</p><div class="template-grid">${definitions.map((t,i)=>`<div class="template-choice"><button class="template" data-choose="${i}"><small>ROUTINE DAY ${i+1} · ${t.exercises.length} EXERCISES</small><strong>${esc(t.name)}</strong><span>Choose date & start →</span></button><button class="secondary edit-template" data-edit-template="${i}">Edit</button></div>`).join('')}</div>`;
}
function workoutHistory() {
  const records = [...sessions].filter(s=>!s._deleted).sort((a,b)=>b.date.localeCompare(a.date));
  return `<h2>Session history</h2><p>Every recorded workout, on its actual date.</p>${records.map((r,i)=>`<button class="history secondary" data-resume="${r.id}"><strong>${esc(r.title||definitions[r.template].name)}</strong><span>${r.date} · ${r.conflictOf?'Alternative · excluded from totals':r.finished?'Completed':r.date>day()?'Planned':'In progress'}${r.createdAt?' · '+esc(new Date(r.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):''}</span></button>`).join('')||'<p>No sessions yet. Choose a date and routine to begin.</p>'}<a class="section-card" href="#progress/exercises"><strong>Exercise progress</strong><span>Compare recorded loads, reps and volume →</span></a>`;
}
async function startSelectedWorkout(separate = false) {
  if (!validDate(workoutDate)) throw Error("Choose a valid workout date");
  const existing = sessionsOnDate(sessions, workoutDate, workoutRoutine), pending = existing.filter(s=>!s.finished);
  if (!separate && pending.length > 1) { toast("Choose the session you want to resume below."); return; }
  if (!separate && pending.length === 1) active = pending[0];
  else {
    if (existing.length && !confirm("Start a separate workout on this date? Existing sessions will be kept.")) return;
    active = newSession(workoutRoutine, settings.unit, settings.increment, definitions[workoutRoutine], workoutDate);
    sessions.push(active); await save("sessions", active);
  }
  location.hash = "workout/session/" + active.id; workout();
}
function workout() {
  const view=routeFor(location.hash).section;
  if (!active) {
    app.innerHTML = heading('YOUR TRAINING JOURNAL','Train','') + sectionLinks('workout',view==='session'?'log':view) +
      (view==='routines'?workoutRoutines():view==='history'?workoutHistory():workoutChooser());
    return;
  }
  app.innerHTML = `<a class="back-link" href="#workout/history">← All sessions</a><section class="session compact-session"><div class="session-heading"><div><p class="eyebrow">ROUTINE DAY ${active.template + 1} · ${esc(active.date)} · ${active.unit}</p><h2>${esc(active.title || templates[active.template].name)}</h2></div><div class="session-actions">${active.finished ? "" : `<button id="edit-session" class="secondary" aria-label="Edit this workout">Edit</button>`}<button id="close-session" class="secondary">Close</button></div></div>${active.finished ? '<p class="read-only-note">Completed · read-only snapshot</p>' : `<label class="date-control session-date"><span>${active.date>day()?"Planned date":"Workout date"}</span><input id="session-date" type="date" value="${active.date}" required></label>${active.date>day()?'<p>Planned only. Completion is available on the workout date; correct the date if needed.</p>':""}`}<div class="rest compact-rest"><b>Rest</b><input aria-label="Manual rest seconds" id="rest-seconds" inputmode="numeric" type="number" min="1" max="1800" value="90"><button id="timer-start">Start</button><button id="timer-stop" class="secondary">Stop</button><output id="clock" aria-live="off">Ready</output></div>${active.exercises
    .map((ex, i) => {
      const previous = sessions
        .filter(
          (s) =>
            s.finished &&
            !s.conflictOf &&
            s.id !== active.id && s.date <= active.date &&
            s.template === active.template &&
            s.unit === active.unit,
        )
        .sort((a, b) =>
          b.date.localeCompare(a.date) || (b.createdAt || b.date).localeCompare(a.createdAt || a.date),
        )
        .map((s) => s.exercises.find((old) => sameExercise(old, ex)))
        .find(Boolean);
      return `<article class="exercise compact-exercise"><h3><span class="ordinal">${String(i + 1).padStart(2, "0")}</span>${esc(ex.name)}</h3><p class="exercise-target">${ex.sets.length} × ${ex.min}–${ex.max}${ex.each ? " / side" : ""}<span>·</span>${ex.rest[0] === ex.rest[1] ? ex.rest[0] : ex.rest.join("–")}s rest<span>·</span>${active.template === 2 ? "~3" : "2–3"} RIR</p>${previous ? `<details class="previous-data"><summary>Last: ${previous.sets.map((p) => esc(p.weight || "—") + "×" + esc(p.reps || "—")).join(" · ")} ${active.unit}</summary><table><caption>Previous session</caption><thead><tr><th>Set</th><th>${active.unit}</th><th>Reps</th><th>RIR</th></tr></thead><tbody>${previous.sets.map((p, j) => `<tr><td>${j + 1}</td><td>${esc(p.weight || "—")}</td><td>${esc(p.reps || "—")}</td><td>${esc(p.rir || "—")}</td></tr>`).join("")}</tbody></table></details>` : '<small class="previous-empty">No previous session</small>'}<div class="set-head"><span>Set</span><span>${active.unit}</span><span>Reps</span><span>RIR</span><span>Done</span></div>${ex.sets.map((set, j) => `<div class="set-row"><b>${j + 1}</b>${["weight", "reps", "rir"].map((k) => `<input aria-label="${esc(ex.name)} set ${j + 1} ${k}" inputmode="${k === "weight" ? "decimal" : "numeric"}" type="number" min="0" ${k === "rir" ? 'max="10"' : ""} step="${k === "weight" ? "any" : "1"}" data-set="${i},${j},${k}" value="${esc(set[k])}">`).join("")}<input type="checkbox" aria-label="Complete ${esc(ex.name)} set ${j + 1}" data-set="${i},${j},done" ${set.done ? "checked" : ""}></div>`).join("")}<details class="equipment"><summary>Equipment & load increment</summary><label>Equipment / stack label<input data-equipment="${i}" value="${esc(ex.equipment)}" maxlength="200" placeholder="e.g. gym A, cable 1"></label><label>Smallest load increase (${active.unit})<input data-increment="${i}" inputmode="decimal" type="number" min="0.01" step="any" value="${esc(ex.increment || convertWeight(settings.increment, settings.unit, active.unit))}"></label></details></article>`;
    })
    .join(
      "",
    )}<article class="session-finish"><label class="check-label"><input id="technique" type="checkbox" ${active.technique ? "checked" : ""}>Technique was consistent and comfortable</label><details><summary>Notes, cardio & recording guidance</summary><p>Dumbbell loads are per hand. Each-arm sets cover both sides; use the lower reps/RIR. Label different machine stacks separately.</p><label>Private session / symptom notes<textarea id="session-notes">${esc(active.notes)}</textarea></label><label>Optional cardio minutes<input id="cardio" type="number" inputmode="numeric" min="0" value="${esc(active.cardio)}"></label><p>Optional 10–20 min walk, stair climber or rowing on D1/D5; other days welcome. Stop or adapt movements that hurt.</p></details><button id="finish">${active.finished ? "Completed — read-only" : "Finish session"}</button></article>${active.editArchive?.length ? `<details><summary>Saved pre-edit entries (${active.editArchive.length})</summary><pre>${esc(JSON.stringify(active.editArchive, null, 2))}</pre></details>` : ""}</section>`;
  if (active.finished)
    app
      .querySelectorAll(
        ".session input,.session textarea,.session button:not(#close-session)",
      )
      .forEach((el) => (el.disabled = true));
}

function captureWeightDraft() {
  const form = document.querySelector("#weight-entry[open] #weight-form");
  if (!form) return;
  const values = Object.fromEntries(new FormData(form));
  weightDraft = { id:values.recordId, date:values.date, value:values.value === "" ? "" : Number(values.value), unit:values.unit, note:values.note };
}
function progress() {
  app.innerHTML = renderProgress({sessions, weighIns, range:progressRange, unit:progressUnit, exerciseKey:progressExercise, exerciseMetric:progressMetric, view:routeFor(location.hash).section, draft:weightDraft, today:day(), esc});
}
function preferences() {
  app.innerHTML =
    heading(
      "MAKE IT YOURS",
      "You",
      "Preferences, private sync and backups.",
    ) +
    `<a class="back-link" href="#today">← Back to Today</a><article><h2>Preferences</h2><form id="preferences"><label>New session weight units<select name="unit"><option ${settings.unit === "kg" ? "selected" : ""}>kg</option><option ${settings.unit === "lb" ? "selected" : ""}>lb</option></select></label>${num("increment", `Smallest load increase (${settings.unit})`, settings.increment)}<h3>Weekly schedule</h3>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<label>${d}<select name="day${i}">${[-1, 0, 1, 2, 3, 4].map((x) => `<option value="${x}" ${settings.schedule[i] === x ? "selected" : ""}>${x < 0 ? "Rest" : "Day " + (x + 1)}</option>`).join("")}</select></label>`).join("")}<p><a href="#progress">Log body weight and view its history in Progress →</a></p><label>Optional measurements / private notes<textarea name="measurements">${esc(settings.measurements || "")}</textarea></label><button>Save preferences</button></form></article><article><h2>Automatic Pi sync</h2><p>Your journal syncs automatically while Lifty is open and connected to your private Pi through Tailscale. Offline changes stay on this device and retry when the connection returns. No app sign-in is needed. iOS does not guarantee sync while the app is closed.</p><button id="sync-now" class="secondary">Retry sync</button><h2>Storage & backup</h2><p>Until a successful sync or export, this device holds your only copy. Browser storage is not encrypted by this app and can be cleared by the OS. Keep your device locked and backups private.</p><button id="export">Export private JSON backup</button><label>Merge backup (keeps conflicting alternatives)<input id="import" type="file" accept="application/json"></label><button id="persist" class="secondary">Request persistent browser storage</button><p>On iPhone: open the HTTPS address in Safari, then Share → Add to Home Screen. First load requires a connection.</p></article>`;
}
app.addEventListener("input", async (e) => {
  const t = e.target;
  if (t.form?.id === 'weight-form') captureWeightDraft();
  if (editing) {
    updateDraft(editing, t);
    return;
  }
  if (active?.finished) return;
  if (t.dataset.set) {
    const [i, j, k] = t.dataset.set.split(",");
    if (t.type === "number" && !t.validity.valid) return;
    active.exercises[i].sets[j][k] = k === "done" ? t.checked : t.value;
    await save("sessions", active);
  }
  if (t.dataset.increment !== undefined && t.validity.valid) {
    active.exercises[t.dataset.increment].increment = Number(t.value);
    await save("sessions", active);
  }
  if (t.dataset.equipment !== undefined) {
    active.exercises[t.dataset.equipment].equipment = t.value;
    await save("sessions", active);
  }
  if (["session-notes", "cardio", "technique"].includes(t.id)) {
    active[t.id === "session-notes" ? "notes" : t.id] =
      t.id === "technique" ? t.checked : t.value;
    await save("sessions", active);
  }
});
app.addEventListener("change", async (e) => {
  if (e.target.form?.id === 'weight-form') captureWeightDraft();
  if (e.target.id === "workout-date") { if (validDate(e.target.value)) { workoutDate = e.target.value; workout(); } return; }
  if (e.target.id === "workout-routine") { workoutRoutine = Number(e.target.value); workout(); return; }
  if (e.target.id === "session-date") {
    if (!active || active.finished || !validDate(e.target.value)) return;
    active.date = e.target.value; await save("sessions", active); workout(); return;
  }
  if (["progress-range", "progress-unit", "progress-exercise", "progress-metric"].includes(e.target.id)) captureWeightDraft();
  if (e.target.id === "progress-range") { progressRange = Number(e.target.value); progress(); return; }
  if (e.target.id === "progress-unit") { progressUnit = e.target.value; progress(); return; }
  if (e.target.id === "progress-metric") { progressMetric = e.target.value; progress(); return; }
  if (e.target.id === "progress-exercise") { progressExercise = e.target.value; progress(); return; }
  if (e.target.id === "weight-entry-unit") {
    const form = e.target.form, value = form.elements.value;
    if (value.value !== "") value.value = Number(convertWeight(Number(value.value), form.dataset.unit, e.target.value).toFixed(3));
    form.dataset.unit = e.target.value;
    captureWeightDraft();
    return;
  }
  if (editing) {
    updateDraft(editing, e.target);
    if (e.target.id === "editor-scope") render();
    return;
  }
  if (e.target.id === "import") {
    try {
      const file = e.target.files[0];
      if (file.size > 10e6) throw Error("Backup too large");
      const data = JSON.parse(await file.text());
      if (data.version !== 1) throw Error("Unsupported backup");
      if (data.templates !== undefined && !Array.isArray(data.templates))
        throw Error("Invalid templates");
      for (const r of data.templates || []) validateRecord("settings", r);
      if (data.weighIns !== undefined && !Array.isArray(data.weighIns)) throw Error("Invalid body-weight history");
      for (const r of data.weighIns || []) {
        if (r.type !== "weighin") throw Error("Invalid body-weight entry");
        validateRecord("settings", r);
      }
      for (const name of ["sessions", "foods", "logs"]) {
        if (!Array.isArray(data[name])) throw Error("Invalid backup");
        for (const record of data[name]) validateRecord(name, record);
      }
      for (const name of ["sessions", "foods", "logs"]) {
        if (!Array.isArray(data[name])) throw Error("Invalid backup");
        for (const r of data[name]) {
          if (typeof r.id !== "string") throw Error("Invalid record");
          if (
            name === "foods" &&
            macros.some((k) => !Number.isFinite(r[k]) || r[k] < 0)
          )
            throw Error("Invalid food");
        }
        const existing = await readAll(name);
        for (const r of mergeRecords(existing, data[name])) await save(name, r);
      }
      for (const r of mergeRecords(templateRecords, data.templates || []))
        await save("settings", r);
      const storedWeights = (await readAll("settings", true)).filter(r => r.type === "weighin");
      const oldWeight = legacyWeighIn(data.settings || {}, [...storedWeights, ...(data.weighIns || [])]);
      for (const r of mergeRecords(storedWeights, [...(data.weighIns || []), ...(oldWeight ? [oldWeight] : [])])) await save("settings", r);
      await load();
      render();
      toast(
        "Backup merged; differing records preserved. Preferences remain unchanged.",
      );
    } catch (err) {
      toast("Import failed: " + err.message);
    }
  }
});
app.addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  try {
    if (t.dataset.weightEdit) {
      weightDraft = structuredClone(weighIns.find(r => r.id === t.dataset.weightEdit));
      progress();
      document.querySelector("#weight-entry").scrollIntoView({block:"center"});
      return;
    }
    if (t.dataset.weightDelete) {
      if (!confirm("Delete this body-weight entry? It will be excluded from your history and trend on synced devices.")) return;
      await remove("settings", t.dataset.weightDelete);
      weightDraft = null; await load(); progress(); return;
    }
    if (t.id === "weight-cancel") { weightDraft = null; progress(); return; }
    if (t.dataset.editTemplate !== undefined) {
      const d = Number(t.dataset.editTemplate);
      editing = draftFor(d, definitions[d]);
      render();
      return;
    }
    if (t.id === "edit-session") {
      editing = draftFor(active.template, sessionDefinition(active), "session");
      render();
      return;
    }
    if (editing) {
      await handleEditor(t);
      return;
    }
    if (t.dataset.choose !== undefined) {
      workoutRoutine = Number(t.dataset.choose); active = null;
      location.hash = "workout/log"; workout(); return;
    }
    if (t.id === "workout-additional") { await startSelectedWorkout(true); return; }
    if (t.dataset.resume) {
      active = sessions.find((s) => s.id === t.dataset.resume);
      location.hash = "workout/session/" + active.id;
      workout();
    }
    if (t.id === "close-session") {
      active = null;
      location.hash="workout/log"; workout();
    }
    if (t.id === "finish") {
      if (active.finished) return;
      if (active.date > day()) { toast("This is a planned workout. Complete it on its workout date or correct the date first."); return; }
      active.finished = true;
      await save("sessions", active);
      active = null;
      location.hash = "workout/history";
      render();
    }
    if (t.id === "timer-start") {
      const n = Number(document.querySelector("#rest-seconds").value);
      if (n > 0 && n <= 1800) timerEnd = Date.now() + n * 1000;
    }
    if (t.id === "timer-stop") timerEnd = 0;
    if (t.id === "persist")
      toast(
        (await navigator.storage?.persist())
          ? "Persistent storage granted"
          : "Browser did not grant persistence; keep backups.",
      );
    if (t.id === "sync-now") await syncNow();
    if (t.id === "export") {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              sessions,
              foods: await readAll("foods", true),
              logs: await readAll("logs", true),
              settings,
              templates: templateRecords,
              weighIns: (await readAll("settings", true)).filter(r => r.type === "weighin"),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `lifty-private-${day()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (err) {
    toast(err.message);
  }
});
app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target,
    d = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "workout-start") { workoutDate = d.date; workoutRoutine = Number(d.routine); await startSelectedWorkout(); return; }
    if (form.id === "weight-form") {
      const existing = d.recordId ? weighIns.find(r => r.id === d.recordId) : null;
      if (d.date > day()) throw Error("Choose today or an earlier measurement date.");
      const record = {...existing, id:existing?.id || uid(), type:"weighin", date:d.date, value:Number(d.value), unit:d.unit, note:d.note.trim()};
      await save("settings", record);
      weightDraft = null; await load(); progress(); toast("Body weight saved"); return;
    }
    if (form.id === "preferences") {
      settings = {
        ...settings,
        unit: d.unit,
        increment: convertWeight(Number(d.increment), settings.unit, d.unit),
        measurements: d.measurements,
        schedule: Array.from({ length: 7 }, (_, i) => Number(d["day" + i])),
      };
      await save("settings", settings);
      toast("Preferences saved");
    }
  } catch (err) {
    toast(err.message);
  }
});
setInterval(() => {
  const el = document.querySelector("#clock");
  if (!el) return;
  const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
  el.textContent = timerEnd
    ? remaining
      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
      : "Rest complete"
    : "Ready";
}, 250);
async function load() {
  [sessions, foods, logs] = await Promise.all(
    ["sessions", "foods", "logs"].map(name => readAll(name)),
  );
  const allSettings = await readAll("settings", true);
  const p = allSettings.filter(r => !r._deleted);
  settings = p.find((x) => x.id === "preferences") || settings;
  const legacy = legacyWeighIn(settings, allSettings);
  if (legacy) { await save("settings", legacy); p.push(legacy); }
  weighIns = p.filter(r => r.type === "weighin");
  templateRecords = p.filter((x) => x.type === "template");
  definitions = templates.map(
    (def, i) =>
      templateRecords.find((r) => r.day === i && !r.conflictOf) ||
      structuredClone(def),
  );
}
window.addEventListener("hashchange", () => {
  render(); window.scrollTo(0,0);
  const title = app.querySelector("h1, .session-heading h2");
  if (title) { title.tabIndex = -1; title.focus({preventScroll:true}); }
  app.classList.remove('section-enter');
  requestAnimationFrame(()=>app.classList.add('section-enter'));
  setTimeout(()=>app.classList.remove('section-enter'),180);
});
window.addEventListener("storage", () =>
  toast("Another window changed data. Reload before editing."),
);
try {
  await load();
  document.querySelector("#status").textContent =
    "Saved on this device · pending Pi sync";
  render();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() =>
        toast("Offline app installation failed. Keep this tab open."),
      );
} catch (e) {
  app.textContent =
    "Local storage could not open. Disable private browsing or check browser storage permissions.";
}

async function syncNow() {
  if (syncBusy || editing) return;
  syncBusy = true;
  try {
    const conflicts = await sync();
    await load();
    if (active) active = sessions.find((s) => s.id === active.id);
    const pending = (await Promise.all(["sessions", "foods", "logs", "settings"].map(s => readAll(s, true)))).flat().some(r => r._dirty);
    document.querySelector("#status").textContent = pending
      ? "Saved on this device · pending Pi sync"
      : "Synced with Pi · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (conflicts) toast("Conflicting alternatives preserved in history.");
    if (!document.querySelector("input:focus,textarea:focus,select:focus,#weight-entry[open]")) render();
  } catch (e) {
    document.querySelector("#status").textContent =
      ([401, 403].includes(e.status) ? "Saved locally · Pi access denied; check Tailscale account" : e.status === 503 ? "Saved locally · Pi sync is not configured" : "Saved locally · Pi unreachable; retrying automatically");
  } finally {
    syncBusy = false;
  }
}
startAutomaticSync(syncNow);
window.addEventListener("offline", () => {
  document.querySelector("#status").textContent = "Saved locally · offline; sync resumes when connected";
});

async function handleEditor(t) {
  if (t.id === "editor-cancel") {
    editing = null;
    render();
    return;
  }
  if (t.dataset.move) {
    const [i, delta] = t.dataset.move.split(",").map(Number);
    const [ex] = editing.exercises.splice(i, 1);
    editing.exercises.splice(i + delta, 0, ex);
    render();
  }
  if (t.dataset.removeExercise !== undefined) {
    editing.exercises.splice(Number(t.dataset.removeExercise), 1);
    render();
  }
  if (t.id === "editor-add") {
    if (editing.exercises.length >= 30)
      throw Error("Maximum 30 exercises per workout.");
    editing.exercises.push({
      name: "New exercise",
      exerciseId: uid(),
      sets: 2,
      min: 8,
      max: 12,
      rest: [90, 120],
      each: false,
    });
    render();
  }
  if (t.id === "editor-restore") {
    if (
      confirm(
        "Restore the original Day " +
          (editing.day + 1) +
          " in this editor? Save to apply. Completed history is unchanged.",
      )
    ) {
      editing = draftFor(editing.day, templates[editing.day], editing.scope);
      render();
    }
  }
  if (t.dataset.templateAlternative) {
    const alternative = templateRecords.find(
      (r) => r.id === t.dataset.templateAlternative,
    );
    editing = draftFor(alternative.day, alternative);
    render();
  }
  if (t.id === "editor-save") {
    const definition = {
      name: editing.name.trim(),
      exercises: editing.exercises.map((e) => ({
        name: e.name.trim(),
        exerciseId: e.exerciseId,
        sets: e.sets,
        min: e.min,
        max: e.max,
        rest: e.rest,
        each: e.each,
      })),
    };
    if (!validDefinition(definition))
      throw Error(
        "Use 1–30 named exercises, 1–20 sets, valid rep ranges and 1–3600 seconds rest.",
      );
    if (editing.scope === "session") {
      active = editSession(active, definition);
      await save("sessions", active);
      sessions = sessions.map((s) => (s.id === active.id ? active : s));
    } else {
      const prior = templateRecords.find(
        (r) => r.id === "template-" + editing.day,
      );
      await save("settings", {
        ...prior,
        id: "template-" + editing.day,
        type: "template",
        day: editing.day,
        ...definition,
      });
      await load();
    }
    const message =
      editing.scope === "session"
        ? "This session updated. Future template unchanged."
        : "Future template saved. Current and completed sessions unchanged.";
    editing = null;
    render();
    toast(message);
  }
}
