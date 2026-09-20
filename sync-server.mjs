import { validateRecord } from "./core.js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function authorized(provided, expected) {
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(provided || ""),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function reconcile(state, changes) {
  const next = structuredClone(state);
  for (const change of changes) {
    const { store, record, base } = change;
    if (
      !["sessions", "foods", "logs", "settings"].includes(store) ||
      !record ||
      typeof record.id !== "string" ||
      record.id.length > 160
    )
      throw Error("Invalid sync record");
    validateRecord(store, record);
    const clean = { ...record };
    delete clean._base;
    delete clean._dirty;
    delete clean._version;
    const version = digest(clean),
      key = store + ":" + clean.id,
      old = next[key];
    if (old?.version === version) continue;
    if (old && old.version !== base) {
      const conflict = {
        ...clean,
        id: clean.id + "-conflict-" + version.slice(0, 16),
        conflictOf: clean.id,
      };
      const conflictKey = store + ":" + conflict.id;
      next[conflictKey] ??= {
        store,
        record: conflict,
        version: digest(conflict),
      };
      continue;
    }
    next[key] = { store, record: clean, version };
  }
  return next;
}
let queue = Promise.resolve();
export function syncDisk(directory, changes) {
  const work = queue.then(async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let state = {};
    try {
      state = JSON.parse(await readFile(directory + "/records.json", "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const next = reconcile(state, changes);
    await writeFile(directory + "/records.tmp", JSON.stringify(next), {
      mode: 0o600,
    });
    await rename(directory + "/records.tmp", directory + "/records.json");
    return Object.values(next);
  });
  queue = work.catch(() => {});
  return work;
}

export function issueSession(secret, now = Date.now()) {
  const expires = String(now + 30 * 86400000);
  return (
    expires +
    "." +
    createHmac("sha256", secret).update(expires).digest("base64url")
  );
}
export function validSession(cookie, secret, now = Date.now()) {
  if (!secret || secret.length < 32) return false;
  const value = (cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("steadily_session="))
    ?.slice(17);
  if (!value) return false;
  const [expiry, signature] = value.split(".");
  if (
    !/^\d+$/.test(expiry) ||
    Number(expiry) <= now ||
    Number(expiry) > now + 31 * 86400000
  )
    return false;
  return authorized(
    signature,
    createHmac("sha256", secret).update(expiry).digest("base64url"),
  );
}
