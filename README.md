<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">A coven of coding agents in your terminal.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/thecoven"><img alt="npm" src="https://img.shields.io/npm/v/thecoven?style=flat-square&color=c026d3&label=thecoven"></a>
  <a href="https://www.npmjs.com/package/thecoven"><img alt="downloads" src="https://img.shields.io/npm/dm/thecoven?style=flat-square&color=a21caf"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/thecoven?style=flat-square&color=7c3aed"></a>
  <img alt="node" src="https://img.shields.io/node/v/thecoven?style=flat-square&color=6d28d9">
  <img alt="typescript" src="https://img.shields.io/badge/types-TypeScript-3178c6?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.hi.md">हिन्दी</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/demo.svg" alt="coven session" width="820">
</p>

---

Coven is a terminal-based AI coding assistant built around four ideas:

1. **Many agents, not one.** Eleven built-in specialists — a conductor that orchestrates, plus planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe, and guardian — each with its own charter, model, and permission leash. Subagents dispatch in parallel. Add your own with a markdown file.
2. **Skills over prompts.** Reusable methodology (TDD, systematic debugging, parallel dispatch, verification-before-completion) ships as on-demand skills with rationalization tables and red-flag lists — progressive disclosure, not system-prompt bloat.
3. **Guardrails as architecture.** Every tool call passes through a permission engine, a bash command scanner, symlink-safe path containment, and a doom-loop detector. Plugins can observe and veto everything.
4. **Context that manages itself.** Provider-reported token accounting, DCP-style pruning of stale tool outputs, and rolling anchored-summary compaction — long sessions stay sharp instead of dying at the context wall.

