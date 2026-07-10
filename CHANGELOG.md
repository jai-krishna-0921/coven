# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
