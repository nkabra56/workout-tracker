import { templates, exerciseIdentity, uid } from "./core.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function draftFor(day, definition, scope = "future") {
  return {
    day,
    scope,
    name: definition.name,
    exercises: definition.exercises.map((e) => ({
      ...structuredClone(e),
      exerciseId: exerciseIdentity(e),
      originalName: e.name,
      originalExerciseId: exerciseIdentity(e),
    })),
  };
}
export function renderEditor(draft, hasSession, alternatives = []) {
  const number = (i, key, label, value, min = 1, max = 1000) =>
    `<label>${label}<input inputmode="numeric" type="number" min="${min}" max="${max}" step="1" data-edit="${i},${key}" value="${value}" required></label>`;
  return `<section class="editor"><div class="section-title"><h1>Edit workout</h1><button id="editor-cancel" class="secondary">Cancel</button></div><p>Day ${draft.day + 1}. Changes are applied only when you save.</p><label>Apply to<select id="editor-scope"><option value="future" ${draft.scope === "future" ? "selected" : ""}>Future workouts only</option>${hasSession ? `<option value="session" ${draft.scope === "session" ? "selected" : ""}>This session only</option>` : ""}</select></label><p>Completed sessions keep their original exercise names and numbers.</p><label>Workout name<input id="editor-name" value="${esc(draft.name)}" maxlength="120" required></label><datalist id="exercise-names">${[...new Set(templates.flatMap((t) => t.exercises.map((e) => e.name)))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>${draft.exercises.map((e, i) => `<article><div class="section-title"><h3>Exercise ${i + 1}</h3><div class="edit-order"><button type="button" class="secondary" data-move="${i},-1" aria-label="Move exercise ${i + 1} up" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="secondary" data-move="${i},1" aria-label="Move exercise ${i + 1} down" ${i === draft.exercises.length - 1 ? "disabled" : ""}>↓</button></div></div><label>Exercise name<input list="exercise-names" data-edit="${i},name" value="${esc(e.name)}" maxlength="200" required></label><p>Choose a known exercise or enter your own. A different name starts a separate exercise history.</p><div class="fields">${number(i, "sets", "Working sets", e.sets, 1, 20)}${number(i, "min", "Minimum reps", e.min)}${number(i, "max", "Maximum reps", e.max)}${number(i, "restMin", "Minimum rest (sec)", e.rest[0], 1, 3600)}${number(i, "restMax", "Maximum rest (sec)", e.rest[1], 1, 3600)}</div><label><input type="checkbox" data-edit="${i},each" ${e.each ? "checked" : ""}> Each arm / side</label><button type="button" class="secondary" data-remove-exercise="${i}">Remove exercise</button></article>`).join("")}<button id="editor-add" class="secondary">Add exercise</button><article><button id="editor-save">${draft.scope === "session" ? "Save this session only" : "Save future template"}</button><p>When editing a session, unchanged exercises retain their entries. Removed entries remain in its edit archive and backup.</p><button id="editor-restore" class="secondary">Restore original Day ${draft.day + 1}</button></article>${alternatives.length ? `<article><h2>Alternative templates</h2><p>These conflicting versions are preserved. They are not applied automatically.</p>${alternatives.map((a) => `<button class="secondary" data-template-alternative="${a.id}">Review ${esc(a.name)}</button>`).join("")}</article>` : ""}</section>`;
}
export function updateDraft(draft, target) {
  if (target.id === "editor-name") draft.name = target.value;
  if (target.id === "editor-scope") draft.scope = target.value;
  if (target.dataset.edit) {
    const [index, key] = target.dataset.edit.split(","),
      e = draft.exercises[index];
    if (key === "name") {
      if (target.value !== e.name) {
        e.exerciseId =
          target.value === e.originalName
            ? e.originalExerciseId
            : (e.replacementId ||= uid());
        e.name = target.value;
      }
    } else if (key === "each") e.each = target.checked;
    else if (key === "restMin") e.rest[0] = Number(target.value);
    else if (key === "restMax") e.rest[1] = Number(target.value);
    else e[key] = Number(target.value);
  }
}
