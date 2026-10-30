import test from "node:test";
import assert from "node:assert/strict";
await import("../src/generator.js");
await import("../src/zip.js");
const { example, validate, toYaml, fromYaml, projectFiles } = globalThis.MCP;

test("example validates and round-trips through restricted YAML", () => {
  const e = example();
  assert.deepEqual(validate(e).filter(x => x.type === "error"), []);
  assert.deepEqual(fromYaml(toYaml(e)), e);
});
test("rejects unsafe table/field identifiers and invalid permissions", () => {
  const e = example();
  e.tools[0].fields = ["name", "name);DROP TABLE account"];
  e.security.defaultPermission = "allow";
  assert.ok(validate(e).filter(x => x.type === "error").length >= 2);
  assert.throws(() => projectFiles(e));
});
test("does not permit arbitrary YAML tags or prototype pollution", () => {
  assert.throws(() => fromYaml("schemaVersion: !!python/object/apply\n"));
  assert.throws(() => fromYaml("__proto__: \"bad\"\n"));
});
test("generated project includes fixed read-only Azure Functions tools and ALM", () => {
  const files = projectFiles(example());
  assert.match(files["src/Tools/FindAccountsTool.cs"], /McpToolTrigger/);
  assert.match(files["src/DataverseGateway.cs"], /HttpMethod.Get/);
  assert.match(files["src/IdentityResolver.cs"], /OnBehalfOfCredential/);
  assert.match(files["src/host.json"], /System/);
  assert.match(files["src/DataverseQuery.cs"], /Math.Clamp/);
  assert.match(files["tests/QueryTests.cs"], /Search_EscapesQuotesAndLimitsResults/);
  assert.match(files[".github/workflows/deploy.yml"], /production:/);
  assert.match(files["azure-pipelines.yml"], /environment: production/);
  assert.match(files["DEPLOYMENT.md"], /protected main/);
  assert.doesNotMatch(files["src/DataverseGateway.cs"], /HttpMethod.(Post|Put|Delete|Patch)/);
});
test("generated ZIP is readable as a standards-conformant stored archive", async () => {
  const blob = globalThis.MCPZip.createZip({ "README.md": "Hello", "mcp-server.yaml": toYaml(example()) });
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), 2);
});
