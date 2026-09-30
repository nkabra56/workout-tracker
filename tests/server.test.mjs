import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import http from "node:http";
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
    assert.equal((await fetch(base + "/api/foods?q=test")).status, 404);
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
    for (const body of ['{', 'null', '{"changes":[null]}', '{"changes":[{"store":"sessions","record":{"id":"invalid"}}]}']) {
      assert.equal((await fetch(base + '/api/sync', {method:'POST', headers, body})).status, 400);
    }
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
      id: "test-weighin",
      type: "weighin",
      value: 180,
      unit: "lb",
      date: "2026-01-01",
      note: "",
    };
    let r = await fetch(base + "/api/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ changes: [{ store: "settings", record }] }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).length, 1);
    // Deliberately split a multibyte character across HTTP chunks.
    const unicodeRecord = {...record, id:'unicode', note:'Training 💪 café'};
    const body = Buffer.from(JSON.stringify({changes:[{store:'settings',record:unicodeRecord}]}));
    const split = body.indexOf(Buffer.from('💪')) + 1;
    const received = await new Promise((resolve,reject) => {
      const request = http.request(base + '/api/sync', {method:'POST',headers}, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => text += chunk);
        response.on('end', () => {
          try { assert.equal(response.statusCode,200); resolve(JSON.parse(text)); }
          catch (error) { reject(error); }
        });
      });
      request.on('error',reject);
      request.write(body.subarray(0,split));
      setTimeout(() => request.end(body.subarray(split)),25);
    });
    assert.equal(received.find(item => item.record.id === 'unicode').record.note,unicodeRecord.note);
    r = await fetch(base + "/api/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ changes: [{ store: "settings", record }] }),
    });
    assert.equal((await r.json()).length, 2);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("Tailscale HTTP sync needs approved identity without keys or cookies and rejects token bypass", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lifty-serve-"));
  const child = spawn(process.execPath, ["server.mjs"], {
    env: {...process.env, PORT:"5183", HOST:"127.0.0.1", DATA_DIR:directory, SYNC_AUTH:"tailscale", TAILSCALE_PROXY_ADDRESS:"127.0.0.1", TAILSCALE_ALLOWED_LOGINS:"owner@example.com", APP_ORIGIN:"https://journal.test", SYNC_TOKEN:"a".repeat(64)},
    stdio:["ignore","pipe","pipe"]
  });
  try {
    await new Promise((resolve,reject) => { child.stdout.once("data",resolve); child.once("error",reject); child.once("exit",code=>reject(Error("Server exit "+code))); });
    const headers = {"Content-Type":"application/json",Origin:"https://journal.test"};
    const request = (extra={}) => fetch("http://127.0.0.1:5183/api/sync",{method:"POST",headers:{...headers,...extra},body:'{"changes":[]}'});
    assert.equal((await request()).status,401);
    assert.equal((await request({Authorization:"Bearer "+"a".repeat(64)})).status,401);
    assert.equal((await request({"Tailscale-User-Login":"other@example.com"})).status,401);
    assert.equal((await request({"Tailscale-User-Login":"owner@example.com, other@example.com"})).status,401);
    assert.equal((await request({"Tailscale-User-Login":"owner@example.com",Origin:"https://evil.test"})).status,403);
    const response = await request({"Tailscale-User-Login":"owner@example.com"});
    assert.equal(response.status,200);
    assert.equal(response.headers.get("set-cookie"),null);
    assert.deepEqual(await response.json(),[]);
    assert.equal((await fetch("http://127.0.0.1:5183/api/unlock",{method:"POST",headers:{...headers,"Tailscale-User-Login":"owner@example.com"}})).status,404);
  } finally {
    child.kill(); await new Promise(resolve=>child.once("exit",resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
