# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
