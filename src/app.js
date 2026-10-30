(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const key = "mightora-mcp-builder:v1";
  let project = loadProject();
  let step = 0;
  let toastTimer;

  function loadProject() {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const config = JSON.parse(raw);
        if (MCP.validate(config).filter(x => x.type === "error").length === 0) return config;
      }
    } catch (_) { /* Restricted storage may be unavailable. */ }
    return MCP.example();
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(project));
      $("#saveState").textContent = "Saved locally";
    } catch (_) {
      $("#saveState").textContent = "Local save unavailable";
    }
  }
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3800);
  }
  function updateHeaderOffset() {
    const height = $("#brandHeader")?.getBoundingClientRect().height || 68;
    const nav = $(".quick-jump-nav")?.getBoundingClientRect().height || 43;
    document.documentElement.style.setProperty("--header-height", height + "px");
    document.documentElement.style.setProperty("--sticky-height", (height + nav) + "px");
  }
  function updatePreview() {
    const yaml = MCP.toYaml(project);
    $("#yamlOutput").textContent = yaml;
    const issues = MCP.validate(project);
    const errors = issues.filter(x => x.type === "error");
    $("#validationDot").classList.toggle("bad", Boolean(errors.length));
    $("#validationSummary").textContent = errors.length ? errors.length + " issue" + (errors.length === 1 ? "" : "s") + " to resolve" : "Definition valid · " + project.tools.length + " read-only tools";
    $("#summaryTools").textContent = project.tools.length;
    $("#summaryIdentity").textContent = project.security.context === "application" ? "Application" : "Delegated user";
    $("#summaryProvider").textContent = project.delivery.provider === "github" ? "GitHub" : "Azure DevOps";
    $("#downloadProject").disabled = errors.length > 0;
    $("#downloadYaml").disabled = errors.length > 0;
    const report = $("#validationReport");
    report.classList.toggle("good", !errors.length);
    report.textContent = errors.length
      ? errors.map(x => x.path + ": " + x.message).join(" · ")
      : "✓ Configuration is structurally valid. Live Azure and Dataverse permissions must still be tested.";
    save();
  }
  function renderForm() {
    $("#serverName").value = project.server.name;
    $("#serverVersion").value = project.server.version;
    $("#serverDescription").value = project.server.description;
    $$('input[name="identity"]').forEach(radio => { radio.checked = radio.value === project.security.context; });
    $$('input[name="provider"]').forEach(radio => { radio.checked = radio.value === project.delivery.provider; });
    $("#identityExplanation").innerHTML = project.security.context === "application"
      ? "<strong>Application identity:</strong> Each Azure Function uses a dedicated managed identity associated with a Dataverse application user. Grant only the required security roles. The MCP endpoint still authenticates each caller separately."
      : "<strong>Delegated user:</strong> The AI client signs in to the MCP endpoint with Entra OAuth. The Function exchanges the user's token for a Dataverse token through OBO. The generated guide covers consent, federation and token-store configuration.";
    renderTools();
    updatePreview();
  }
  function renderTools() {
    const container = $("#toolCards");
    container.innerHTML = project.tools.map((tool, index) => [
      '<article class="tool-card" data-tool-card="' + index + '">',
      '<header><div><strong>Tool ' + (index + 1) + ': ' + escape(tool.name) + '</strong><span class="tag">READ ONLY</span></div>',
      '<button type="button" class="delete-tool" data-remove-tool="' + index + '" aria-label="Remove ' + escape(tool.name) + '">Remove</button></header>',
      '<div class="tool-fields">',
      toolInput(index, "name", "Tool name", tool.name, "Names use lowercase_snake_case", "text"),
      '<label>Operation <select data-tool-index="' + index + '" data-tool-field="operation"><option value="search"' + (tool.operation === "search" ? " selected" : "") + '>Search records</option><option value="get"' + (tool.operation === "get" ? " selected" : "") + '>Get record by ID</option></select></label>',
      '<div class="full">' + toolInput(index, "description", "Description for the AI", tool.description, "", "text") + '</div>',
      toolInput(index, "table", "Table logical name", tool.table, "Example: account", "text"),
      toolInput(index, "entitySet", "Entity set name", tool.entitySet, "Example: accounts", "text"),
      '<div class="full">' + toolInput(index, "fields", "Allowed fields (comma separated)", tool.fields.join(", "), "Only these fields are requested from Dataverse.", "text") + '</div>',
      tool.operation === "search" ? toolInput(index, "searchField", "String field to search", tool.searchField, "Must be one of the allowed fields", "text") : "",
      toolInput(index, "maxRecords", "Maximum records", String(tool.maxRecords), "1–100", "number"),
      "</div></article>"
    ].join("")).join("");
  }
  function toolInput(index, field, label, value, hint, type) {
    const max = type === "number" ? ' min="1" max="100"' : ' maxlength="350"';
    return '<label>' + escape(label) + (hint ? "<small>" + escape(hint) + "</small>" : "") +
      '<input type="' + type + '" value="' + escape(value) + '" data-tool-index="' + index + '" data-tool-field="' + escape(field) + '"' + max + '></label>';
  }
  function setStep(next) {
    step = Math.max(0, Math.min(4, next));
    $$(".step-button").forEach(button => {
      const selected = Number(button.dataset.step) === step;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-current", selected ? "step" : "false");
    });
    $$(".editor-step").forEach(panel => { panel.hidden = Number(panel.dataset.panel) !== step; });
    $("#stepLabel").textContent = "STEP 0" + (step + 1) + " OF 05";
    $("#previousStep").disabled = step === 0;
    $("#nextStep").textContent = step === 4 ? "Start over ↺" : "Continue →";
    updatePreview();
  }
  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }
  function asText(filename, content, mime) {
    download(filename, new Blob([content], { type: mime || "text/plain;charset=utf-8" }));
  }
  function guardExport() {
    const errors = MCP.validate(project).filter(x => x.type === "error");
    if (errors.length) { toast("Resolve the definition issues before exporting."); setStep(4); return false; }
    return true;
  }
  async function copyYaml() {
    const value = MCP.toYaml(project);
    try {
      await navigator.clipboard.writeText(value);
      toast("YAML copied to clipboard.");
    } catch (_) {
      const temp = document.createElement("textarea");
      temp.value = value;
      document.body.append(temp);
      temp.select();
      const ok = document.execCommand("copy");
      temp.remove();
      toast(ok ? "YAML copied." : "Copy was blocked. Select the YAML in the preview instead.");
    }
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 250000) { toast("Choose a definition smaller than 250 KB."); return; }
    try {
      const content = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json") ? JSON.parse(content) : MCP.fromYaml(content);
      const errors = MCP.validate(parsed).filter(x => x.type === "error");
      if (errors.length) throw new Error(errors[0].path + ": " + errors[0].message);
      project = parsed;
      renderForm();
      setStep(0);
      toast("Definition imported and saved locally.");
    } catch (error) { toast("Could not import: " + String(error.message).slice(0, 160)); }
  }

  $("#serverName").addEventListener("input", event => { project.server.name = event.target.value.trim(); updatePreview(); });
  $("#serverVersion").addEventListener("input", event => { project.server.version = event.target.value.trim(); updatePreview(); });
  $("#serverDescription").addEventListener("input", event => { project.server.description = event.target.value; updatePreview(); });
  $$('input[name="identity"]').forEach(r => r.addEventListener("change", event => { if (event.target.checked) { project.security.context = event.target.value; renderForm(); } }));
  $$('input[name="provider"]').forEach(r => r.addEventListener("change", event => { if (event.target.checked) { project.delivery.provider = event.target.value; renderForm(); } }));
  $("#toolCards").addEventListener("input", event => {
    const el = event.target.closest("[data-tool-field]");
    if (!el) return;
    const index = Number(el.dataset.toolIndex);
    const field = el.dataset.toolField;
    if (!project.tools[index]) return;
    let value = el.value;
    if (field === "fields") value = value.split(",").map(x => x.trim()).filter(Boolean);
    if (field === "maxRecords") value = Number(value);
    project.tools[index][field] = value;
    updatePreview();
  });
  $("#toolCards").addEventListener("change", event => {
    if (event.target.dataset.toolField === "operation") {
      const index = Number(event.target.dataset.toolIndex);
      const tool = project.tools[index];
      tool.operation = event.target.value;
      tool.maxRecords = tool.operation === "get" ? 1 : 25;
      renderTools();
      updatePreview();
    }
  });
  $("#toolCards").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-tool]");
    if (!button) return;
    project.tools.splice(Number(button.dataset.removeTool), 1);
    renderTools();
    updatePreview();
  });
  $("#addTool").addEventListener("click", () => {
    if (project.tools.length >= 30) { toast("A project supports a maximum of 30 tools."); return; }
    let n = project.tools.length + 1;
    while (project.tools.some(t => t.name === "lookup_" + n)) n++;
    project.tools.push({ name: "lookup_" + n, description: "Read approved records from Dataverse", operation: "search", table: "account", entitySet: "accounts", fields: ["name"], searchField: "name", maxRecords: 25 });
    renderTools();
    updatePreview();
  });
  $$(".step-button").forEach(button => button.addEventListener("click", () => setStep(Number(button.dataset.step))));
  $("#previousStep").addEventListener("click", () => setStep(step - 1));
  $("#nextStep").addEventListener("click", () => setStep(step === 4 ? 0 : step + 1));
  $("#loadExample").addEventListener("click", () => { project = MCP.example(); renderForm(); setStep(0); toast("Example loaded."); });
  $("#resetProject").addEventListener("click", () => {
    if (!confirm("Reset this local project to the default example? Export your current YAML first if you want to keep it.")) return;
    project = MCP.example();
    renderForm();
    setStep(0);
    toast("Project reset.");
  });
  $("#importButton").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async event => { await importFile(event.target.files?.[0]); event.target.value = ""; });
  $("#copyYaml").addEventListener("click", copyYaml);
  $("#downloadYaml").addEventListener("click", () => {
    if (guardExport()) { asText("mcp-server.yaml", MCP.toYaml(project), "application/yaml"); toast("YAML downloaded."); }
  });
  $("#downloadJson").addEventListener("click", () => asText("mcp-server.json", JSON.stringify(project, null, 2) + "\n", "application/json"));
  $("#downloadProject").addEventListener("click", () => {
    if (!guardExport()) return;
    try {
      const files = MCP.projectFiles(project);
      const zip = MCPZip.createZip(files);
      download(project.server.name + "-azure-functions.zip", zip);
      toast(Object.keys(files).length + " source and deployment files packaged.");
    } catch (error) { toast("Project generation failed: " + error.message); }
  });
  $("#showNetwork").addEventListener("click", () => {
    const urls = performance.getEntriesByType("resource").map(entry => {
      try { return new URL(entry.name).origin; } catch (_) { return "(local)"; }
    });
    const unique = [...new Set(urls)].sort();
    $("#networkReport").textContent = unique.length ? unique.join("\n") : "No resource domains observed by the Performance API. Check F12 Network for a complete view.";
  });
  const resize = new ResizeObserver(updateHeaderOffset);
  resize.observe($("#brandHeader"));
  resize.observe($(".quick-jump-nav"));
  updateHeaderOffset();
  renderForm();
  setStep(0);
})();
