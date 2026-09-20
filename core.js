export const uid = () => crypto.randomUUID();
const e = (name, sets, min, max, rest, each = false) => ({
  name,
  sets,
  min,
  max,
  rest,
  each,
});
export const templates = [
  {
    name: "Chest / triceps",
    exercises: [
      e("Flat dumbbell bench press", 3, 6, 8, [120, 180]),
      e("Incline dumbbell bench press", 3, 8, 12, [120, 120]),
      e("Pec-deck fly", 2, 10, 15, [60, 120]),
      e("Regular cable triceps pushdown", 3, 10, 15, [60, 120]),
      e("Single-arm cable triceps pushdown", 2, 10, 15, [60, 90], true),
    ],
  },
  {
    name: "Back / biceps",
    exercises: [
      e("Lat pulldown", 3, 6, 8, [120, 180]),
      e("Seated row", 3, 8, 12, [120, 120]),
      e("Straight-arm cable pulldown", 2, 12, 15, [60, 120]),
      e("Dumbbell curl", 2, 8, 12, [90, 90], true),
      e("Machine biceps curl", 2, 10, 12, [90, 90]),
      e("Rope hammer curl", 2, 10, 15, [90, 90]),
    ],
  },
  {
    name: "Legs / core",
    exercises: [
      e("Hack squat", 2, 8, 12, [120, 180]),
      e("Dumbbell Romanian deadlift", 2, 8, 12, [120, 120]),
      e("Seated calf raise", 2, 12, 15, [60, 90]),
      e("Machine crunch", 3, 10, 15, [60, 90]),
    ],
  },
  {
    name: "Shoulders / arms / core",
    exercises: [
      e("Dumbbell shoulder press", 2, 8, 12, [120, 120]),
      e("Lateral raise", 2, 12, 15, [60, 90]),
      e("Reverse pec-deck fly", 2, 12, 15, [60, 90]),
      e("Dumbbell curl", 2, 8, 12, [90, 90], true),
      e("Cable triceps pushdown", 2, 10, 15, [90, 90]),
      e("Machine crunch", 2, 10, 15, [60, 90]),
    ],
  },
  {
    name: "Chest / back hypertrophy",
    exercises: [
      e("Incline dumbbell bench press", 2, 8, 12, [120, 120]),
      e("Lat pulldown", 3, 8, 12, [120, 120]),
      e("Pec-deck fly", 2, 12, 15, [60, 90]),
      e("Seated row", 2, 10, 12, [120, 120]),
    ],
  },
];
export const day = () => new Date().toLocaleDateString("en-CA");
export function newSession(
  template,
  unit = "lb",
  increment = unit === "lb" ? 2.5 : 1,
  definition = templates[template],
  date = day(),
) {
  if (!validDate(date)) throw Error("Choose a valid workout date");
  return {
    id: uid(),
    date,
    createdAt: new Date().toISOString(),
    title: definition.name,
    template,
    unit,
    finished: false,
    technique: false,
    notes: "",
    cardio: 0,
    exercises: definition.exercises.map((x) => ({
      ...structuredClone(x),
      exerciseId: exerciseIdentity(x),
      equipment: "",
      increment,
      sets: Array.from({ length: x.sets }, () => ({
        weight: "",
        reps: "",
        rir: "",
        done: false,
      })),
    })),
  };
}
export const macros = ["kcal", "protein", "carbs", "fat"];
export function recipe(ingredients, yieldGrams) {
  if (!(yieldGrams > 0) || !ingredients.length)
    throw Error("Add ingredients and a positive cooked batch weight.");
  return Object.fromEntries(
    macros.map((k) => [
      k,
      (ingredients.reduce(
        (n, i) => n + (Number(i.food[k]) * i.grams) / 100,
        0,
      ) /
        yieldGrams) *
        100,
    ]),
  );
}
export function suggestion(ex, minRir, increment, technique) {
  return technique &&
    ex.sets.every(
      (s) =>
        s.done &&
        s.weight !== "" &&
        Number(s.reps) >= ex.max &&
        s.rir !== "" &&
        Number(s.rir) >= minRir,
    )
    ? `Consider +${increment} next time; return to ${ex.min} reps. Keep technique comfortable.`
    : "Build reps within the target range before adding load.";
}
export function totals(logs) {
  return Object.fromEntries(
    macros.map((k) => [
      k,
      logs
        .filter((l) => !l.conflictOf && !l._deleted)
        .reduce((n, l) => n + (Number(l.food[k]) * l.grams) / 100, 0),
    ]),
  );
}
export function mergeRecords(existing, incoming, deletionWins = false) {
  const result = new Map(existing.map((x) => [x.id, x]));
  for (const r of incoming) {
    if (!r.id) throw Error("Invalid record");
    const old = result.get(r.id);
    if (deletionWins && old?._deleted) continue;
    if (deletionWins && r._deleted) { result.set(r.id, {...(old || r), _deleted:true}); continue; }
    if (!old) result.set(r.id, r);
    else if (JSON.stringify(old) !== JSON.stringify(r)) {
      const conflictId = r.id + "-conflict-" + hash(JSON.stringify(r));
      if (!result.has(conflictId))
        result.set(conflictId, { ...r, id: conflictId, conflictOf: r.id });
    }
  }
  return [...result.values()];
}
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}
export function validateRecord(store, r) {
  const finite = (x, max = 1e7) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max;
  const text = (x, max = 5000) => typeof x === "string" && x.length <= max;
  const food = (f) =>
    f &&
    text(f.name, 200) &&
    text(f.source, 300) &&
    macros.every((k) => finite(f[k]));
  if (!r || !text(r.id, 160) || !/^[-a-zA-Z0-9]+$/.test(r.id))
    throw Error("Invalid record identity");
  if (r._deleted === true) return true;
  let valid = false;
  if (store === "foods") valid = food(r);
  if (store === "logs")
    valid =
      food(r.food) && finite(r.grams) && /^\d{4}-\d{2}-\d{2}$/.test(r.date);
  if (store === "settings")
    valid =
      ["kg", "lb"].includes(r.unit) &&
      finite(r.increment) &&
      text(r.diet) &&
      Array.isArray(r.schedule) &&
      r.schedule.length === 7 &&
      r.schedule.every((x) => Number.isInteger(x) && x >= -1 && x <= 4);
  if (store === "settings" && r.type === "template")
    valid =
      Number.isInteger(r.day) && r.day >= 0 && r.day < 5 && validDefinition(r);
  if (store === "settings" && r.type === "weighin")
    valid = finite(r.value, 2000) && r.value > 0 && ["lb", "kg"].includes(r.unit) && text(r.note, 500) &&
      ((r.date === null && r.legacy === true) ||
       (typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(Date.parse(r.date + "T00:00:00Z")) && new Date(r.date + "T00:00:00Z").toISOString().slice(0,10) === r.date));
  if (store === "sessions")
    valid =
      Number.isInteger(r.template) &&
      r.template >= 0 &&
      r.template < 5 &&
      ["kg", "lb"].includes(r.unit) &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      text(r.notes) &&
      validDefinition(
        { name: r.title || templates[r.template].name, exercises: r.exercises },
        true,
      );
  if (!valid) throw Error("Invalid " + store + " record");
  return true;
}

