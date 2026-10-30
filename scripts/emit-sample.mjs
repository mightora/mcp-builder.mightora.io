import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
await import("../src/generator.js");
const base = resolve(import.meta.dirname, "../test-output/sample");
const files = globalThis.MCP.projectFiles(globalThis.MCP.example());
for (const [name, body] of Object.entries(files)) {
  const target = resolve(base, name);
  if (!target.startsWith(base + "/")) throw new Error("Unsafe generated path.");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
}
console.log("Generated " + Object.keys(files).length + " sample files for .NET verification.");
