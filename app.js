import { startAutomaticSync } from "./automatic-sync.js";
import {
  templates,
  newSession,
  convertWeight,
  day,
  uid,
  macros,
  recipe,
  totals,
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
    diet: "Vegetarian; dairy and eggs optional",
  },
  active,
  selectedDate = day(),
  ingredients = [],
  results = [],
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
  if (editing) {
    app.innerHTML = renderEditor(
      editing,
      !!active && !active.finished && active.template === editing.day,
      templateRecords.filter((r) => r.day === editing.day && r.conflictOf),
    );
    return;
  }
  const route = location.hash.slice(1) || "today";
  document
    .querySelectorAll("nav a")
    .forEach((a) => a.classList.toggle("selected", a.hash === `#${route}`));
  (
    ({
      today: today,
      workout: workout,
      nutrition: nutrition,
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
      !s.conflictOf &&
      Date.parse(s.date + "T12:00:00") >= start.getTime(),
  );
  const daily = totals(logs.filter((l) => l.date === date));
  const pending = sessions
    .filter((s) => !s.finished && !s.conflictOf)
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
  )}</div><article class="workout-hero"><div class="hero-top"><span class="eyebrow">${pending ? "CONTINUE YOUR SESSION" : scheduled < 0 ? "REST DAY · YOUR NEXT WORKOUT" : "YOUR WORKOUT"}</span><span class="day-pill">Day ${chosen + 1}</span></div><h2>${esc(def.name)}</h2><p>${def.exercises.length} exercises <span>·</span> ${count} working sets <span>·</span> ${pending ? pending.unit : settings.unit}</p>${pending ? `<div class="session-progress"><progress value="${complete}" max="${count}" aria-label="Completed sets"></progress><small>${complete} of ${count} sets complete</small></div>` : ""}<button class="primary-wide" ${pending ? `data-resume="${pending.id}"` : `data-start="${chosen}"`}>${pending ? "Resume workout" : "Start workout"} <span aria-hidden="true">→</span></button><a class="subtle-link" href="#workout">View all workouts</a></article><div class="section-title section-label"><h2>Daily nutrition</h2><a href="#nutrition">Log food +</a></div><article class="daily-fuel"><div><small>CALORIES LOGGED</small><strong>${Math.round(daily.kcal)} <span>kcal</span></strong></div><div class="macro-line">${["protein", "carbs", "fat"].map((k) => `<div><span>${k[0].toUpperCase() + k.slice(1)}</span><b>${Math.round(daily[k])}<small>g</small></b></div>`).join("")}</div></article><div class="section-title section-label"><h2>This week</h2><a href="#progress">View progress →</a></div><article class="week-summary"><div><strong>${week.length}</strong><span>sessions completed</span></div><p>${settings.schedule.filter((x) => x >= 0).length} training days in your schedule.<br>Build consistency at your own pace.</p></article>`;
}
const personIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg>';
function workout() {
  app.innerHTML =
    heading(
      "YOUR TRAINING JOURNAL",
      "Workout",
      "Your plan. Make it your own.",
    ) +
    `<section class="plan"><div><p class="eyebrow">THE WEEK AHEAD</p><div class="week">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<span>${d}<b>${settings.schedule[i] < 0 ? "Rest" : "D" + (settings.schedule[i] + 1)}</b></span>`).join("")}</div></div><p>Target effort: 2–3 reps in reserve<br>Leg day: about 3 RIR</p></section><div class="template-grid">${definitions.map((t, i) => `<div class="template-choice"><button class="template" data-start="${i}"><small>DAY 0${i + 1} · ${t.exercises.length} EXERCISES</small><strong>${esc(t.name)}</strong><span>Open workout ↗</span></button><button class="secondary edit-template" data-edit-template="${i}">Edit workout</button></div>`).join("")}</div>`;
  if (!active) {
    const unfinished = sessions.filter((s) => !s.finished);
    app.innerHTML += unfinished
      .map(
        (s) =>
          `<button data-resume="${s.id}">Resume ${esc(s.title || templates[s.template].name)} · ${esc(s.date)}</button>`,
      )
      .join("");
    return;
  }
  app.innerHTML = `<section class="session compact-session"><div class="session-heading"><div><p class="eyebrow">DAY ${active.template + 1} · ${esc(active.date)} · ${active.unit}</p><h2>${esc(active.title || templates[active.template].name)}</h2></div><div class="session-actions">${active.finished ? "" : `<button id="edit-session" class="secondary" aria-label="Edit this workout">Edit</button>`}<button id="close-session" class="secondary">Close</button></div></div>${active.finished ? '<p class="read-only-note">Completed · read-only snapshot</p>' : ""}<div class="rest compact-rest"><b>Rest</b><input aria-label="Manual rest seconds" id="rest-seconds" inputmode="numeric" type="number" min="1" max="1800" value="90"><button id="timer-start">Start</button><button id="timer-stop" class="secondary">Stop</button><output id="clock" aria-live="off">Ready</output></div>${active.exercises
    .map((ex, i) => {
      const previous = sessions
        .filter(
          (s) =>
            s.finished &&
            !s.conflictOf &&
            s.id !== active.id &&
            s.template === active.template &&
            s.unit === active.unit,
        )
        .sort((a, b) =>
          (b.createdAt || b.date).localeCompare(a.createdAt || a.date),
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

function nutrition() {
  const daily = logs.filter((l) => l.date === selectedDate),
    sum = totals(daily);
  app.innerHTML =
    heading("FOOD & FUEL", "Nutrition", "Your daily food journal.") +
    `<label class="date-control"><span>Journal date</span><input id="food-date" type="date" value="${selectedDate}"></label><div class="metrics">${macros.map((k) => `<article><small>${k === "kcal" ? "CALORIES" : k.toUpperCase()}</small><strong>${Math.round(sum[k])}${k === "kcal" ? "" : "g"}</strong></article>`).join("")}</div><article><h2>Find a food</h2><form id="search"><label>International packaged foods or barcode<input name="query" required placeholder="Search paneer, yogurt… or scan code manually"></label><button>Search Open Food Facts</button></form><p class="muted">Online lookup. Community estimates; verify against the package. Homemade Indian dishes vary: build your household recipe below.</p><div id="results">${results.map((f, i) => `<div class="food-row"><span><b>${esc(f.name)}</b><small>${Math.round(f.kcal)} kcal / 100g · ${esc(f.source)}</small></span><button data-result="${i}">Save</button></div>`).join("")}</div><a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL data license</a></article><article><h2>Saved foods & recipes</h2><p>Saved foods work offline. Star your favorites; log the actual portion.</p>${
      [...foods]
        .sort((a, b) => Number(b.favorite) - Number(a.favorite))
        .map(
          (f) =>
            `<form class="food-row log-food" data-id="${f.id}"><button type="button" class="secondary" data-favorite="${f.id}" aria-label="Favorite ${esc(f.name)}">${f.favorite ? "★" : "☆"}</button><span><b>${esc(f.name)}</b><small>${esc(f.source)}${f.conflictOf ? " · Alternative food version" : ""} · ${Math.round(f.kcal)} kcal/100g</small></span><label>grams<input name="grams" inputmode="decimal" type="number" min="1" value="${esc(f.serving || 100)}" required></label><button>Log</button></form>`,
        )
        .join("") || "<p>No saved foods yet. Add a label or recipe below.</p>"
    }</article><article><h2>Today’s meals</h2>${daily.some((l) => l.conflictOf) ? '<p role="status">Unresolved alternatives are preserved below and excluded from totals. Keep the original, or remove it and log the preferred version once.</p>' : ""}${daily.map((l) => `<div class="food-row"><span>${esc(l.food.name)} · ${l.grams}g${l.conflictOf ? "<small>Alternative — excluded from totals</small>" : ""}<small>${Math.round((l.food.kcal * l.grams) / 100)} kcal</small></span><button class="secondary" data-delete-log="${l.id}">Remove</button></div>`).join("") || "<p>Your first meal starts here.</p>"}</article><article><h2>Add a custom food</h2><form id="custom"><label>Name<input name="name" required placeholder="e.g. household paneer or package label"></label><p>Nutrition per 100 grams</p><div class="fields">${macros.map((k) => num(k, k)).join("")}${num("serving", "Saved serving weight (g)", 100)}</div><label>Source<input name="source" value="User-entered estimate" required></label><button>Save food</button></form></article><article><h2>Your household recipe</h2><p>Add every ingredient, including oil or ghee. Use the final cooked batch weight to account for water gained or lost.</p><form id="ingredient"><label>Saved ingredient<select name="food">${foods.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select></label>${num("grams", "Ingredient grams")}<button ${foods.length ? "" : "disabled"}>Add ingredient</button></form><ul>${ingredients.map((i) => `<li>${esc(i.food.name)} · ${i.grams}g</li>`).join("")}</ul><button id="clear-recipe" class="secondary">Clear ingredients</button><form id="recipe"><label>Recipe name<input name="name" required placeholder="Your dal, sabzi, khichdi…"></label>${num("yield", "Cooked batch weight (g)")}${num("serving", "Saved serving weight (g)", 150)}<button>Save recipe</button></form></article>`;
}
function progress() {
  const completed = sessions
    .filter((s) => s.finished && !s.conflictOf)
    .sort((a, b) =>
      (a.createdAt || a.date).localeCompare(b.createdAt || b.date),
    );
  const recent = completed.filter(
      (s) => Date.parse(s.date) >= Date.now() - 7 * 864e5,
    ),
    groups = new Map();
  for (const session of completed)
    for (const ex of session.exercises) {
      const key = [
        session.template,
        exerciseIdentity(ex),
        ex.min,
        ex.max,
        session.unit,
        ex.equipment,
      ].join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ session, ex });
    }
  app.innerHTML =
    heading(
      "THE LONG VIEW",
      "Progress",
      "Training indicators, not a measurement of muscle growth.",
    ) +
    `<div class="metrics"><article><small>LAST 7 DAYS</small><strong>${recent.length} sessions</strong></article><article><small>ALL TIME</small><strong>${completed.length} sessions</strong></article></div><article><h2>Exercise trends</h2><p>Compared by exercise identity, rep target, day, equipment and unit. Replacing an exercise starts a separate history.</p>${
      [...groups.values()]
        .map((rows) => {
          const { session, ex } = rows[0];
          return `<details><summary>D${session.template + 1} · ${esc(ex.name)} · ${ex.min}–${ex.max} · ${session.unit}</summary>${rows
            .map(({ session: s, ex: e }) => {
              const sets = e.sets.filter((x) => x.done);
              return `<p>${esc(s.date)} · ${esc(e.equipment || "Unlabeled equipment")}<br>${sets.map((x) => esc(x.weight || 0) + " × " + esc(x.reps || 0)).join(", ")} ${s.unit}<br>Volume ${Math.round(sets.reduce((n, x) => n + Number(x.weight) * Number(x.reps), 0))} ${s.unit}·reps<br>${suggestion(e, s.template === 2 ? 3 : 2, e.increment || convertWeight(settings.increment, settings.unit, s.unit), s.technique)}</p>`;
            })
            .join("")}</details>`;
        })
        .join("") || "<p>Complete a session to see your history.</p>"
    }</article><article><h2>Session history</h2>${[...sessions]
      .reverse()
      .map(
        (s) =>
          `<button class="history secondary" data-resume="${s.id}">${esc(s.date)} · ${esc(s.title || templates[s.template].name)} · ${s.finished ? "Complete" : "In progress"}${s.conflictOf ? " · Alternative — excluded from progress" : ""}</button>`,
      )
      .join("")}</article>`;
}
function preferences() {
  app.innerHTML =
    heading(
      "MAKE IT YOURS",
      "You",
      "Private on this browser. Back up regularly.",
    ) +
    `<article><h2>Preferences</h2><form id="preferences"><label>New session weight units<select name="unit"><option ${settings.unit === "kg" ? "selected" : ""}>kg</option><option ${settings.unit === "lb" ? "selected" : ""}>lb</option></select></label>${num("increment", `Smallest load increase (${settings.unit})`, settings.increment)}<label>Diet preferences<textarea name="diet">${esc(settings.diet)}</textarea></label><h3>Weekly schedule</h3>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<label>${d}<select name="day${i}">${[-1, 0, 1, 2, 3, 4].map((x) => `<option value="${x}" ${settings.schedule[i] === x ? "selected" : ""}>${x < 0 ? "Rest" : "Day " + (x + 1)}</option>`).join("")}</select></label>`).join("")}<label>Body weight (${settings.bodyWeightUnit || settings.unit}, optional)<input name="bodyWeight" inputmode="decimal" type="number" min="0" step="any" value="${esc(settings.bodyWeight ?? "")}"></label><label>Optional measurements / private notes<textarea name="measurements">${esc(settings.measurements || "")}</textarea></label><button>Save preferences</button></form></article><article><h2>Automatic Pi sync</h2><p>Your journal syncs automatically while Lifty is open and connected to your private Pi through Tailscale. Offline changes stay on this device and retry when the connection returns. No app sign-in is needed. iOS does not guarantee sync while the app is closed.</p><button id="sync-now" class="secondary">Retry sync</button><h2>Storage & backup</h2><p>Until a successful sync or export, this device holds your only copy. Browser storage is not encrypted by this app and can be cleared by the OS. Keep your device locked and backups private.</p><button id="export">Export private JSON backup</button><label>Merge backup (keeps conflicting alternatives)<input id="import" type="file" accept="application/json"></label><button id="persist" class="secondary">Request persistent browser storage</button><p>On iPhone: open the HTTPS address in Safari, then Share → Add to Home Screen. First load requires a connection.</p></article>`;
}
app.addEventListener("input", async (e) => {
  const t = e.target;
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
  if (editing) {
    updateDraft(editing, e.target);
    if (e.target.id === "editor-scope") render();
    return;
  }
  if (e.target.id === "food-date") {
    selectedDate = e.target.value;
    nutrition();
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
    if (t.dataset.start !== undefined) {
      location.hash = "workout";
      active =
        sessions.find(
          (s) => !s.finished && s.template === Number(t.dataset.start),
        ) ||
        newSession(
          Number(t.dataset.start),
          settings.unit,
          settings.increment,
          definitions[Number(t.dataset.start)],
        );
      if (!sessions.includes(active)) sessions.push(active);
      await save("sessions", active);
      workout();
    }
    if (t.dataset.resume) {
      active = sessions.find((s) => s.id === t.dataset.resume);
      location.hash = "workout";
      workout();
    }
    if (t.id === "close-session") {
      active = null;
      workout();
    }
    if (t.id === "finish") {
      if (active.finished) return;
      active.finished = true;
      await save("sessions", active);
      active = null;
      location.hash = "progress";
      render();
    }
    if (t.id === "timer-start") {
      const n = Number(document.querySelector("#rest-seconds").value);
      if (n > 0 && n <= 1800) timerEnd = Date.now() + n * 1000;
    }
    if (t.id === "timer-stop") timerEnd = 0;
    if (t.dataset.result !== undefined) {
      const f = { ...results[Number(t.dataset.result)], id: uid() };
      foods.push(f);
      await save("foods", f);
      nutrition();
    }
    if (t.dataset.favorite) {
      const f = foods.find((f) => f.id === t.dataset.favorite);
      f.favorite = !f.favorite;
      await save("foods", f);
      nutrition();
    }
    if (t.dataset.deleteLog) {
      await remove("logs", t.dataset.deleteLog);
      logs = logs.filter((l) => l.id !== t.dataset.deleteLog);
      nutrition();
    }
    if (t.id === "clear-recipe") {
      ingredients = [];
      nutrition();
    }
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
              foods,
              logs,
              settings,
              templates: templateRecords,
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
    if (form.id === "search") {
      form.querySelector("button").disabled = true;
      toast("Searching online…");
      const response = await fetch(
        "/api/foods?q=" + encodeURIComponent(d.query),
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok)
        throw Error(
          "Food lookup unavailable. Use saved foods or add a custom food.",
        );
      results = await response.json();
      nutrition();
      if (!results.length)
        toast(
          "No complete nutrition records found. Try a package label or custom food.",
        );
    }
    if (form.id === "custom") {
      const f = {
        id: uid(),
        name: d.name,
        source: d.source,
        serving: Number(d.serving),
        ...Object.fromEntries(macros.map((k) => [k, Number(d[k])])),
      };
      foods.push(f);
      await save("foods", f);
      nutrition();
    }
    if (form.classList.contains("log-food")) {
      const food = foods.find((f) => f.id === form.dataset.id),
        l = {
          id: uid(),
          date: selectedDate,
          food: structuredClone(food),
          grams: Number(d.grams),
        };
      logs.push(l);
      await save("logs", l);
      nutrition();
    }
    if (form.id === "ingredient") {
      ingredients.push({
        food: structuredClone(foods.find((f) => f.id === d.food)),
        grams: Number(d.grams),
      });
      nutrition();
    }
    if (form.id === "recipe") {
      const f = {
        id: uid(),
        name: d.name,
        source: "Household recipe estimate",
        ingredients: structuredClone(ingredients),
        yield: Number(d.yield),
        serving: Number(d.serving),
        ...recipe(ingredients, Number(d.yield)),
      };
      foods.push(f);
      await save("foods", f);
      ingredients = [];
      nutrition();
    }
    if (form.id === "preferences") {
      settings = {
        ...settings,
        unit: d.unit,
        increment: convertWeight(Number(d.increment), settings.unit, d.unit),
        bodyWeight:
          d.bodyWeight === ""
            ? ""
            : convertWeight(
                Number(d.bodyWeight),
                settings.bodyWeightUnit || settings.unit,
                d.unit,
              ),
        bodyWeightUnit: d.unit,
        diet: d.diet,
        measurements: d.measurements,
        schedule: Array.from({ length: 7 }, (_, i) => Number(d["day" + i])),
      };
      await save("settings", settings);
      toast("Preferences saved");
    }
  } catch (err) {
    toast(err.message);
    if (form.id === "search") form.querySelector("button").disabled = false;
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
    ["sessions", "foods", "logs"].map(readAll),
  );
  const p = await readAll("settings");
  settings = p.find((x) => x.id === "preferences") || settings;
  templateRecords = p.filter((x) => x.type === "template");
  definitions = templates.map(
    (def, i) =>
      templateRecords.find((r) => r.day === i && !r.conflictOf) ||
      structuredClone(def),
  );
}
window.addEventListener("hashchange", render);
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
    if (!document.querySelector("input:focus,textarea:focus")) render();
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