export function convertWeight(value, from, to) {
  if (
    !["lb", "kg"].includes(from) ||
    !["lb", "kg"].includes(to) ||
    !Number.isFinite(Number(value))
  )
    throw Error("Invalid weight conversion");
  if (from === to) return Number(value);
  return from === "lb"
    ? Number(value) * 0.45359237
    : Number(value) / 0.45359237;
}

export function exerciseIdentity(ex) {
  return (
    ex.exerciseId ||
    "exercise-" + ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  );
}
export function sameExercise(a, b) {
  return (
    exerciseIdentity(a) === exerciseIdentity(b) &&
    a.min === b.min &&
    a.max === b.max &&
    (a.equipment || "") === (b.equipment || "")
  );
}
export function validDefinition(def, session = false) {
  const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  return (
    typeof def?.name === "string" &&
    def.name.trim().length > 0 &&
    def.name.length <= 120 &&
    Array.isArray(def.exercises) &&
    def.exercises.length > 0 &&
    def.exercises.length <= 30 &&
    def.exercises.every(
      (e) =>
        typeof e.name === "string" &&
        e.name.trim().length > 0 &&
        e.name.length <= 200 &&
        (!e.exerciseId || /^[-a-zA-Z0-9]{1,160}$/.test(e.exerciseId)) &&
        integer(e.min, 1, 1000) &&
        integer(e.max, e.min, 1000) &&
        Array.isArray(e.rest) &&
        e.rest.length === 2 &&
        integer(e.rest[0], 1, 3600) &&
        integer(e.rest[1], e.rest[0], 3600) &&
        typeof e.each === "boolean" &&
        (session
          ? typeof e.equipment === "string" &&
            e.equipment.length <= 200 &&
            Array.isArray(e.sets) &&
            e.sets.length > 0 &&
            e.sets.length <= 20 &&
            e.sets.every(
              (s) =>
                typeof s.done === "boolean" &&
                ["weight", "reps", "rir"].every(
                  (k) =>
                    s[k] === "" ||
                    ((typeof s[k] === "string" || typeof s[k] === "number") &&
                      /^\d+(\.\d+)?$/.test(String(s[k])) &&
                      Number(s[k]) <= (k === "rir" ? 10 : 1e6)),
                ),
            )
          : integer(e.sets, 1, 20)),
    )
  );
}
export function sessionDefinition(session) {
  return {
    name: session.title || templates[session.template].name,
    exercises: session.exercises.map((e) => ({
      ...structuredClone(e),
      exerciseId: exerciseIdentity(e),
      sets: e.sets.length,
    })),
  };
}
export function editSession(session, definition) {
  if (session.finished) throw Error("Completed sessions are read-only.");
  if (!validDefinition(definition))
    throw Error("Check exercise names, sets, reps and rest ranges.");
  const next = structuredClone(session);
  next.title = definition.name;
  next.editArchive = [
    ...(next.editArchive || []),
    {
      date: new Date().toISOString(),
      exercises: structuredClone(session.exercises),
    },
  ];
  next.exercises = definition.exercises.map((e) => {
    const old = session.exercises.find(
      (x) => exerciseIdentity(x) === exerciseIdentity(e),
    );
    return {
      ...structuredClone(e),
      exerciseId: exerciseIdentity(e),
      equipment: old?.equipment || "",
      sets: Array.from({ length: e.sets }, (_, i) =>
        structuredClone(
          old?.sets[i] || { weight: "", reps: "", rir: "", done: false },
        ),
      ),
    };
  });
  return next;
}

