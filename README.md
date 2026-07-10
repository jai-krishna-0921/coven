# coven

**A coven of coding agents in your terminal.**

Coven is a terminal-based AI coding assistant built around four ideas:

1. **Many agents, not one.** Eleven built-in specialists — conductor, planner, builder,
   researcher, debugger, optimizer, reviewer, tester, architect, scribe, guardian — each
   with its own charter, model settings, and permission leash. Subagents dispatch in
   parallel; add your own agent with a markdown file.
2. **Skills over prompts.** Reusable methodology (TDD, systematic debugging, parallel
   dispatch, verification-before-completion) ships as on-demand skills with rationalization
   tables and red-flag lists — progressive disclosure, not system-prompt bloat.
3. **Guardrails as architecture.** Every tool call passes through a permission engine
   (allow / ask / deny wildcard rules), a bash command scanner, symlink-safe path
   containment, and a doom-loop detector. Plugins can observe and veto everything.
4. **Context that manages itself.** Provider-reported token accounting, DCP-style pruning
   of stale tool outputs (observation masking), and rolling anchored-summary compaction —
   long sessions stay sharp instead of dying at the context wall.

Built with [Bun](https://bun.sh) + TypeScript, runs under plain Node ≥ 20. Two runtime
dependencies (`@anthropic-ai/sdk`, `zod`).

## Install

```bash
npm install -g coven-cli     # the binary is `coven`
# or from source:
git clone https://github.com/jai-krishna-0921/coven && cd coven && bun install
```

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-…    # or: coven auth login anthropic
coven                                 # interactive session
```

One-shot mode:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## BYOK — bring your own key

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

Any OpenAI-compatible endpoint works via config — `openai`, `groq`, `openrouter`, and
`ollama` have built-in base URLs:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Pricing and context windows come from the catalog, so the status line shows real cost and
context usage per session.

## In the session

```
/agents · /agent <name>     switch specialist          /status      context %, cost, voice
/models [filter] · /model   browse / set model         /compact     summarize old history
/auth login <provider>      BYOK                       /voice on    text-to-speech
/init                       generate AGENTS.md         /review      dispatch a code review
/new · /sessions · /resume  session management         /export      transcript to markdown
!<cmd>                      run a shell command        @file        attach a file
```

- **Custom commands**: drop markdown in `.coven/commands/` — frontmatter (`description`,
  `agent`, `model`), `$ARGUMENTS` / `$1..$N` placeholders, `` !`cmd` `` shell injection,
  `@file` attachments. OpenCode-compatible semantics.
- **Multi-line input**: end a line with `\` or open a ``` fence.
- **Tab completion** for commands and agents; input history persists across sessions.

## Voice (TTS)

`/voice on` speaks assistant replies. Backend auto-detection: OpenAI TTS
(`gpt-4o-mini-tts`, when `OPENAI_API_KEY` + a player exist) → macOS `say` → Linux
`piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI. Zero configuration, zero
dependencies; `COVEN_TTS=off|say|espeak|…` overrides. Interrupting the session stops
speech immediately.

## Context management

- **Accounting**: provider-reported usage is ground truth; chars/4 estimation only for
  pre-flight. The status line shows live context % against the model's real window.
- **Pruning first** (cheap, no LLM call): old tool outputs beyond a protected 40k-token
  recency budget are masked (`[Old tool result content cleared]`) — the calls and args stay
  visible. Protected: skill loads, task reports, todo state, edits. Hysteresis: only when
  ≥ 20k tokens reclaimable. Nothing is deleted — masks are render-time and reversible.
- **Compaction second**: at overflow (context − min(20k, max-output) reserve), older turns
  are summarized into a rolling *anchored summary* (Objective / Important Details / Work
  State / Next Move / Relevant Files) by the small model, keeping the last 2 turns
  verbatim. `/compact` triggers it manually.
- **Cache-friendly**: the message store is append-only; Anthropic prompt caching gets a
  rolling breakpoint on the last block (0.1× input price on history re-reads).

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

A subagent is a child session with its own permission ruleset. Consecutive `task` calls in
one turn run **concurrently**; read-only tools batch into concurrent waves; mutating tools
are strict barriers.

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

Always on: bash scanning (pipes, `$()`, env-prefixes → command heads; `rm -rf`,
force-push, `curl | sh`, `sudo` always ask), symlink-resolved path containment,
doom-loop detection, `.env` ask / key-material deny.

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

See `.coven/plugins/audit-log.ts` — records every command and edit to `.coven/audit.jsonl`.

## Configuration

| Key | What |
|---|---|
| `model` / `small_model` | `"provider/model"` — small model handles compaction |
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

Dependencies point downward only. The session loop owns tool execution: validate (zod) →
permission gate → plugin `before` → execute → plugin `after` → feed back.

## Development

```bash
bun test              # 180+ tests incl. loop integration with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## License

MIT
