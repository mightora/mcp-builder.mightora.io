# Mightora MCP Builder

Design, secure and deploy custom Dataverse MCP servers from a visual, local-first builder.

**Website:** https://mcp-builder.mightora.io

The website is a static GitHub Pages app. It does not contact or store Dataverse
credentials, and it does not deploy anything into a visitor's Azure subscription.
Visitors define narrow, read-only MCP tools, choose the identity model and
deployment platform, then export a YAML definition and Azure Functions project.

## Local development

Requirements: Node.js 20 or later. No npm dependencies are required.

~~~sh
npm test
npm run build
~~~

Serve the generated dist directory with any static file server. Open
dist/downloads/mcp-builder-offline.html directly from disk for the offline
edition. It has no external dependencies or application network requests.

## Capabilities

- Local visual editor with multiple Dataverse tables and read-only MCP tools.
- User-delegated OBO or application identity configuration.
- YAML and JSON import/export, local autosave and example configuration.
- Browser-generated ZIP containing a .NET 10 Azure Functions MCP server,
  fixed-schema Dataverse queries, separate GitHub Actions and Azure Pipelines
  definitions, ARM/Bicep infrastructure guidance and deployment documentation.
- Branch-based Dev/Test/Production deployment guidance.
- Architecture, permissions, deployment and testing walkthroughs.

## Security boundaries

The generated server uses Dataverse security, explicit field allowlists and
maximum record limits. MCP endpoint authentication must be enabled in Azure.
Read-only tools are intentional in this first release. Application access uses
the Dataverse application user's privileges; delegated access requires a valid
Entra OBO setup. Do not deploy a generated service without completing the
identity checklist and testing access with a restricted account.

The YAML is a Mightora project format, not an official MCP standard.
No secrets belong in YAML or source control.

## Quality and privacy

GitHub Actions runs automated tests, builds the site and produces an offline
edition. CodeQL runs separately. Badges link to real evidence and are not
security certifications.

The app uses browser localStorage to save the project on the visitor's device.
The online edition loads the official Mightora shared UI from a CDN.
The offline edition bundles all required assets and does not load a CDN.
No configured table metadata is transmitted to Mightora.

## Licence

MIT. Contributions and independently verifiable security reviews are welcome.
