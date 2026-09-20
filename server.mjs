import { authorized, syncDisk } from "./sync-server.mjs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
const allowed = new Set([
  "index.html",
  "app.js",
  "core.js",
  "storage.js",
  "style.css",
  "sw.js",
  "icon.svg",
  "manifest.webmanifest",
]);
const types = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  webmanifest: "application/manifest+json",
};
let lastSearch = 0;
http
  .createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/sync") {
        res.setHeader("Cache-Control", "no-store");
        if (!process.env.SYNC_TOKEN || process.env.SYNC_TOKEN.length < 32) {
          res.writeHead(503).end();
          return;
        }
        if (
          !authorized(
            req.headers.authorization?.replace(/^Bearer /, ""),
            process.env.SYNC_TOKEN,
          )
        ) {
          res.writeHead(401).end();
          return;
        }
        if (
          process.env.APP_ORIGIN &&
          req.headers.origin !== process.env.APP_ORIGIN
        ) {
          res.writeHead(403).end();
          return;
        }
        if (
          req.method !== "POST" ||
          !req.headers["content-type"]?.startsWith("application/json")
        ) {
          res.writeHead(405).end();
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 5e6) {
            res.writeHead(413).end();
            return;
          }
        }
        const parsed = JSON.parse(body);
        if (!Array.isArray(parsed.changes) || parsed.changes.length > 10000) {
          res.writeHead(400).end();
          return;
        }
        const records = await syncDisk(
          process.env.DATA_DIR || root + "private-data",
          parsed.changes,
        );
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(records));
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === "/api/foods") {
        if (Date.now() - lastSearch < 6500) {
          res.writeHead(429).end("Wait a few seconds between searches");
          return;
        }
        lastSearch = Date.now();
        const q = (url.searchParams.get("q") || "").trim().slice(0, 150);
        const barcode = /^\d{8,14}$/.test(q);
        const fields = "code,product_name,nutriments";
        const endpoint = barcode
          ? `https://world.openfoodfacts.org/api/v2/product/${q}?fields=${fields}`
          : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}`;
        const r = await fetch(endpoint, {
          headers: { "User-Agent": "Steadily/1.0 (private nutrition journal)" },
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) throw Error("upstream");
        const data = await r.json();
        const out = (barcode ? [data.product] : data.products || [])
          .filter(Boolean)
          .filter(
            (p) =>
              p.product_name &&
              [
                "energy-kcal_100g",
                "proteins_100g",
                "carbohydrates_100g",
                "fat_100g",
              ].every((k) => Number.isFinite(p.nutriments?.[k])),
          )
          .map((p) => ({
            name: p.product_name,
            kcal: p.nutriments["energy-kcal_100g"],
            protein: p.nutriments.proteins_100g,
            carbs: p.nutriments.carbohydrates_100g,
            fat: p.nutriments.fat_100g,
            source: "Open Food Facts · community estimate",
            code: p.code,
          }));
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out));
        return;
      }
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!allowed.has(file)) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        types[file.split(".").pop()] || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-cache");
      res.end(await readFile(root + file));
    } catch {
      res.writeHead(502).end("Service unavailable");
    }
  })
  .listen(
    Number(process.env.PORT || 5173),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        "Steadily listening on loopback port " + (process.env.PORT || 5173),
      ),
  );
