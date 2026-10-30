import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";
const root = resolve(import.meta.dirname, "..");
const html = await readFile(resolve(root, "dist/downloads/mcp-builder-offline.html"), "utf8");
const zip = await readFile(resolve(root, "dist/downloads/mcp-builder-offline.zip"));
const required = [
  "Offline Edition – No Internet Connection Required",
  "connect-src &#39;none&#39;",
  "Mightora MCP Builder",
  "globalThis",
  "data:image/png;base64,"
];
for (const term of required) if (!html.includes(term)) throw new Error("Offline HTML missing: " + term);
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html)) throw new Error("Offline HTML contains a remote script or stylesheet.");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for (const match of inlineScripts) {
  if (match[0].includes('application/ld+json')) continue;
  new Script(match[1], { filename: "mcp-builder-offline.inline.js" });
}
if (inlineScripts.length < 2) throw new Error("Offline HTML has no embedded builder code.");
if (zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt32LE(zip.length - 22) !== 0x06054b50) throw new Error("Offline ZIP has invalid headers.");
console.log("Offline HTML, embedded JavaScript and ZIP structure are valid.");
