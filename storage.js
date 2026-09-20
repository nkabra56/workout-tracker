const db = new Promise((resolve, reject) => {
  const r = indexedDB.open("steadily", 1);
  r.onupgradeneeded = () => {
    for (const name of ["sessions", "foods", "logs", "settings"])
      r.result.createObjectStore(name, { keyPath: "id" });
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
export async function readAll(store, deleted = false) {
  const d = await db;
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).getAll();
    r.onsuccess = () =>
      resolve(deleted ? r.result : r.result.filter((x) => !x._deleted));
    r.onerror = () => reject(r.error);
  });
}
export async function write(store, record) {
  const d = await db;
  record._dirty = true;
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).put(structuredClone(record));
    tx.oncomplete = () => { window.dispatchEvent(new Event("journal-saved")); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function remove(store, id) {
  const records = await readAll(store);
  const record = records.find((r) => r.id === id);
  if (record) await write(store, { ...record, _deleted: true });
}
export async function sync() {
  const stores = ["sessions", "foods", "logs", "settings"];
  const snapshots = await Promise.all(stores.map((s) => readAll(s, true)));
  const changes = snapshots.flatMap((rs, i) =>
    rs
      .filter((r) => r._dirty)
      .map((r) => ({ store: stores[i], record: r, base: r._base })),
  );
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ changes }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Object.assign(Error(
      [401, 403].includes(response.status)
        ? "Pi access denied. Connect Tailscale with the account authorized for this journal."
        : response.status === 503
          ? "Pi sync is not configured."
          : "Sync unavailable; local changes are safe.",
    ), { status: response.status });
  const incoming = await response.json();
  const d = await db;
  await new Promise((resolve, reject) => {
    const tx = d.transaction(stores, "readwrite");
    for (const item of incoming) {
      const objectStore = tx.objectStore(item.store);
      const get = objectStore.get(item.record.id);
      get.onsuccess = () => {
        const current = get.result,
          snapshot = snapshots[stores.indexOf(item.store)].find(
            (r) => r.id === item.record.id,
          );
        if (current && JSON.stringify(current) !== JSON.stringify(snapshot))
          return;
        objectStore.put({ ...item.record, _base: item.version, _dirty: false });
      };
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return incoming.filter((i) => i.record.conflictOf).length;
}
