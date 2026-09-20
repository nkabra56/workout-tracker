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
export function newSession(template, unit) {
  return {
    id: uid(),
    date: day(),
    template,
    unit,
    finished: false,
    technique: false,
    notes: "",
    cardio: 0,
    exercises: templates[template].exercises.map((x) => ({
      ...x,
      equipment: "",
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
      logs.reduce((n, l) => n + (Number(l.food[k]) * l.grams) / 100, 0),
    ]),
  );
}
export function mergeRecords(existing, incoming) {
  const result = new Map(existing.map((x) => [x.id, x]));
  for (const r of incoming) {
    if (!r.id) throw Error("Invalid record");
    const old = result.get(r.id);
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
  if (store === "sessions") {
    const t = templates[r.template];
    valid =
      !!t &&
      ["kg", "lb"].includes(r.unit) &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      text(r.notes) &&
      Array.isArray(r.exercises) &&
      r.exercises.length === t.exercises.length &&
      r.exercises.every((e, i) => {
        const expected = t.exercises[i];
        return (
          ["name", "min", "max", "each"].every((k) => e[k] === expected[k]) &&
          JSON.stringify(e.rest) === JSON.stringify(expected.rest) &&
          text(e.equipment, 200) &&
          Array.isArray(e.sets) &&
          e.sets.length === expected.sets &&
          e.sets.every(
            (s) =>
              typeof s.done === "boolean" &&
              ["weight", "reps", "rir"].every(
                (k) =>
                  s[k] === "" ||
                  ((typeof s[k] === "number" || typeof s[k] === "string") &&
                    /^\d+(\.\d+)?$/.test(String(s[k])) &&
                    finite(Number(s[k]), k === "rir" ? 10 : 1e6)),
              ),
          )
        );
      });
  }
  if (!valid) throw Error("Invalid " + store + " record");
  return true;
}
