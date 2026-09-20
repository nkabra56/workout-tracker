import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "app.js",
  "navigation.js",
  "progress.js",
  "automatic-sync.js",
  "editor.js",
  "core.js",
  "storage.js",
  "style.css",
  "sw.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "manifest.webmanifest",
])
  await copyFile(file, "dist/" + file);
console.log(
  "Static offline shell built in dist/. Run server.mjs for private sync.",
);
