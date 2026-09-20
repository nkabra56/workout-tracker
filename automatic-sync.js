// Local writes, reopening, reconnecting and periodic retries need no browser opt-in.
export function startAutomaticSync(syncNow, events = window, visibility = document, timers = globalThis) {
  let pending;
  const changed = () => {
    timers.clearTimeout(pending);
    pending = timers.setTimeout(syncNow, 800);
  };
  const visible = () => {
    if (visibility.visibilityState === "visible") syncNow();
  };
  events.addEventListener("journal-saved", changed);
  events.addEventListener("online", syncNow);
  visibility.addEventListener("visibilitychange", visible);
  const interval = timers.setInterval(syncNow, 30000);
  syncNow();
  return () => {
    timers.clearTimeout(pending);
    timers.clearInterval(interval);
    events.removeEventListener("journal-saved", changed);
    events.removeEventListener("online", syncNow);
    visibility.removeEventListener("visibilitychange", visible);
  };
}
