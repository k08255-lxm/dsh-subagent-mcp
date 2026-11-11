# Codex desktop compatibility (experimental)

The desktop profile uses standard MCP over stdio. It deliberately does not use
Codex CLI's App Server callback protocol, assume `CODEX_THREAD_ID`, start a
Codex model task, or read Codex session storage. DSH retains its normal runtime,
permissions and provider billing. This is an MCP integration, not a native
Codex subagent panel. It cannot wake an idle desktop conversation automatically.

## Configure an existing bridge installation

Use this modified checkout with Node.js 24+ and installed npm dependencies.
The DSH background service must run the same modified code. An old daemon will
not understand the desktop profile. Finish active tasks before upgrading it.
Ordinary setup remains unchanged and may install Codex CLI dependencies; this
experimental profile is not a replacement dependency/service installer.

From a persistent checkout on the desktop host, run:

```sh
node src/cli.mjs desktop-config
```

This only prints a TOML snippet, using absolute Node and package paths so GUI
PATH differences do not break launch. Review it and replace the existing
`[mcp_servers.dsh_subagent]` table in the Codex configuration used by the app.
Do not append a duplicate table. Do not copy paths printed on another computer.
A custom bridge state/config location must be supplied through the MCP entry's
`env` table (`DSH_SUBAGENT_STATE` and `DSH_SUBAGENT_CONFIG`) as needed. No API
keys are printed or required in this snippet. Keep credentials in the existing
DSH provider configuration. Refresh the app's MCP connection / start a fresh
conversation after installing the changed service and configuration.

The snippet launches `mcp --desktop`. Each connection selects its profile during
MCP initialization. Other clients retain the original callback tools and behavior.
The desktop profile omits `dsh_watch` and `dsh_unwatch`, including their executable
handlers, and advertises the correct wait workflow in server/tool instructions.
Use the companion skill from this version, which recognizes the desktop profile.

## Try it

Ask the desktop app to use DSH with `permission: read-only` and an explicit
absolute project `cwd` to identify entry points and test commands. Keep the
returned agent ID. Do independent work, then call `dsh_wait` without `seconds`.
The result returns through the same MCP call. Check its status, finish reason,
and evidence before accepting it. Use `dsh_followup` with the same ID for related
work; use `dsh_interrupt` when the user stops it.

The generated config sets a one-hour tool timeout, not an infinite client wait.
If the client times out, closes or cancels a wait, do not repeat `dsh_start`:
DSH may still be running. Reconnect and retrieve the same agent with `dsh_wait`.
Stopping the DSH task requires an explicit `dsh_interrupt`.

## Validation scope

Automated tests use fake runtimes and local MCP clients. They check profile
selection over the real stdio proxy/daemon transport, hidden callback tools,
standard settled-result delivery, path quoting, and unchanged CLI mode.
They do not invoke a real Codex model, DeepSeek API, or desktop app. Passing
these tests is not desktop end-to-end validation. The app version, MCP timeout
handling, real DSH execution and UI behavior still need an authorized desktop
smoke test. Native idle wakeup remains unsupported by this profile.

## DSH desktop runtime configuration

The bundled compatibility overlay targets DSH desktop 0.2.2-rc.1. Internal
package layout and preset IDs are version-sensitive; this does not promise
compatibility with later desktop releases. Use Node.js 24 or newer.

The desktop executable path is explicitly supplied through
`DSH_DESKTOP_EXECUTABLE`. The service uses that executable with
`ELECTRON_RUN_AS_NODE=1` and its packaged CLI instead of extracting app files.
Provide a dedicated `DSH_HOME` containing a `codex-subagent` profile composed of
`@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-sdk-app` with startup patch reload.
Use private bridge configuration/state directories, and supply their paths as
`DSH_SUBAGENT_CONFIG` and `DSH_SUBAGENT_STATE` to both service and MCP client.
These are deployment requirements, not an automatic desktop installer.

Optional `DSH_DESKTOP_PROVIDER_CONFIG` selects a local provider-declaration
file. Keep this file outside the repository and use environment-variable key
references. The loader rejects common inline credential fields and executable
expressions; it is not a general-purpose secret scanner. Optional
`DSH_DEFAULT_PROVIDER`, `DSH_DEFAULT_MODEL` and `DSH_DEFAULT_EFFORT` select local
defaults. No user's provider names, endpoints, keys or account settings ship
with this compatibility patch.

Desktop mode defaults to the exact project `cwd` supplied by the caller.
Agents and follow-ups share that working tree. Concurrent writers can conflict;
coordinate edits and do not describe this as workspace isolation. The optional
worktree helper is retained for explicit programmatic configuration and tests,
but is not enabled by the desktop default. Filesystem permissions still apply.

## Experimental queue and Windows proxy changes

The CLI queue adapter validates an exact parent UUID, records intent before
sending, and refuses automatic retries after an ambiguous outcome. Its command
and acknowledgement handling have mock coverage only. A queue acknowledgement
means stored, not consumed or model-completed. Neither queue delivery nor idle
conversation wakeup has been verified end to end in the desktop app. This
profile continues to hide `dsh_watch` and `dsh_unwatch`.

Windows callbacks with an explicitly supplied Unix socket use the official
App Server proxy. Tests check argument preservation and teardown with fake
transports. This does not create a daemon, discover a private endpoint or
change the desktop's server ownership.

## Publication and verification boundaries

This patch excludes machine-specific deployment and repair scripts, installed
configuration, credentials, histories, backup files and local status reports.
The compatibility source matches the tested installation, but packaging alone
is not a clean-install or cross-platform test. Validate a separate installation
before distributing it as a supported release. Do not run live tests without
permission to invoke the configured model and provider.

A separate installed-runtime smoke test completed one minimal, read-only task
through a direct MCP client and the configured provider, returning the exact
expected answer with no tool events. The supplied scratch working directory
was preserved and remained empty. This was not initiated from the Codex UI;
current Codex UI integration and idle wakeup remain unverified. Shared-workspace
logic also has mocked regression coverage. No clean-install test of this
publication package has been performed.

The publication source was additionally checked with the standard no-model
suite using existing installed dependencies in a separate verification tree:
128 tests, 124 passed, 4 opt-in installation/runtime tests skipped, 0 failures.
No dependency installation or live-model test was performed for that suite.
The desktop preset overlay's [provenance](../assets/desktop-0.2/PROVENANCE.md)
and full [DeepSeek MIT notice](../assets/desktop-0.2/LICENSE) accompany it.

A subsequent fresh upstream checkout with this patch passed
`npm ci --ignore-scripts --no-audit --no-fund` and the same no-model
`npm test` suite on Windows with Node.js 24.13.0: 124 passed, 4 skipped,
0 failed. This verifies dependency installation, not the bridge installer,
service setup, Codex UI, or a fresh live-model deployment.
