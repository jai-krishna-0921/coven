# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.1] — 2026-07-16

### Added
- **Gemini provider.** New `gemini/*` model refs (e.g. `gemini/gemini-2.5-flash`)
  reach Google's OpenAI-compat surface using `GEMINI_API_KEY`. The five common
  models — `2.5 pro`, `2.5 flash`, `2.5 flash-lite`, `2.0 flash`, `2.0 flash-lite` —
  are in the fallback catalog so `coven models gemini` and the model picker work
  out of the box.
- **Sidebar panels are live** — the `Todo`, `LSP`, and `MCP` panels no longer
  say "— later". Todo shows N-done/N-total plus each task with a
  `[x]`/`[~]`/`[ ]` mark, colour-coded by status. LSP lists each server with a
  state dot and diagnostics count. MCP lists each server with a state dot and
  tool count.
- **Footer diagnostics** — the hardcoded "no diagnostics" now flips to
  `N diag` (in the warning colour) when any file has real LSP diagnostics.

### Fixed
- **Permanent 429s fail fast.** A `RESOURCE_EXHAUSTED` / "quota exceeded" /
  "billing" 429 no longer triggers exponential-backoff retries — it fails
  immediately (~1s instead of ~8s of wasted wait) with a clean one-line
  message. Real rate-limit 429s (with `Retry-After` or no permanent signal)
  still retry as before.
- **CLI error UX** — known named errors (`ProviderError`, `PermissionError`,
  `ConfigError`, `CatalogError`) print just the message, not a stack; genuine
  bugs still show the full stack. Provider error bodies are summarised to their
  first `message` field (walks OpenAI-style `{"error":{"message":…}}` and
  Google-style array-wrapped shapes) instead of dumping 500 chars of JSON.

## [0.4.0] — 2026-07-14

### Added
- **MCP client.** Connect external Model Context Protocol servers and use their
  tools. Config `"mcp"` block per server — local **stdio** (`command`/`args`/`env`)
  or remote **HTTP/SSE** (`url`/`type`/`headers`). Each tool is bridged as
  `mcp__<server>__<tool>`, permission-gated under `mcp`, presenting its real JSON
  Schema to the model. `coven mcp` lists connected servers and tools. A dead
  server surfaces as tool-error output, never a turn crash.
- **LSP integration.** Run language servers for semantic code understanding.
  Config `"lsp"` block per language (`command`/`args`/`extensions`). Adds four
  agent tools — `lsp_diagnostics`, `lsp_hover`, `lsp_definition`,
  `lsp_references` (1-based positions matching the read tool). `coven lsp` lists
  servers. Diagnostics stream in via `publishDiagnostics`.

### Fixed
- **Bash reliability.** Commands run in their own process group and are killed as
  a tree on timeout/abort — a backgrounded child (`cmd &`, a dev server) no
  longer holds the pipe and hangs the turn. Output is byte-capped (8 MB) so a
  runaway producer can't OOM the process.
- **Provider resilience.** The OpenAI-compat adapter retries transient failures
  (429/5xx/529) with backoff and enforces a connect + idle-stream timeout, so one
  overload no longer kills a turn and a hung local endpoint can't wedge it.
- **`ollama-cloud` connects** — it had no base URL and didn't read
  `OLLAMA_API_KEY`; BYOK now resolves env vars + stored keys through the auth layer.
- **Interrupt during a permission prompt** now cancels the pending ask instead of
  hanging the session forever.
- **Malformed `coven.json` degrades** to defaults (with a warning) instead of
  bricking every command; a single trailing comma is tolerated.
- **Crash guards:** read-only-HOME-safe logging and session persistence (atomic,
  self-disabling), isolated plugin event-hook rejections, a piper-TTS `error`
  listener, and a global unhandled-rejection / uncaught-exception net that
  restores the terminal.

### Security
- The **read tool** hard-refuses private keys / `.env` / `.ssh` / credentials
  before any permission check (no exfiltration even under `--yes`).
- **webfetch** blocks SSRF (loopback / RFC1918 / link-local incl. cloud metadata),
  re-validates every redirect hop, and caps the body at 5 MB.
- A hard **deny** in the permission ruleset can no longer be overridden by a
  plugin hook. Subagent dispatch depth is capped (fork-bomb guard).

## [0.3.1] — 2026-07-12

### Fixed
- **Typed slash commands now execute.** Pressing enter on a `/command` (e.g.
  `/theme-toggle`) ran the model instead of the command — the prompt is now routed
  through the command resolver first. In the autocomplete popover, **Tab** completes and
  **Enter** runs the highlighted command (files still just insert).
- **Themes actually apply.** The shell never painted a background, so a light theme only
  recoloured text (dark-on-dark, invisible) and `/theme-toggle` looked inert. The shell
  now paints `theme.bg`; dialogs and banners paint `theme.bgPanel`, so switching themes
  repaints the whole screen and light themes are usable.
- **Connectors are real.** `/login` and `/connectors` open a provider picker showing each
  provider's live auth state; keyed providers prompt for their key (env var named),
  **Ollama is shown as local & keyless** and jumps to the model picker. New `/model <ref>`
  sets any model ref directly (e.g. `ollama/llama3.2`) for locally-pulled models; the
  model picker marks keyless-local models as ready.
- **Transcript scrolling.** Scroll offset is per-message, but a page step passed a
  row-count, so one PgUp jumped straight to the top/bottom. Steps are now gradual;
  **shift+↑/↓** scroll a line for keyboards without PgUp, and the hidden-content hint names
  the keys.
