import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
test("HTTP service protects records, enforces origin and persists authenticated updates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "steadily-test-")),
    token = randomBytes(32).toString("hex");
  const child = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      PORT: "5179",
      HOST: "127.0.0.1",
      DATA_DIR: directory,
      SYNC_TOKEN: token,
      APP_ORIGIN: "https://journal.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once("data", resolve);
      child.once("error", reject);
      child.once("exit", (code) => reject(Error("Server exit " + code)));
    });
    const base = "http://127.0.0.1:5179";
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal((await fetch(base + "/api/sync")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/sync", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: '{"changes":[]}',
        })
      ).status,
      403,
    );
    const headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Origin: "https://journal.test",
    };
    const unlocked = await fetch(base + "/api/unlock", {
      method: "POST",
      headers,
    });
    assert.equal(unlocked.status, 204);
    const cookie = unlocked.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    const cookieHeaders = {
      "Content-Type": "application/json",
      Origin: "https://journal.test",
      Cookie: cookie.split(";")[0],
    };
    const authenticated = await fetch(base + "/api/sync", {
      method: "POST",
      headers: cookieHeaders,
      body: '{"changes":[]}',
    });
    assert.equal(authenticated.status, 200);
    assert.match(authenticated.headers.get("set-cookie"), /Max-Age=31536000/);
    assert.match(authenticated.headers.get("set-cookie"), /HttpOnly/);
    const record = {
      id: "test-food",
      name: "Test food",
      source: "Test label",
      kcal: 100,
      protein: 5,
      carbs: 10,
      fat: 3,
    };
    let r = await fetch(base + "/api/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ changes: [{ store: "foods", record }] }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).length, 1);
    r = await fetch(base + "/api/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ changes: [{ store: "foods", record }] }),
    });
    assert.equal((await r.json()).length, 1);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
