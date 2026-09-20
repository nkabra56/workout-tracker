import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "app.js",
  "core.js",
  "storage.js",
  "style.css",
  "sw.js",
  "icon.svg",
  "manifest.webmanifest",
])
  await copyFile(file, "dist/" + file);
console.log(
  "Static offline shell built in dist/. Run server.mjs for online food lookup.",
);