- **Help is readable.** Fixed-width category column (no more wrapped "Getting started"
  desyncing rows), two-column detail with hanging-indent wrapping, and a scrollable detail
  pane (tab / ←→ switch category, ↑↓ scroll) — the Agents and Skills panes now show every
  entry with its full description.
- **Input affordance.** The empty prompt shows a placeholder telling you where and how to
  type; the active `provider/model` is shown in the Home splash, footer, and status.

## [0.3.0] — 2026-07-12

### Added
- **Full-screen TUI.** Coven now takes over the whole terminal in an alternate-screen
  application (built on Ink + React), the way OpenCode does. Four regions — header, a
  scrollable transcript body, a toggleable sidebar (`ctrl+b`), and a persistent status
  bar (`? help · context · cost · diagnostics · model`) — plus a single modal layer.
- **Home splash** for empty sessions: logo, an "Ask anything…" prompt, the
  `agent · model` line, and a hint row (`tab agents · ctrl+p commands · ? help`).
- **First-run onboarding wizard** (Coven-native): pick a theme (with live preview),
  accent, layout/density, glyph style (Nerd-Font icons vs ASCII, with best-effort
  Nerd-Font detection), and a connector (provider + API key). Re-run any time with
  `/onboarding`. Preferences persist to `~/.local/share/coven/tui.json`.
- **Command palette** (`ctrl+p` / `ctrl+k`): a fuzzy, categorized list of every command
  with its keybinding, driven by the same catalog as slash commands.
- **Inline slash-command autocomplete** in the prompt: type `/` for the full list, `/r`
  to narrow to commands starting with `r`, `/re` to narrow further — prefix-first, then
  fuzzy. `@` completes workspace files (secret files excluded).
- **Interactive Help** (`?` / `f1`): a searchable two-pane guide (shortcuts, commands,
  agents, skills, permissions, getting started), plus a which-key cheatsheet.
- **Dialogs**: session switcher (`ctrl+s`), model picker (`ctrl+o`, grouped by provider
  with context window + pricing and a ✓ on providers you have a key for), agent picker
  (`ctrl+g`), theme picker (`ctrl+t`, live preview), skills browser, a permission prompt,
  status view, and generic confirm/prompt.
- **7 themes**: Coven Dark (default), Coven Light, Catppuccin Mocha, Tokyo Night,
  Gruvbox Dark, Dracula, Nord.
- **Live model & agent switching** persisted per session (`engine.setModel`/`setAgent`),
  plus a per-turn override for command-scoped agents/models.
- A **connector-missing banner** that guides new users to set a key before their first
  turn.

### Changed
- The prompt editor is now a full multi-line input with a real cursor, history, `@file`
  attachments, `!cmd` shell escape, and the autocomplete popover.
- Non-TTY / piped usage falls back to a minimal line REPL; `coven run -p` is unchanged.
- Two runtime dependencies added deliberately for the TUI: `ink` (terminal React
  reconciler) + `react` (its peer), and `fuzzysort` (zero-dependency fuzzy matcher for
  the palette/autocomplete). The Node bundle externalizes them; they install normally.

### Removed
- The old line-based REPL renderer (`tui/render.ts`, `tui/input.ts`).

## [0.2.0] — 2026-07-09

### Added
- **Context management**: DCP-style pruning of stale tool outputs (40k-token protected
  recency budget, 20k hysteresis, render-time masks), automatic rolling anchored-summary
  compaction on overflow, `/compact` command, live context % in the status line.
- **BYOK + model catalog**: `coven auth login|list|logout`, credentials in
  `~/.local/share/coven/auth.json` (0600); live model catalog from models.dev with 24h
  cache and built-in offline fallback; `/models` picker and `coven models`; real cost
  tracking per session from catalog pricing.
- **Voice (TTS)**: `/voice` — auto-detected backends (OpenAI `gpt-4o-mini-tts`, macOS
  `say`, Linux piper/spd-say/espeak-ng, Windows PowerShell SAPI), sentence-chunked queue,
  interrupt-safe.
- **Slash command system**: registry with builtin `/init` (AGENTS.md generator) and
  `/review`; custom markdown commands in `.coven/commands/` with `$ARGUMENTS`/`$1..$N`,
  `` !`cmd` `` shell injection, and `@file` attachments (OpenCode-compatible semantics).
- **TUI overhaul**: persisted input history, tab completion, multi-line input (`\` or
  fences), `!cmd` shell escape, `@file` attachments, tool timing lines, edit diff
  previews, cost/context status line, double-ctrl+c exit, `/status`, `/export`, `/resume`.
- **Parallel execution**: read-only tool calls run in concurrent waves; consecutive
  `task` calls dispatch subagents in parallel; permission asks serialize cleanly.
- **Prompt caching**: rolling cache breakpoint on the last message block (Anthropic),
  0.1× input pricing on history re-reads.
- **Skills**: enriched to Superpowers depth (rationalization tables, red flags, gate
  functions, support files) + three new skills: dispatching-parallel-agents,
  finishing-a-branch, using-git-worktrees.

### Changed
- Node-compatible build: all Bun-specific APIs replaced with node stdlib; published to npm
  as `thecoven` with a `coven` binary that runs under Node ≥ 20.
- Published as `thecoven` (the `coven` and `coven-cli` names were unavailable on npm); the
  installed command is still `coven`. Version 0.2.0.

## [0.1.0] — 2026-07-09

Initial release: 11-agent roster, skills with progressive disclosure, permission engine,
plugin hooks, Anthropic + OpenAI-compatible providers, streaming REPL.
