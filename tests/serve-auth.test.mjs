import test from "node:test";
import assert from "node:assert/strict";
import { serveAuthConfig, trustedServeIdentity } from "../serve-auth.mjs";
import { startAutomaticSync } from "../automatic-sync.js";

const env = { SYNC_AUTH: "tailscale", HOST: "127.0.0.1", TAILSCALE_PROXY_ADDRESS: "127.0.0.1", APP_ORIGIN: "https://journal.test", TAILSCALE_ALLOWED_LOGINS: "owner@example.com" };
const req = (login, peer = "127.0.0.1") => ({socket: { remoteAddress: peer }, headers: {"tailscale-user-login": login}, rawHeaders: login ? ["Tailscale-User-Login", login] : []});
test("Serve identity requires explicit safe configuration, trusted local peer and exact owner", () => {
  const config = serveAuthConfig(env);
  assert.equal(trustedServeIdentity(req("owner@example.com"), config), true);
  for (const login of [undefined, "guest@example.com", "owner@example.com,guest@example.com", "OWNER@example.com"]) assert.equal(trustedServeIdentity(req(login), config), false);
  for (const peer of ["100.64.0.2", "192.168.1.2", "::1", "127.0.0.2"]) assert.equal(trustedServeIdentity(req("owner@example.com", peer), config), false);
  const duplicate = req("owner@example.com");
  duplicate.rawHeaders.push("tailscale-user-login", "owner@example.com");
  assert.equal(trustedServeIdentity(duplicate, config), false);
  for (const patch of [{HOST:"0.0.0.0"}, {TAILSCALE_PROXY_ADDRESS:"100.64.0.2"}, {TAILSCALE_ALLOWED_LOGINS:""}, {APP_ORIGIN:"http://journal.test"}, {APP_ORIGIN:"https://journal.test/"}]) assert.throws(() => serveAuthConfig({...env,...patch}));
  assert.equal(trustedServeIdentity(req("owner@example.com"), serveAuthConfig({})), false);
  assert.throws(() => serveAuthConfig({SYNC_AUTH:"anonymous"}));
});

test("automatic sync starts without setup and retries on saved edits, reconnect, foreground and timer", () => {
  const events = new EventTarget(), visibility = new EventTarget();
  let count = 0, timeout, interval;
  const timers = {setTimeout(fn) {timeout=fn;return 1;}, clearTimeout() {timeout=null;}, setInterval(fn) {interval=fn;return 2;}, clearInterval() {interval=null;}};
  const stop = startAutomaticSync(() => count++, events, visibility, timers);
  assert.equal(count,1);
  events.dispatchEvent(new Event("journal-saved"));
  events.dispatchEvent(new Event("journal-saved"));
  assert.equal(count,1); timeout(); assert.equal(count,2);
  events.dispatchEvent(new Event("online")); assert.equal(count,3);
  visibility.visibilityState="hidden"; visibility.dispatchEvent(new Event("visibilitychange")); assert.equal(count,3);
  visibility.visibilityState="visible"; visibility.dispatchEvent(new Event("visibilitychange")); assert.equal(count,4);
  interval(); assert.equal(count,5);
  stop(); events.dispatchEvent(new Event("online")); assert.equal(count,5);
  assert.equal(timeout,null); assert.equal(interval,null);
});