Built with [Bun](https://bun.sh) + TypeScript, ships as a Node ≥ 20 binary. Two runtime dependencies (`@anthropic-ai/sdk`, `zod`).

## Installation

```bash
npm install -g thecoven          # the binary is `coven`
# or
bun install -g thecoven
pnpm add -g thecoven
```

From source:

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

One-shot mode:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## Bring your own key

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

Any OpenAI-compatible endpoint works via config — `openai`, `groq`, `openrouter`, and `ollama` have built-in base URLs:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Context windows and pricing come from the catalog, so the status line shows real cost and context usage per session.

## The coven

| Agent | Mode | Charter |
|---|---|---|
| `conductor` | primary | Decomposes goals, dispatches specialists **in parallel**, integrates |
| `builder` | primary | Implementation, test-first (default) |
| `planner` | all | Approved design → bite-sized TDD task plan |
| `researcher` | subagent | Read-only reconnaissance with evidence |
| `debugger` | all | Four-phase root-cause debugging |
| `optimizer` | all | Measure → change one thing → measure |
| `reviewer` | subagent | Spec compliance + code quality, separate verdicts |
| `tester` | all | Behavior coverage and edge-case hunting |
| `architect` | subagent | Interface design and decision records |
| `scribe` | subagent | Docs verified against the source |
| `guardian` | subagent | Security audit: injection, traversal, leaks, bypasses |

Switch the primary agent with `/agent <name>`. Subagents are dispatched by agents via the `task` tool — each runs in an isolated child session with its own permission ruleset and reports back. Consecutive `task` calls in one turn run **concurrently**.

Custom agents are markdown files in `.coven/agents/`:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## In the session

| Command | Does |
|---|---|
| `/agents` · `/agent <name>` | list agents / switch primary agent |
| `/models [filter]` · `/model <ref>` | browse the catalog / set the model |
| `/auth login <provider>` | store an API key (BYOK) |
| `/skills` · `/tools` | list skills / tools |
| `/status` | session, context %, cost, voice |
| `/compact` | summarize older history to free context |
| `/voice [on\|off]` | toggle text-to-speech |
| `/init` | generate `AGENTS.md` for this repo |
| `/review [target]` | dispatch a code review |
| `/new` · `/sessions` · `/resume <n>` | session management |
| `/export [file]` | write the transcript to markdown |
| `!<cmd>` | run a shell command yourself |
| `@file` | attach a file to your prompt |

Multi-line input: end a line with `\` or open a ` ``` ` fence. Tab-completion for commands and agents; input history persists across sessions.

### Custom commands

Drop markdown in `.coven/commands/` — OpenCode-compatible semantics:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

`$ARGUMENTS` / `$1..$N` placeholders, `` !`cmd` `` shell injection (permission-gated), and `@file` attachments (containment- and secret-checked).

## Context management

- **Accounting** — provider-reported usage is ground truth; the status line shows live context % against the model's real window.
- **Pruning first** (cheap, no LLM call) — old tool outputs beyond a protected 40k-token recency budget are masked; the calls and args stay visible. Nothing is deleted; masks are render-time and reversible.
- **Compaction second** — at overflow the older turns are summarized into a rolling *anchored summary* by the small model, keeping the most recent turns verbatim. `/compact` triggers it manually.
- **Cache-friendly** — the message store is append-only; Anthropic prompt caching gets rolling breakpoints (0.1× input price on history re-reads).

## Voice

`/voice on` speaks assistant replies. Backends auto-detect in order: OpenAI TTS (`gpt-4o-mini-tts`, when `OPENAI_API_KEY` + a player exist) → macOS `say` → Linux `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI. Zero configuration, zero dependencies; `COVEN_TTS=off|say|espeak|…` overrides. Interrupting the session stops speech immediately.

## Permissions

Ordered rules, **last match wins** (baseline → agent → your config → session approvals):

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

Always on: bash command scanning (`rm -rf`, force-push, `curl | sh`, `sudo` always ask), symlink-resolved path containment, doom-loop detection, `.env` ask / key-material deny. Every ask is answered `once`, `always` (persists for the session), or `reject` — with feedback that goes straight back to the model.

## Plugins

```ts
// .coven/plugins/my-plugin.ts
export default function myPlugin({ root, config, subscribe }) {
  return {
    "tool.execute.before": async (meta, output) => { /* mutate output.args */ },
    "permission.ask":      async (request, verdict) => { /* verdict.action = "deny" */ },
    "chat.system":         async (input, output) => { output.system.push("…") },
    tools: { /* custom tools with zod schemas */ },
  };
}
```

Hooks follow one convention: `(input, output) => void` — mutate `output` in place. See `.coven/plugins/audit-log.ts` for a working example.

## Configuration

`coven.json` (project, discovered walking up from cwd) merged over `~/.config/coven/coven.json` (global):

| Key | What |
|---|---|
| `model` / `small_model` | `"provider/model"` — the small model handles compaction |
| `default_agent` | Session starting agent (default `builder`) |
| `agent.<name>` | Override/add agents: `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | The ruleset |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Extensions |
| `max_steps` | Agentic iteration cap per turn (default 100) |

## Architecture

```
tui (REPL · history · completion · voice)
 └─ session (loop · store · context: prune/compact · system)
     ├─ agent (11 builtins + md)   skill (SKILL.md)   plugin (hooks)   command (registry)
     ├─ tool (bash·read·write·edit·grep·glob·ls·webfetch·todo·task·skill) ── waves ──┐
     ├─ provider (anthropic native · openai-compat → one LLMEvent stream)            │
     ├─ catalog (models.dev + fallback)   auth (BYOK)   tts (say/espeak/openai)      │
     └─ permission (rules · ask flow) ◄──────────────────────────────────────────────┘
bus (typed events) · config (zod, cascading) · util
```

Dependencies point downward only. The session loop owns tool execution: validate (zod) → permission gate → plugin `before` → execute → plugin `after` → feed back. A subagent is a child session run to completion.

## Development

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contributing

Issues and PRs welcome. Coven follows its own methodology — design before code, TDD, verification before completion; the skills in `.coven/skills/` document it. New behavior lands with a test in the same commit; conventional commits; two runtime deps and that stays deliberate.

If you build something using "coven" in its name, please add a note clarifying it isn't affiliated with this project.

## License

[MIT](./LICENSE)
