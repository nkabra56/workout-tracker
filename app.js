import {
  templates,
  newSession,
  day,
  uid,
  macros,
  recipe,
  totals,
  suggestion,
  mergeRecords,
  validateRecord,
} from "./core.js";
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
      "Steadily is open in another tab. Close that tab, then reload here to edit safely.";
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
let syncEnabled=localStorage.getItem("steadily-sync-enabled")==="yes";
let syncToken = "",
  syncBusy = false;
let sessions = [],
  foods = [],
  logs = [],
  settings = {
    id: "preferences",
    unit: "kg",
    increment: 1,
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
  const route = location.hash.slice(1) || "workout";
  document
    .querySelectorAll("nav a")
    .forEach((a) => a.classList.toggle("selected", a.hash === `#${route}`));
  (
    ({
      workout: workout,
      nutrition: nutrition,
      progress: progress,
      settings: preferences,
    })[route] || workout
  )();
}
function workout() {
  app.innerHTML =
    heading(
      "YOUR TRAINING JOURNAL",
      "Workout",
      "Choose your session. Keep a steady rhythm.",
    ) +
    `<section class="plan"><div><p class="eyebrow">THE WEEK AHEAD</p><div class="week">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<span>${d}<b>${settings.schedule[i] < 0 ? "Rest" : "D" + (settings.schedule[i] + 1)}</b></span>`).join("")}</div></div><p>Target effort: 2–3 reps in reserve<br>Leg day: about 3 RIR</p></section><div class="template-grid">${templates.map((t, i) => `<button class="template" data-start="${i}"><small>DAY 0${i + 1} · ${t.exercises.length} EXERCISES</small><strong>${t.name}</strong><span>Open workout ↗</span></button>`).join("")}</div>`;
  if (!active) {
    const unfinished = sessions.filter((s) => !s.finished);
    app.innerHTML += unfinished
      .map(
        (s) =>
          `<button data-resume="${s.id}">Resume ${esc(templates[s.template].name)} · ${esc(s.date)}</button>`,
      )
      .join("");
    return;
  }
  app.innerHTML = heading(
    "TRAINING",
    "Your session",
    "Every set saves on this device.",
  );
  app.innerHTML += `<section class="session"><div class="section-title"><div><p class="eyebrow">DAY ${active.template + 1} · ${esc(active.date)} · ${active.unit}</p><h2>${templates[active.template].name}</h2></div><button id="close-session" class="secondary">Close</button></div><p>Dumbbells: load per hand. Each-arm sets: complete both sides.</p><div class="rest"><b>Manual rest</b><input aria-label="Rest seconds" id="rest-seconds" inputmode="decimal" type="number" min="1" max="1800" value="90"><button id="timer-start">Start</button><button id="timer-stop" class="secondary">Stop</button><output id="clock">Ready</output></div>${active.exercises
    .map((ex, i) => {
      const previous = sessions
        .filter(
          (s) =>
            s.finished &&
            s.id !== active.id &&
            s.template === active.template &&
            s.unit === active.unit,
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .find((s) => s.exercises[i]?.equipment === ex.equipment);
      return `<article class="exercise"><div class="section-title"><h3><span class="ordinal">${String(i + 1).padStart(2, "0")}</span>${ex.name}</h3><span class="tag">${ex.min}–${ex.max} reps${ex.each ? " / arm" : ""}</span></div><p>${ex.rest[0] === ex.rest[1] ? ex.rest[0] : ex.rest.join("–")} sec rest${ex.each ? " after both arms" : ""} · ${active.template === 2 ? "~3" : "2–3"} RIR</p><details class="equipment"><summary>Equipment & load increment</summary><label>Equipment / stack label<input data-equipment="${i}" value="${esc(ex.equipment)}" placeholder="e.g. gym A, cable 1"></label><label>Smallest load increase (${active.unit})<input inputmode="decimal" type="number" min="0.01" step="any" data-increment="${i}" value="${esc(ex.increment || settings.increment)}"></label></details><div class="set-head"><span>Set</span><span>${active.unit}</span><span>Reps</span><span>RIR</span><span>Done</span></div>${ex.sets.map((s, j) => `<div class="set-row"><b>${j + 1}</b>${["weight", "reps", "rir"].map((k) => `<input aria-label="${esc(ex.name)} set ${j + 1} ${k}" inputmode="decimal" type="number" min="0" ${k === "rir" ? 'max="10"' : ""} step="${k === "weight" ? "0.25" : "1"}" data-set="${i},${j},${k}" value="${esc(s[k])}">`).join("")}<input aria-label="Complete ${esc(ex.name)} set ${j + 1}" type="checkbox" data-set="${i},${j},done" ${s.done ? "checked" : ""}></div><small class="last">Last: ${previous ? esc(`${previous.exercises[i].sets[j].weight || "—"} ${active.unit} × ${previous.exercises[i].sets[j].reps || "—"} · RIR ${previous.exercises[i].sets[j].rir || "—"}`) : "No matching session yet"}</small>`).join("")}</article>`;
    })
    .join(
      "",
    )}<article><label><input id="technique" type="checkbox" ${active.technique ? "checked" : ""}> Technique was consistent and comfortable</label><label>Private session / symptom notes<textarea id="session-notes">${esc(active.notes)}</textarea></label><label>Optional cardio minutes<input id="cardio" inputmode="decimal" type="number" min="0" value="${esc(active.cardio)}"></label><p>Optional 10–20 min walk, stair climber or rowing on D1/D5; other days welcome. Stop or adapt movements that hurt.</p><button id="finish">${active.finished ? "Save reviewed session" : "Finish session"}</button></article></section>`;
}
function nutrition() {
  const daily = logs.filter((l) => l.date === selectedDate),
    sum = totals(daily);
  app.innerHTML =
    heading("FOOD & FUEL", "Nutrition", "Your daily food journal.") +
    `<label>Journal date<input id="food-date" type="date" value="${selectedDate}"></label><div class="metrics">${macros.map((k) => `<article><small>${k === "kcal" ? "CALORIES" : k.toUpperCase()}</small><strong>${Math.round(sum[k])}${k === "kcal" ? "" : "g"}</strong></article>`).join("")}</div><article><h2>Find a food</h2><form id="search"><label>International packaged foods or barcode<input name="query" required placeholder="Search paneer, yogurt… or scan code manually"></label><button>Search Open Food Facts</button></form><p class="muted">Online lookup. Community estimates; verify against the package. Homemade Indian dishes vary: build your household recipe below.</p><div id="results">${results.map((f, i) => `<div class="food-row"><span><b>${esc(f.name)}</b><small>${Math.round(f.kcal)} kcal / 100g · ${esc(f.source)}</small></span><button data-result="${i}">Save</button></div>`).join("")}</div><a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL data license</a></article><article><h2>Saved foods & recipes</h2><p>Saved foods work offline. Star your favorites; log the actual portion.</p>${
      [...foods]
        .sort((a, b) => Number(b.favorite) - Number(a.favorite))
        .map(
          (f) =>
            `<form class="food-row log-food" data-id="${f.id}"><button type="button" class="secondary" data-favorite="${f.id}" aria-label="Favorite ${esc(f.name)}">${f.favorite ? "★" : "☆"}</button><span><b>${esc(f.name)}</b><small>${esc(f.source)} · ${Math.round(f.kcal)} kcal/100g</small></span><label>grams<input name="grams" inputmode="decimal" type="number" min="1" value="${esc(f.serving || 100)}" required></label><button>Log</button></form>`,
        )
        .join("") || "<p>No saved foods yet. Add a label or recipe below.</p>"
    }</article><article><h2>Today’s meals</h2>${daily.map((l) => `<div class="food-row"><span>${esc(l.food.name)} · ${l.grams}g<small>${Math.round((l.food.kcal * l.grams) / 100)} kcal</small></span><button class="secondary" data-delete-log="${l.id}">Remove</button></div>`).join("") || "<p>Your first meal starts here.</p>"}</article><article><h2>Add a custom food</h2><form id="custom"><label>Name<input name="name" required placeholder="e.g. household paneer or package label"></label><p>Nutrition per 100 grams</p><div class="fields">${macros.map((k) => num(k, k)).join("")}${num("serving", "Saved serving weight (g)", 100)}</div><label>Source<input name="source" value="User-entered estimate" required></label><button>Save food</button></form></article><article><h2>Your household recipe</h2><p>Add every ingredient, including oil or ghee. Use the final cooked batch weight to account for water gained or lost.</p><form id="ingredient"><label>Saved ingredient<select name="food">${foods.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select></label>${num("grams", "Ingredient grams")}<button ${foods.length ? "" : "disabled"}>Add ingredient</button></form><ul>${ingredients.map((i) => `<li>${esc(i.food.name)} · ${i.grams}g</li>`).join("")}</ul><button id="clear-recipe" class="secondary">Clear ingredients</button><form id="recipe"><label>Recipe name<input name="name" required placeholder="Your dal, sabzi, khichdi…"></label>${num("yield", "Cooked batch weight (g)")}${num("serving", "Saved serving weight (g)", 150)}<button>Save recipe</button></form></article>`;
}
function progress() {
  const completed = sessions
    .filter((s) => s.finished)
    .sort((a, b) => a.date.localeCompare(b.date));
  const recent = completed.filter(
    (s) => Date.parse(s.date) >= Date.now() - 7 * 864e5,
  );
  app.innerHTML =
    heading(
      "THE LONG VIEW",
      "Progress",
      "Training indicators, not a measurement of muscle growth.",
    ) +
    `<div class="metrics"><article><small>LAST 7 DAYS</small><strong>${recent.length} sessions</strong></article><article><small>ALL TIME</small><strong>${completed.length} sessions</strong></article></div><article><h2>Exercise trends</h2><p>Compared within the same day, rep target, unit and equipment. Volume is load × reps (per-hand loads stay per-hand).</p>${templates
      .map((t, ti) =>
        t.exercises
          .map((e, ei) => {
            const matching = completed.filter((s) => s.template === ti);
            return matching.length
              ? `<details><summary>D${ti + 1} · ${e.name} · ${e.min}–${e.max}</summary>${matching
                  .map((s) => {
                    const ex = s.exercises[ei],
                      sets = ex.sets.filter((x) => x.done);
                    return `<p>${esc(s.date)} · ${esc(ex.equipment || "Unlabeled equipment")} · ${sets.map((x) => `${x.weight || 0} × ${x.reps || 0}`).join(", ")} ${s.unit}<br>Volume ${Math.round(sets.reduce((n, x) => n + Number(x.weight) * Number(x.reps), 0))} ${s.unit}·reps<br>${suggestion(ex, ti === 2 ? 3 : 2, ex.increment || settings.increment, s.technique)}</p>`;
                  })
                  .join("")}</details>`
              : "";
          })
          .join(""),
      )
      .join("")}</article><article><h2>Session history</h2>${
      [...sessions]
        .reverse()
        .map(
          (s) =>
            `<button class="history secondary" data-resume="${s.id}">${esc(s.date)} · ${templates[s.template].name} · ${s.finished ? "Complete" : "In progress"}${s.conflictOf ? " · Imported alternative" : ""}</button>`,
        )
        .join("") || "<p>Finish a session to start your story.</p>"
    }</article>`;
}
function preferences() {
  app.innerHTML =
    heading(
      "MAKE IT YOURS",
      "You",
      "Private on this browser. Back up regularly.",
    ) +
    `<article><h2>Preferences</h2><form id="preferences"><label>New session weight units<select name="unit"><option ${settings.unit === "kg" ? "selected" : ""}>kg</option><option ${settings.unit === "lb" ? "selected" : ""}>lb</option></select></label>${num("increment", "Smallest load increase", settings.increment)}<label>Diet preferences<textarea name="diet">${esc(settings.diet)}</textarea></label><h3>Weekly schedule</h3>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => `<label>${d}<select name="day${i}">${[-1, 0, 1, 2, 3, 4].map((x) => `<option value="${x}" ${settings.schedule[i] === x ? "selected" : ""}>${x < 0 ? "Rest" : "Day " + (x + 1)}</option>`).join("")}</select></label>`).join("")}<label>Optional measurements / private notes<textarea name="measurements">${esc(settings.measurements || "")}</textarea></label><button>Save preferences</button></form></article><article><h2>Private Pi sync</h2><p>Unlock with the private access key configured on your Pi. Unlock once per month on this device. Your key is exchanged for a private, browser-protected session. Sync retries while the app is open and connected; iOS does not guarantee background sync.</p><form id="sync-login"><label>Private access key<input name="token" type="password" autocomplete="current-password" minlength="32" required></label><button>Unlock & sync</button></form><button id="sync-now" class="secondary">Sync now</button> <button id="sync-lock" class="secondary">Lock sync</button><h2>Storage & backup</h2><p>Until a successful sync or export, this device holds your only copy. Browser storage is not encrypted by this app and can be cleared by the OS. Keep your device locked and backups private.</p><button id="export">Export private JSON backup</button><label>Merge backup (keeps conflicting alternatives)<input id="import" type="file" accept="application/json"></label><button id="persist" class="secondary">Request persistent browser storage</button><p>On iPhone: open the HTTPS address in Safari, then Share → Add to Home Screen. First load requires a connection.</p></article>`;
}
app.addEventListener("input", async (e) => {
  const t = e.target;
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
      for (const name of ["sessions", "foods", "logs"]) {
        if (!Array.isArray(data[name])) throw Error("Invalid backup");
        for (const record of data[name]) validateRecord(name, record);
      }
      for (const name of ["sessions", "foods", "logs"]) {
        if (!Array.isArray(data[name])) throw Error("Invalid backup");
        for (const r of data[name]) {
          if (typeof r.id !== "string") throw Error("Invalid record");
          if (
            name === "sessions" &&
            (!templates[r.template] ||
              !Array.isArray(r.exercises) ||
              r.exercises.length !== templates[r.template].exercises.length)
          )
            throw Error("Invalid session");
          if (
            name === "foods" &&
            macros.some((k) => !Number.isFinite(r[k]) || r[k] < 0)
          )
            throw Error("Invalid food");
        }
        const existing = await readAll(name);
        for (const r of mergeRecords(existing, data[name])) await save(name, r);
      }
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
    if (t.dataset.start !== undefined) {
      active =
        sessions.find(
          (s) => !s.finished && s.template === Number(t.dataset.start),
        ) || newSession(Number(t.dataset.start), settings.unit);
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
    if(t.id==='sync-lock'){await fetch('/api/lock',{method:'POST',headers:{'Content-Type':'application/json'}});syncEnabled=false;syncToken='';localStorage.removeItem('steadily-sync-enabled');toast('Sync locked on this device. Local journal remains available.');}
    if (t.id === "sync-now") await syncNow();
    if (t.id === "export") {
      const blob = new Blob(
        [
          JSON.stringify(
            { version: 1, sessions, foods, logs, settings },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `steadily-private-${day()}.json`;
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
    if (form.id === "sync-login") {
      syncToken = d.token;
      form.reset();
      await syncNow();
    }
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
        increment: Number(d.increment),
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
  if (syncBusy) return;
  if (!syncToken && !syncEnabled) {
    toast("Enter your Pi access key in You → Private Pi sync.");
    return;
  }
  syncBusy = true;
  try {
    if(syncToken){const unlock=await fetch('/api/unlock',{method:'POST',headers:{Authorization:'Bearer '+syncToken,'Content-Type':'application/json'}});if(!unlock.ok)throw Error('Could not unlock Pi sync. Check the key and connection.');syncToken='';syncEnabled=true;localStorage.setItem('steadily-sync-enabled','yes');}
    const conflicts = await sync('');
    await load();
    if (active) active = sessions.find((s) => s.id === active.id);
    document.querySelector("#status").textContent =
      "Synced with Pi · " +
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (conflicts) toast("Conflicting alternatives preserved in history.");
    if (!document.querySelector("input:focus,textarea:focus")) render();
  } catch (e) {
    document.querySelector("#status").textContent =
      "Saved locally · sync pending";
    toast(e.message);
  } finally {
    syncBusy = false;
  }
}
window.addEventListener("online", () => {
  if (syncEnabled) syncNow();
});
setInterval(() => {
  if (syncEnabled && navigator.onLine) syncNow();
}, 30000);

if(syncEnabled&&navigator.onLine)syncNow();