export function validDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + "T00:00:00Z")) && new Date(date + "T00:00:00Z").toISOString().slice(0,10) === date;
}
export function sessionsOnDate(sessions, date, template) {
  return sessions.filter(s => !s._deleted && !s.conflictOf && s.date === date && s.template === template);
}

// Corrections work on a detached copy, never a future routine definition.
export function sessionCorrection(session) {
  if (!session || session._deleted) throw Error("This session was deleted.");
  return structuredClone(session);
}
export function saveSessionCorrection(original, draft, today = day()) {
  if (!original || original._deleted || draft.id !== original.id)
    throw Error("This session is no longer available.");
  if (!validDate(draft.date)) throw Error("Choose a valid workout date.");
  if (draft.finished && draft.date > today)
    throw Error("A future workout cannot be completed. Change its date or mark it in progress.");
  const next = structuredClone(original);
  for (const key of ["date", "notes", "cardio", "technique", "finished"]) next[key] = draft[key];
  if (typeof next.finished !== "boolean" || typeof next.technique !== "boolean" ||
      (next.cardio !== "" && (!Number.isFinite(Number(next.cardio)) || Number(next.cardio) < 0 || Number(next.cardio) > 1e6)))
    throw Error("Check session completion and cardio values.");
  if (draft.exercises.length !== next.exercises.length) throw Error("Session exercises changed; reopen the editor.");
  next.exercises.forEach((ex, i) => {
    const edited = draft.exercises[i];
    if (exerciseIdentity(ex) !== exerciseIdentity(edited) || ex.sets.length !== edited.sets.length)
      throw Error("Session exercises changed; reopen the editor.");
    ex.sets = structuredClone(edited.sets);
    ex.equipment = edited.equipment;
    ex.increment = edited.increment;
  });
  validateRecord("sessions", next);
  return next;
}
