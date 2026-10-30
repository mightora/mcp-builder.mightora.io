import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const downloads = join(dist, "downloads");
const source = join(root, "src");
await mkdir(join(dist, "assets"), { recursive: true });
await mkdir(downloads, { recursive: true });

const template = await readFile(join(source, "index.html"), "utf8");
const css = await readFile(join(source, "styles.css"), "utf8");
const generator = await readFile(join(source, "generator.js"), "utf8");
const zip = await readFile(join(source, "zip.js"), "utf8");
const app = await readFile(join(source, "app.js"), "utf8");
const logo = await readFile(join(root, "assets/mightora-logo.png"));
const author = await readFile(join(root, "assets/ian-tweedie.png"));
const logoData = "data:image/png;base64," + logo.toString("base64");
const authorData = "data:image/png;base64," + author.toString("base64");

// The shared component consumes a YAML footer. Keep the parsing workaround
// before js-yaml and components.js, as required by Mightora shared-ui.
const footerPatch = [
  "<script>",
  "(function(){",
  "const originalFetch=window.fetch.bind(window);",
  "window.fetch=async function(input,options){",
  "const response=await originalFetch(input,options);",
  "const url=typeof input==='string'?input:(input&&input.url)||'';",
  "if(!/footer\\.ya?ml(?:\\?|$)/i.test(url)||!response.ok)return response;",
  "const raw=await response.text();",
  "const normalised=raw.replace(/\\t/g,'  ').replace(/^ {8}(- )/gm,'    $1');",
  "return new Response(normalised,{status:response.status,statusText:response.statusText,headers:response.headers});",
  "};",
  "})();",
  "</script>"
].join("\n");

const onlineHead = [
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/shared.css">',
  '<link rel="stylesheet" href="./styles.css">',
  footerPatch
].join("\n");
const onlineBody = [
  '<script src="./generator.js"></script>',
  '<script src="./zip.js"></script>',
  '<script src="./app.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/components.js"></script>'
].join("\n");
const online = template.replace("<!--HEAD_ASSETS-->", onlineHead).replace("<!--BODY_ASSETS-->", onlineBody);
await writeFile(join(dist, "index.html"), online);
await writeFile(join(dist, "styles.css"), css);
await writeFile(join(dist, "generator.js"), generator);
await writeFile(join(dist, "zip.js"), zip);
await writeFile(join(dist, "app.js"), app);
await writeFile(join(dist, "CNAME"), "mcp-builder.mightora.io\n");
await copyFile(join(root, "assets/mightora-logo.png"), join(dist, "assets/mightora-logo.png"));
await copyFile(join(root, "assets/ian-tweedie.png"), join(dist, "assets/ian-tweedie.png"));

const offlineCsp = '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; script-src &#39;unsafe-inline&#39;; connect-src &#39;none&#39;; font-src data:; media-src data:; form-action &#39;none&#39;; base-uri &#39;none&#39;;">';
const offlineHead = [
  offlineCsp,
  "<style>" + css + "</style>"
].join("\n");
const offlineBody = [
  '<div class="offline-banner" role="status">Offline Edition – No Internet Connection Required</div>',
  "<script>" + generator + "\n" + zip + "\n" + app + "</script>"
].join("\n");
const offline = template
  .replace("<!--HEAD_ASSETS-->", offlineHead)
  .replace("<!--BODY_ASSETS-->", offlineBody)
  .replaceAll("./assets/mightora-logo.png", logoData)
  .replaceAll("./assets/ian-tweedie.png", authorData)
  .replaceAll('href="./downloads/mcp-builder-offline.html"', 'href="#" aria-disabled="true"')
  .replaceAll('href="./downloads/mcp-builder-offline.zip"', 'href="#" aria-disabled="true"');
await writeFile(join(downloads, "mcp-builder-offline.html"), offline);

await import(pathToFileURL(join(source, "zip.js")).href);
const files = {
  "index.html": offline,
  "README.txt": "Mightora MCP Builder offline edition\n\nOpen index.html directly in a modern browser. No installation, hosting or internet connection is needed.\n\nThe app stores its YAML project locally in your browser. Export your YAML to keep a portable backup. External documentation links are optional and require internet access.\n",
  "LICENSE": await readFile(join(root, "LICENSE"), "utf8")
};
const offlineArchive = globalThis.MCPZip.createZip(files);
await writeFile(join(downloads, "mcp-builder-offline.zip"), Buffer.from(await offlineArchive.arrayBuffer()));

await writeFile(join(dist, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://mcp-builder.mightora.io/sitemap.xml\n");
await writeFile(join(dist, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://mcp-builder.mightora.io/</loc></url></urlset>\n');
await writeFile(join(dist, "llms.txt"), [
  "# Mightora MCP Builder",
  "",
  "Free, open-source, local-first visual Dataverse MCP server builder.",
  "It generates a Mightora YAML definition, restricted .NET Azure Functions MCP tools and GitHub Actions or Azure DevOps ALM templates.",
  "No data or credentials are sent to Mightora. The initial release generates read-only Dataverse operations.",
  "Website: https://mcp-builder.mightora.io/",
  "Repository: https://github.com/mightora/mcp-builder.mightora.io",
  "Learn about architecture, user versus application context, Entra OAuth, OBO, Dataverse security and ALM on the home page.",
  ""
].join("\n"));
console.log("Built GitHub Pages site and fully inline offline edition.");
