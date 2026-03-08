# Project Context For AI

## Repo Identity

- Name: MyToolBox (historically reverse-proxy-extension)
- Type: VSCode extension
- Goal: Manage SSH reverse tunnel from local VSCode

## Product Boundaries

- Current scope is one tool: `ReverseTunnel`
- UI is integrated in Activity Bar container `ToolBox`
- Primary controls live in sidebar tree view

## Runtime Constraints

- Must run only in local UI extension host (`extensionKind: ["ui"]`)
- Should not run in remote VSCode Server session
- Depends on local `ssh` command availability

## Current UX Contract

- Status bar: status display + click to show status
- Sidebar group: `ReverseTunnel`
- Sidebar actions:
  - `ReverseTun: OFF/ON/CONNECTING...` toggle
  - `Open Logs`
  - `Settings`

## Config Contract

- VSCode setting: `reverseProxy.configFile`
- JSON shape:
  - root object
  - `ReverseTunnel` object with runtime fields
- `Settings` workflow can create `configs.json` if missing

## Testing Contract

- Integration tests under `test/suite/extension.test.ts`
- Includes sidebar-item behavior and settings helper behavior

## Packaging Contract

- Default expectation: package VSIX after code changes (unless explicitly exempted)
- Output directory: `release-artifacts/`

## Known Risks

- ssh process lifecycle and edge-case cleanup
- timing-dependent connection state transitions
- environment permission/lock issues during build/package on Windows
