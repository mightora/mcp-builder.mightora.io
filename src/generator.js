/* Mightora MCP Builder's small, dependency-free specification and generator engine.
   No network requests or credentials are required. */
(function (root) {
  "use strict";
  const NAME = /^[a-z][a-z0-9_]{2,63}$/;
  const LOGICAL = /^[a-z][a-z0-9_]{0,99}$/;
  const VERSION = "0.1.0";
  const clone = value => JSON.parse(JSON.stringify(value));

  function example() {
    return {
      schemaVersion: "1.0",
      server: { name: "customer_service_mcp", description: "Restricted customer service tools", version: "1.0.0" },
      dataverse: { environmentVariable: "DATAVERSE_URL" },
      security: { inbound: "entra-oauth", context: "application", defaultPermission: "deny" },
      tools: [
        { name: "find_accounts", description: "Find active customer accounts by name", operation: "search", table: "account", entitySet: "accounts", fields: ["name", "accountnumber"], searchField: "name", maxRecords: 25 },
        { name: "get_case", description: "Get approved details for a case by its ID", operation: "get", table: "incident", entitySet: "incidents", fields: ["title", "ticketnumber", "statecode"], searchField: "", maxRecords: 1 }
      ],
      delivery: { provider: "github", branch: "main", environments: ["development", "test", "production"], productionApproval: true }
    };
  }

  function validate(input) {
    const issues = [];
    const err = (path, message) => issues.push({ path, message, type: "error" });
    const warn = (path, message) => issues.push({ path, message, type: "warning" });
    if (!input || typeof input !== "object" || Array.isArray(input)) return [{ path: "root", message: "The definition must be an object.", type: "error" }];
    if (input.schemaVersion !== "1.0") err("schemaVersion", "Only schema version 1.0 is supported.");
    if (!input.server || !NAME.test(input.server.name || "")) err("server.name", "Use 3–64 lowercase letters, numbers or underscores, starting with a letter.");
    if (!input.server || !String(input.server.description || "").trim()) err("server.description", "Provide a description.");
    if (!input.security || !["application", "delegated-user"].includes(input.security.context)) err("security.context", "Choose application or delegated-user.");
    if (!input.security || input.security.inbound !== "entra-oauth") err("security.inbound", "Only Microsoft Entra OAuth is supported.");
    if (!input.security || input.security.defaultPermission !== "deny") err("security.defaultPermission", "The default permission must be deny.");
    if (!input.dataverse || input.dataverse.environmentVariable !== "DATAVERSE_URL") err("dataverse.environmentVariable", "Use DATAVERSE_URL as the environment setting.");
    if (!input.delivery || !["github", "azure-devops"].includes(input.delivery.provider)) err("delivery.provider", "Choose GitHub or Azure DevOps.");
    if (!input.delivery || input.delivery.branch !== "main") err("delivery.branch", "The protected default branch must be main.");
    if (!input.delivery || JSON.stringify(input.delivery.environments) !== JSON.stringify(["development", "test", "production"])) err("delivery.environments", "Use separate development, test and production environments.");
    if (!input.delivery || input.delivery.productionApproval !== true) err("delivery.productionApproval", "Production approval is mandatory.");
    if (!Array.isArray(input.tools) || !input.tools.length) err("tools", "Add at least one tool.");
    if (Array.isArray(input.tools)) {
      if (input.tools.length > 30) err("tools", "Limit projects to 30 tools.");
      const names = new Set();
      input.tools.forEach((tool, i) => {
        const p = "tools[" + i + "]";
        if (!tool || !NAME.test(tool.name || "")) err(p + ".name", "Tool names must be lowercase snake_case, 3–64 characters.");
        if (names.has(tool?.name)) err(p + ".name", "Tool names must be unique.");
        names.add(tool?.name);
        if (!String(tool?.description || "").trim()) err(p + ".description", "Explain what the tool does.");
        if (!["search", "get"].includes(tool?.operation)) err(p + ".operation", "Only read-only search and get operations are supported.");
        if (!LOGICAL.test(tool?.table || "")) err(p + ".table", "Provide a valid Dataverse logical table name.");
        if (!LOGICAL.test(tool?.entitySet || "")) err(p + ".entitySet", "Provide the exact Dataverse entity set name.");
        if (!Array.isArray(tool?.fields) || !tool.fields.length || tool.fields.length > 30 || tool.fields.some(f => !LOGICAL.test(f))) err(p + ".fields", "Select 1–30 safe, valid Dataverse logical field names.");
        if (new Set(tool?.fields || []).size !== (tool?.fields || []).length) err(p + ".fields", "Do not repeat fields.");
        if (tool?.operation === "search" && (!LOGICAL.test(tool.searchField || "") || !tool.fields?.includes(tool.searchField))) err(p + ".searchField", "Search on one of the selected string fields.");
        if (!Number.isInteger(tool?.maxRecords) || tool.maxRecords < 1 || tool.maxRecords > 100) err(p + ".maxRecords", "Set a limit between 1 and 100.");
        if (tool?.operation === "get" && tool.maxRecords !== 1) warn(p + ".maxRecords", "Get operations always return at most one record.");
      });
    }
    return issues;
  }

  function quoteYaml(value) {
    if (value === null) return "null";
    if (typeof value === "boolean" || typeof value === "number") return String(value);
    return JSON.stringify(String(value));
  }
  function toYaml(input) {
    const lines = ["# Mightora MCP Builder | project schema v1.0", "# Declarative project file, not an official MCP protocol format.", "# Never store credentials, tokens or production secrets here."];
    function write(value, indent) {
      const pad = " ".repeat(indent);
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item && typeof item === "object") { lines.push(pad + "-"); write(item, indent + 2); }
          else lines.push(pad + "- " + quoteYaml(item));
        });
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([key, item]) => {
          if (item && typeof item === "object") { lines.push(pad + key + ":"); write(item, indent + 2); }
          else lines.push(pad + key + ": " + quoteYaml(item));
        });
      }
    }
    write(input, 0);
    return lines.join("\n") + "\n";
  }

  // Deliberately scoped parser for the subset emitted by toYaml. Reject tags,
  // anchors, merge keys and arbitrary YAML features. A round-trip is guaranteed.
  function fromYaml(text) {
    if (text.length > 250000) throw new Error("File is too large.");
    const rows = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith("#"))
      .map(line => ({ indent: (line.match(/^ */) || [""])[0].length, value: line.trim() }));
    if (rows.some(r => r.indent % 2 || /[\t]/.test(r.value))) throw new Error("Use spaces in multiples of two for indentation.");
    let at = 0;
    const scalar = raw => {
      if (raw === "true") return true;
      if (raw === "false") return false;
      if (raw === "null") return null;
      if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
      if (raw.startsWith('"')) return JSON.parse(raw);
      if (/^[A-Za-z0-9_.\-]+$/.test(raw)) return raw;
      throw new Error("Unsupported YAML value: " + raw.slice(0, 60));
    };
    function block(indent, depth) {
      if (depth > 12) throw new Error("YAML nesting is too deep.");
      if (at >= rows.length) return {};
      const array = rows[at].value === "-" || rows[at].value.startsWith("- ");
      const result = array ? [] : Object.create(null);
      while (at < rows.length && rows[at].indent === indent) {
        const line = rows[at++].value;
        if (array) {
          if (line === "-") {
            if (at >= rows.length || rows[at].indent <= indent) throw new Error("An array item is empty.");
            result.push(block(indent + 2, depth + 1));
          } else if (line.startsWith("- ")) result.push(scalar(line.slice(2)));
          else throw new Error("Mixed YAML array and object syntax.");
        } else {
          const match = line.match(/^([A-Za-z][A-Za-z0-9]*):(?: (.*))?$/);
          if (!match) throw new Error("Unsupported YAML key: " + line.slice(0, 60));
          const key = match[1];
          if (Object.hasOwn(result, key)) throw new Error("Duplicate YAML key: " + key);
          if (match[2] === undefined) {
            if (at >= rows.length || rows[at].indent !== indent + 2) throw new Error("Missing value for " + key);
            result[key] = block(indent + 2, depth + 1);
          } else result[key] = scalar(match[2]);
        }
        if (at < rows.length && rows[at].indent > indent && rows[at].indent !== indent + 2) throw new Error("Unexpected YAML indentation.");
      }
      return result;
    }
    if (!rows.length || rows[0].indent !== 0) throw new Error("Expected an unindented YAML definition.");
    const parsed = block(0, 0);
    if (at !== rows.length) throw new Error("Unsupported YAML structure.");
    return clone(parsed);
  }

  const cs = value => JSON.stringify(String(value)).replace(/\\u2028/g, "\\u2028");
  const className = name => name.split("_").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join("") + "Tool";
  function toolCode(tool) {
    const name = className(tool.name);
    const fields = tool.fields.map(cs).join(", ");
    const common = [
      "using Microsoft.Azure.Functions.Worker;",
      "using Microsoft.Azure.Functions.Worker.Extensions.Mcp;",
      "namespace MightoraMcp;",
      "",
      "public sealed class " + name + "(DataverseGateway gateway)",
      "{",
      "    [Function(" + cs(name) + ")]",
      "    public async Task<string> Run(",
      "        [McpToolTrigger(" + cs(tool.name) + ", " + cs(tool.description) + ")] ToolInvocationContext context,"
    ];
    if (tool.operation === "search") {
      common.push("        [McpToolProperty(\"searchTerm\", \"Search term, maximum 100 characters\", true)] string searchTerm)");
      common.push("    {");
      common.push("        if (string.IsNullOrWhiteSpace(searchTerm) || searchTerm.Length > 100)");
      common.push("            throw new ArgumentException(\"Provide a search term of 1–100 characters.\");");
      common.push("        return await gateway.SearchAsync(context, " + cs(tool.entitySet) + ", new[] { " + fields + " }, " + cs(tool.searchField) + ", searchTerm, " + tool.maxRecords + ");");
    } else {
      common.push("        [McpToolProperty(\"recordId\", \"Dataverse record GUID\", true)] string recordId)");
      common.push("    {");
      common.push("        if (!Guid.TryParse(recordId, out var id)) throw new ArgumentException(\"Invalid record ID.\");");
      common.push("        return await gateway.GetAsync(context, " + cs(tool.entitySet) + ", new[] { " + fields + " }, id);");
    }
    common.push("    }", "}", "");
    return common.join("\n");
  }

  function projectFiles(config) {
    const errors = validate(config).filter(x => x.type === "error");
    if (errors.length) throw new Error(errors.map(x => x.path + ": " + x.message).join("\n"));
    const files = {};
    files["mcp-server.yaml"] = toYaml(config);
    files["src/MightoraMcp.csproj"] = [
      '<Project Sdk="Microsoft.NET.Sdk">',
      "  <PropertyGroup>",
      "    <TargetFramework>net10.0</TargetFramework>",
      "    <AzureFunctionsVersion>v4</AzureFunctionsVersion>",
      "    <OutputType>Exe</OutputType>",
      "    <ImplicitUsings>enable</ImplicitUsings>",
      "    <Nullable>enable</Nullable>",
      "  </PropertyGroup>",
      "  <ItemGroup>",
      '    <FrameworkReference Include="Microsoft.AspNetCore.App" />',
      '    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.52.0" />',
      '    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="2.0.7" />',
      '    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore" Version="2.1.0" />',
      '    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Mcp" Version="1.5.0" />',
      '    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Mcp.Sdk" Version="1.0.0-preview.4" />',
      '    <PackageReference Include="Azure.Identity" Version="1.21.0" />',
      "  </ItemGroup>",
      "</Project>", ""
    ].join("\n");
    files["src/Program.cs"] = [
      "using Microsoft.Azure.Functions.Worker.Builder;",
      "using Microsoft.Extensions.DependencyInjection;",
      "using Microsoft.Extensions.Hosting;",
      "using MightoraMcp;",
      "",
      "var builder = FunctionsApplication.CreateBuilder(args);",
      "builder.ConfigureFunctionsWebApplication();",
      "builder.Services.AddHttpClient<DataverseGateway>();",
      "builder.Build().Run();", ""
    ].join("\n");
    files["src/host.json"] = JSON.stringify({ version: "2.0", extensions: { mcp: { serverName: config.server.name, serverVersion: config.server.version, system: { webhookAuthorizationLevel: "System" } } } }, null, 2) + "\n";
    files["src/local.settings.example.json"] = JSON.stringify({ IsEncrypted: false, Values: { AzureWebJobsStorage: "UseDevelopmentStorage=true", FUNCTIONS_WORKER_RUNTIME: "dotnet-isolated", DATAVERSE_URL: "https://yourorg.crm.dynamics.com", MCP_EXECUTION_CONTEXT: config.security.context } }, null, 2) + "\n";
    files["src/.funcignore"] = "local.settings.json\n*.user\n*.suo\n.git*\n";
    files["src/IdentityResolver.cs"] = identityCode(config.security.context);
    files["src/DataverseQuery.cs"] = queryCode();
    files["src/DataverseGateway.cs"] = gatewayCode();
    config.tools.forEach(tool => { files["src/Tools/" + className(tool.name) + ".cs"] = toolCode(tool); });
    files["tests/MightoraMcp.Tests.csproj"] = [
      '<Project Sdk="Microsoft.NET.Sdk">',
      "  <PropertyGroup>",
      "    <TargetFramework>net10.0</TargetFramework>",
      "    <IsPackable>false</IsPackable>",
      "    <Nullable>enable</Nullable>",
      "  </PropertyGroup>",
      "  <ItemGroup>",
      '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />',
      '    <PackageReference Include="xunit" Version="2.9.3" />',
      '    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.4" />',
      "  </ItemGroup>",
      '  <ItemGroup><ProjectReference Include="../src/MightoraMcp.csproj" /></ItemGroup>',
      "</Project>", ""
    ].join("\n");
    files["tests/QueryTests.cs"] = [
      "using MightoraMcp;",
      "using Xunit;",
      "namespace MightoraMcpTests;",
      "public class QueryTests",
      "{",
      "    [Fact]",
      "    public void Search_EscapesQuotesAndLimitsResults()",
      "    {",
      "        var query = DataverseQuery.Search([\"name\"], \"name\", \"O'Reilly\", 999);",
      "        Assert.Contains(\"%27%27\", query);",
      "        Assert.Contains(\"%24top\", Uri.EscapeDataString(query));",
      "        Assert.Contains(\"$top=100\", query);",
      "    }",
      "    [Fact]",
      "    public void Get_SelectsOnlyApprovedColumns()",
      "    {",
      "        var query = DataverseQuery.Get([\"name\", \"accountnumber\"], Guid.Parse(\"00000000-0000-0000-0000-000000000001\"));",
      "        Assert.Contains(\"$select=name%2Caccountnumber\", query);",
      "    }",
      "}", ""
    ].join("\n");
    files["README.md"] = generatedReadme(config);
    files["DEPLOYMENT.md"] = deploymentGuide(config);
    files["TESTING.md"] = testingGuide(config);
    files["SECURITY.md"] = securityGuide(config);
    files["infra/README.md"] = infrastructureGuide(config);
    files["infra/main.bicep"] = bicepTemplate(config.security.context);
    files[".gitignore"] = ["**/bin/", "**/obj/", "src/local.settings.json", ".vs/", "*.user", ".DS_Store"].join("\n") + "\n";
    files[".github/workflows/deploy.yml"] = githubPipeline();
    files["azure-pipelines.yml"] = azurePipeline();
    files[".github/CODEOWNERS"] = "# Replace with your organisation's code owners before enforcing reviews.\n";
    files["manifest.json"] = JSON.stringify({ generator: "Mightora MCP Builder", generatorVersion: VERSION, schemaVersion: config.schemaVersion, generatedAt: new Date().toISOString(), configuration: config }, null, 2) + "\n";
    return files;
  }

  function identityCode(mode) {
    return [
      "using Azure.Core;",
      "using Azure.Identity;",
      "using Microsoft.Azure.Functions.Worker.Extensions.Mcp;",
      "using System.Text;",
      "using System.Text.Json;",
      "namespace MightoraMcp;",
      "",
      "public static class IdentityResolver",
      "{",
      "    public static TokenCredential ForCall(ToolInvocationContext context)",
      "    {",
      "        var mode = Environment.GetEnvironmentVariable(\"MCP_EXECUTION_CONTEXT\") ?? " + cs(mode) + ";",
      "        if (mode == \"application\")",
      "        {",
      "            var managedId = Environment.GetEnvironmentVariable(\"AZURE_CLIENT_ID\");",
      "            return string.IsNullOrWhiteSpace(managedId)",
      "                ? new DefaultAzureCredential()",
      "                : new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = managedId });",
      "        }",
      "        if (mode != \"delegated-user\") throw new InvalidOperationException(\"Unsupported execution context.\");",
      "        if (!context.TryGetHttpTransport(out var transport) || transport is null)",
      "            throw new InvalidOperationException(\"Delegated user mode requires authenticated HTTP transport.\");",
      "        string assertion = GetUserToken(transport);",
      "        string tenantId = GetTenantId(transport);",
      "        string appId = Environment.GetEnvironmentVariable(\"WEBSITE_AUTH_CLIENT_ID\")",
      "            ?? throw new InvalidOperationException(\"WEBSITE_AUTH_CLIENT_ID is missing.\");",
      "        string miId = Environment.GetEnvironmentVariable(\"OBO_ASSERTION_MANAGED_IDENTITY_CLIENT_ID\")",
      "            ?? throw new InvalidOperationException(\"OBO assertion identity is missing.\");",
      "        var mi = new ManagedIdentityCredential(miId);",
      "        return new OnBehalfOfCredential(tenantId, appId, async cancellationToken =>",
      "            (await mi.GetTokenAsync(new TokenRequestContext([\"api://AzureADTokenExchange/.default\"]), cancellationToken)).Token, assertion);",
      "    }",
      "",
      "    private static string GetUserToken(HttpTransport transport)",
      "    {",
      "        if (transport.Headers.TryGetValue(\"X-MS-TOKEN-AAD-ACCESS-TOKEN\", out var token) && !string.IsNullOrWhiteSpace(token)) return token;",
      "        if (transport.Headers.TryGetValue(\"Authorization\", out var header) && header.StartsWith(\"Bearer \", StringComparison.OrdinalIgnoreCase))",
      "            return header[7..];",
      "        throw new InvalidOperationException(\"An authenticated user token is required. Check MCP OAuth and token store.\");",
      "    }",
      "",
      "    private static string GetTenantId(HttpTransport transport)",
      "    {",
      "        if (!transport.Headers.TryGetValue(\"X-MS-CLIENT-PRINCIPAL\", out var raw))",
      "            throw new InvalidOperationException(\"Trusted App Service principal header missing.\");",
      "        using var json = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(raw)));",
      "        foreach (var claim in json.RootElement.GetProperty(\"claims\").EnumerateArray())",
      "        {",
      "            var type = claim.GetProperty(\"typ\").GetString();",
      "            if (type == \"tid\" || type == \"http://schemas.microsoft.com/identity/claims/tenantid\")",
      "                return claim.GetProperty(\"val\").GetString() ?? throw new InvalidOperationException(\"Tenant is null.\");",
      "        }",
      "        throw new InvalidOperationException(\"Tenant claim missing.\");",
      "    }",
      "}", ""
    ].join("\n");
  }

  function gatewayCode() {
    return [
      "using Azure.Core;",
      "using Microsoft.Azure.Functions.Worker.Extensions.Mcp;",
      "using System.Net.Http.Headers;",
      "namespace MightoraMcp;",
      "",
      "public sealed class DataverseGateway(HttpClient client)",
      "{",
      "    public Task<string> SearchAsync(ToolInvocationContext context, string entitySet, string[] fields, string searchField, string searchTerm, int maxRecords)",
      "    {",
      "        // Entity set, fields and search field come only from generated, fixed source code.",
      "        return SendAsync(context, entitySet + DataverseQuery.Search(fields, searchField, searchTerm, maxRecords));",
      "    }",
      "    public Task<string> GetAsync(ToolInvocationContext context, string entitySet, string[] fields, Guid id)",
      "        => SendAsync(context, entitySet + DataverseQuery.Get(fields, id));",
      "",
      "    private async Task<string> SendAsync(ToolInvocationContext context, string relative)",
      "    {",
      "        var baseUrl = Environment.GetEnvironmentVariable(\"DATAVERSE_URL\")",
      "            ?? throw new InvalidOperationException(\"DATAVERSE_URL is required.\");",
      "        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var root) || root.Scheme != Uri.UriSchemeHttps",
      "            || !string.IsNullOrEmpty(root.UserInfo) || !string.IsNullOrEmpty(root.Query) || !string.IsNullOrEmpty(root.Fragment))",
      "            throw new InvalidOperationException(\"DATAVERSE_URL must be a plain HTTPS environment URL.\");",
      "        var credential = IdentityResolver.ForCall(context);",
      "        var token = await credential.GetTokenAsync(new TokenRequestContext([baseUrl.TrimEnd('/') + \"/.default\"]));",
      "        using var request = new HttpRequestMessage(HttpMethod.Get, baseUrl.TrimEnd('/') + \"/api/data/v9.2/\" + relative);",
      "        request.Headers.Authorization = new AuthenticationHeaderValue(\"Bearer\", token.Token);",
      "        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(\"application/json\"));",
      "        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);",
      "        if (!response.IsSuccessStatusCode)",
      "            throw new HttpRequestException(\"Dataverse returned \" + (int)response.StatusCode + \". Check permissions, schema and service limits.\");",
      "        return await response.Content.ReadAsStringAsync();",
      "    }",
      "}", ""
    ].join("\n");
  }
  function queryCode() {
    return [
      "namespace MightoraMcp;",
      "public static class DataverseQuery",
      "{",
      "    // Identifiers are generated from validated design-time metadata, never model input.",
      "    public static string Search(string[] fields, string searchField, string searchTerm, int maxRecords)",
      "    {",
      "        var term = searchTerm.Replace(\"'\", \"''\");",
      "        var filter = \"contains(\" + searchField + \",'\" + term + \"')\";",
      "        return \"?$select=\" + Uri.EscapeDataString(string.Join(',', fields))",
      "            + \"&$filter=\" + Uri.EscapeDataString(filter) + \"&$top=\" + Math.Clamp(maxRecords, 1, 100);",
      "    }",
      "    public static string Get(string[] fields, Guid id)",
      "        => \"(\" + id + \")?$select=\" + Uri.EscapeDataString(string.Join(',', fields));",
      "}", ""
    ].join("\n");
  }

  function generatedReadme(c) {
    return [
      "# " + c.server.name,
      "", c.server.description, "",
      "Generated by Mightora MCP Builder v" + VERSION + ". This server exposes read-only, fixed-schema Dataverse tools through Azure Functions MCP bindings.",
      "",
      "## Quick start",
      "1. Install the .NET 10 SDK and Azure Functions Core Tools 4.5+.",
      "2. Copy src/local.settings.example.json to src/local.settings.json and set your development Dataverse URL.",
      "3. Sign in to Azure with an identity that has read privileges in your development Dataverse environment.",
      "4. Run dotnet restore src/MightoraMcp.csproj, then from src run func start.",
      "5. Use an MCP Inspector or supported client to list tools and run safe tests.",
      "6. Follow DEPLOYMENT.md and SECURITY.md before production use.",
      "",
      "## Tools",
      ...c.tools.map(t => "- " + t.name + " (" + t.operation + ", " + t.entitySet + "): " + t.description),
      "",
      "## Security",
      "- Inbound MCP OAuth is a required deployment setup step. The host starts with a system key requirement.",
      "- Do not disable the system key until App Service / MCP OAuth authentication is enforced.",
      "- Dataverse's table, row and column security still applies to the delegated user or configured application user.",
      "- Never commit credentials, local.settings.json, tokens or personal data.",
      "- Azure Functions and Dataverse configuration are different from the Mightora static builder.",
      "",
      "## Pipeline",
      "Selected provider: " + (c.delivery.provider === "github" ? "GitHub Actions" : "Azure DevOps") + ". Both templates are included; activate only your selected provider.",
      "Use feature branches, a protected main branch and separate environments.",
      "", "MIT licence applies to generated sample code.", ""
    ].join("\n");
  }
  function deploymentGuide(c) {
    return [
      "# Deployment and ALM guide", "",
      "## 1. Source control",
      "Create a private repository for this generated server if it contains proprietary schema.",
      "Commit the YAML and generated source. Use a protected main branch with PR reviews and required status checks.",
      "Edit the YAML in Mightora MCP Builder; regenerate and review changes on a feature branch.",
      "",
      "## 2. Azure infrastructure",
      "Create separate Function Apps for development, test and production. Use infra/main.bicep as an infrastructure starting point.",
      "Enable secure HTTPS, Application Insights and minimum necessary managed identities.",
      "Provision the app before invoking the pipeline. Check the supported Azure Functions hosting/runtime matrix.",
      "",
      "## 3. Inbound MCP OAuth",
      "The server intentionally starts with a required MCP extension system key.",
      "In the Azure portal configure built-in MCP authentication (App Service Authentication, preview) using Microsoft Entra ID.",
      "Allow only approved MCP client applications and tenant users; validate token audience and policy.",
      "Once the OAuth endpoint is confirmed, update host.json system.webhookAuthorizationLevel to Anonymous to eliminate key-only access, and redeploy.",
      "Do not treat an app-only Dataverse identity as permission for every MCP caller.",
      "",
      "## 4. Dataverse identity",
      c.security.context === "application"
        ? "Application mode: assign a managed identity to each Function App, create a corresponding Dataverse application user and grant a least-privilege read role. Set AZURE_CLIENT_ID for a user-assigned identity."
        : "Delegated mode: enable App Service auth token store, configure the server Entra registration with Dataverse delegated user_impersonation consent and an OBO federated assertion identity; set WEBSITE_AUTH_CLIENT_ID and OBO_ASSERTION_MANAGED_IDENTITY_CLIENT_ID. Verify actual OBO with a restricted user.",
      "Set DATAVERSE_URL per environment in protected Azure application settings; never in code.",
      "",
      "## 5. Pipeline credentials",
      c.delivery.provider === "github"
        ? "GitHub: create development/test/production Environments, configure required reviewers for production, and set AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID secrets plus AZURE_FUNCTIONAPP_NAME variable in each environment. Configure OIDC federated credentials with least-privilege Azure RBAC."
        : "Azure DevOps: create environment resources and production approval checks, set up one Azure Resource Manager workload-identity federation service connection per stage and configure the service connection names plus Function App names in pipeline variables. Approvals are not represented in YAML.",
      "Activate the matching generated pipeline only. Use protected branch policies.",
      "",
      "## 6. Deployment sequence",
      "Feature -> pull request build and tests -> main -> development -> test -> production approval -> production.",
      "Promote the same published build artefact. Test a rollback by redeploying the previous release.",
      "",
      "## 7. Connect an MCP client",
      "The Azure Functions MCP extension uses HTTPS Streamable HTTP at:",
      "https://YOUR_FUNCTION_APP.azurewebsites.net/runtime/webhooks/mcp",
      "Complete client-specific OAuth setup and run the security tests in TESTING.md.",
      "", "References:",
      "https://learn.microsoft.com/azure/azure-functions/functions-mcp-tutorial",
      "https://learn.microsoft.com/azure/app-service/configure-authentication-mcp",
      "https://learn.microsoft.com/entra/identity-platform/v2-oauth2-on-behalf-of-flow", ""
    ].join("\n");
  }
  function securityGuide(c) {
    return [
      "# Security review checklist", "",
      "- [ ] Inbound Entra OAuth enabled and tested; only approved clients/tenants allowed.",
      "- [ ] MCP system key not exposed in a URL, README or repository.",
      "- [ ] Token issued to MCP endpoint is exchanged for Dataverse token, never forwarded as-is.",
      "- [ ] Correct " + c.security.context + " identity confirmed in a development Dataverse environment.",
      "- [ ] Explicit per-tool field allowlists reviewed by data owner.",
      "- [ ] Dataverse application user / delegated user has only necessary privileges.",
      "- [ ] Restricted user gets 403 or limited records where expected.",
      "- [ ] Invalid inputs, large search terms, missing auth and wrong-audience tokens fail closed.",
      "- [ ] Sensitive Dataverse data is approved for the target AI client's processing location and retention policy.",
      "- [ ] Application Insights and diagnostic logs do not capture tokens or data payloads.",
      "- [ ] Production deployment requires reviewer approval.",
      "",
      "The generated server is read-only. Do not add write actions without a separate authenticated human approval design.",
      "The MCP client is a presentation/orchestration layer; Dataverse permissions and server policies form the security boundary.", ""
    ].join("\n");
  }
  function testingGuide(c) {
    return [
      "# Testing plan", "",
      "## Contract tests",
      "1. Build with dotnet build src/MightoraMcp.csproj.",
      "2. Start locally with func start in src. Do not use a production Dataverse URL.",
      "3. Connect a compatible MCP Inspector over Streamable HTTP and verify tools/list.",
      ...c.tools.map(t => "4. Invoke " + t.name + " with permitted inputs and verify only " + t.fields.join(", ") + " are returned."),
      "",
      "## Negative tests",
      "- Missing/expired/wrong-audience token must be rejected before any tool executes.",
      "- Nonexistent or unauthorised record must not reveal data.",
      "- Invalid recordId/searchTerm must be rejected.",
      "- Excluded Dataverse fields and unrelated tables must not be accessible.",
      "- Return sizes must respect maximumRecords; test throttling and Retry-After behaviour.",
      "- In delegated mode, compare two users with different record privileges.",
      "- In application mode, verify the app user lacks create/update/delete roles.",
      "",
      "## ALM acceptance",
      "PR validation succeeds, development and test deploy automatically, production requires approval.",
      "Verify deployment rollback and audit trail from environment to commit.", ""
    ].join("\n");
  }
  function infrastructureGuide() {
    return [
      "# Infrastructure", "",
      "main.bicep is an editable starting point for a Linux Azure Functions app. Validate against the target subscription, region and current runtime support before provisioning.",
      "For production enable Microsoft Entra MCP OAuth, managed identity, monitoring, network controls and separate environment values.",
      "Never put credentials into Bicep parameter files or the YAML project definition.", ""
    ].join("\n");
  }
  function bicepTemplate(mode) {
    return [
      "targetScope = 'resourceGroup'",
      "@description('Globally unique base name, lowercase letters and numbers only.')",
      "param baseName string",
      "@description('Azure region.')",
      "param location string = resourceGroup().location",
      "",
      "resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {",
      "  name: take(toLower(replace(baseName, '-', '')), 24)",
      "  location: location",
      "  sku: { name: 'Standard_LRS' }",
      "  kind: 'StorageV2'",
      "  properties: { minimumTlsVersion: 'TLS1_2' allowBlobPublicAccess: false }",
      "}",
      "resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {",
      "  name: '\${baseName}-plan'",
      "  location: location",
      "  kind: 'linux'",
      "  sku: { name: 'Y1' tier: 'Dynamic' }",
      "  properties: { reserved: true }",
      "}",
      "resource app 'Microsoft.Web/sites@2023-12-01' = {",
      "  name: baseName",
      "  location: location",
      "  kind: 'functionapp,linux'",
      "  identity: { type: 'SystemAssigned' }",
      "  properties: {",
      "    serverFarmId: plan.id",
      "    httpsOnly: true",
      "    siteConfig: {",
      "      linuxFxVersion: 'DOTNET-ISOLATED|10.0'",
      "      appSettings: [",
      "        { name: 'FUNCTIONS_EXTENSION_VERSION' value: '~4' }",
      "        { name: 'FUNCTIONS_WORKER_RUNTIME' value: 'dotnet-isolated' }",
      "        { name: 'AzureWebJobsStorage' value: 'DefaultEndpointsProtocol=https;AccountName=\${storage.name};AccountKey=\${storage.listKeys().keys[0].value};EndpointSuffix=\${environment().suffixes.storage}' }",
      "        { name: 'MCP_EXECUTION_CONTEXT' value: " + cs(mode).replaceAll('"', "'") + " }",
      "      ]",
      "    }",
      "  }",
      "}",
      "output functionAppName string = app.name",
      "output functionAppUrl string = 'https://\${app.properties.defaultHostName}/runtime/webhooks/mcp'", ""
    ].join("\n");
  }
  function githubPipeline() {
    return [
      "name: MCP server ALM",
      "on:",
      "  pull_request:",
      "    branches: [main]",
      "  push:",
      "    branches: [main]",
      "  workflow_dispatch:",
      "permissions:",
      "  contents: read",
      "  id-token: write",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-dotnet@v4",
      "        with:",
      "          dotnet-version: '10.0.x'",
      "      - run: dotnet publish src/MightoraMcp.csproj -c Release -o publish",
      "      - run: dotnet test tests/MightoraMcp.Tests.csproj -c Release",
      "      - uses: actions/upload-artifact@v4",
      "        with:",
      "          name: mcp-server",
      "          path: publish",
      "  development:",
      "    if: github.event_name != 'pull_request'",
      "    needs: build",
      "    uses: ./.github/workflows/reusable-deploy.yml",
      "    with:",
      "      target: development",
      "    secrets: inherit",
      "  test:",
      "    needs: development",
      "    uses: ./.github/workflows/reusable-deploy.yml",
      "    with:",
      "      target: test",
      "    secrets: inherit",
      "  production:",
      "    needs: test",
      "    uses: ./.github/workflows/reusable-deploy.yml",
      "    with:",
      "      target: production",
      "    secrets: inherit", ""
    ].join("\n");
  }
  function githubReusable() {
    return [
      "name: Deploy MCP server",
      "on:",
      "  workflow_call:",
      "    inputs:",
      "      target:",
      "        required: true",
      "        type: string",
      "permissions:",
      "  contents: read",
      "  id-token: write",
      "jobs:",
      "  deploy:",
      "    runs-on: ubuntu-latest",
      "    environment: \${{ inputs.target }}",
      "    steps:",
      "      - uses: actions/download-artifact@v4",
      "        with:",
      "          name: mcp-server",
      "          path: publish",
      "      - uses: azure/login@v3",
      "        with:",
      "          client-id: \${{ secrets.AZURE_CLIENT_ID }}",
      "          tenant-id: \${{ secrets.AZURE_TENANT_ID }}",
      "          subscription-id: \${{ secrets.AZURE_SUBSCRIPTION_ID }}",
      "      - uses: Azure/functions-action@v1",
      "        with:",
      "          app-name: \${{ vars.AZURE_FUNCTIONAPP_NAME }}",
      "          package: publish", ""
    ].join("\n");
  }
  function azurePipeline() {
    return [
      "trigger:",
      "  branches:",
      "    include: [main]",
      "pr:",
      "  branches:",
      "    include: [main]",
      "pool:",
      "  vmImage: ubuntu-latest",
      "stages:",
      "- stage: Build",
      "  jobs:",
      "  - job: Compile",
      "    steps:",
      "    - task: UseDotNet@2",
      "      inputs:",
      "        version: '10.0.x'",
      "    - script: dotnet publish src/MightoraMcp.csproj -c Release -o $(Build.ArtifactStagingDirectory)/publish",
      "    - script: dotnet test tests/MightoraMcp.Tests.csproj -c Release",
      "    - publish: $(Build.ArtifactStagingDirectory)/publish",
      "      artifact: mcp-server",
      "- stage: Development",
      "  dependsOn: Build",
      "  condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))",
      "  jobs:",
      "  - deployment: Dev",
      "    environment: development",
      "    strategy:",
      "      runOnce:",
      "        deploy:",
      "          steps:",
      "          - task: AzureFunctionApp@2",
      "            inputs:",
      "              azureSubscription: 'mcp-development-wif'",
      "              appType: functionAppLinux",
      "              appName: $(functionAppNameDev)",
      "              package: $(Pipeline.Workspace)/mcp-server",
      "- stage: Test",
      "  dependsOn: Development",
      "  jobs:",
      "  - deployment: Test",
      "    environment: test",
      "    strategy:",
      "      runOnce:",
      "        deploy:",
      "          steps:",
      "          - task: AzureFunctionApp@2",
      "            inputs:",
      "              azureSubscription: 'mcp-test-wif'",
      "              appType: functionAppLinux",
      "              appName: $(functionAppNameTest)",
      "              package: $(Pipeline.Workspace)/mcp-server",
      "- stage: Production",
      "  dependsOn: Test",
      "  jobs:",
      "  - deployment: Production",
      "    environment: production",
      "    strategy:",
      "      runOnce:",
      "        deploy:",
      "          steps:",
      "          - task: AzureFunctionApp@2",
      "            inputs:",
      "              azureSubscription: 'mcp-production-wif'",
      "              appType: functionAppLinux",
      "              appName: $(functionAppNameProd)",
      "              package: $(Pipeline.Workspace)/mcp-server", ""
    ].join("\n");
  }

  // Complete the required reusable workflow and licence in one place.
  const mainProjectFiles = projectFiles;
  function completeProjectFiles(config) {
    const files = mainProjectFiles(config);
    files[".github/workflows/reusable-deploy.yml"] = githubReusable();
    files["LICENSE"] = "MIT License\n\nCopyright (c) 2026 Mightora / Ian Tweedie\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the Software), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of this notice.\n\nTHE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.\n";
    return files;
  }
  root.MCP = { VERSION, example, validate, toYaml, fromYaml, projectFiles: completeProjectFiles, className };
})(globalThis);
