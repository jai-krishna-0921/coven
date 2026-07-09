# coven

**A coven of coding agents in your terminal.**

Coven is a terminal-based AI coding assistant built around three ideas:

1. **Many agents, not one.** Eleven built-in specialists — a conductor that orchestrates,
   a planner, a builder, a researcher, a debugger, an optimizer, a reviewer, a tester, an
   architect, a scribe, and a guardian — each with its own charter, model settings, and
   permission leash. Add your own with a markdown file.
2. **Skills over prompts.** Reusable methodology (TDD, systematic debugging,
   verification-before-completion) ships as on-demand skills the agents load when relevant —
   progressive disclosure, not system-prompt bloat.
3. **Guardrails as architecture.** Every tool call passes through a permission engine
   (allow / ask / deny rules with wildcard patterns), a bash command scanner, symlink-safe
   path containment, and a doom-loop detector. Plugins can observe and veto everything.

Built with [Bun](https://bun.sh) + TypeScript. Two runtime dependencies (`@anthropic-ai/sdk`, `zod`).

## Quickstart

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install

export ANTHROPIC_API_KEY=sk-ant-…
bun run dev                 # interactive session
```

One-shot mode:

```bash
bun run dev run -p "explain what src/session/loop.ts does" --agent researcher
bun run dev run -p "add input validation to the config loader" --yes   # auto-approve asks
```

Inspect the roster:

```bash
bun run dev agents
bun run dev skills
```

## The coven

| Agent | Mode | Charter |
|---|---|---|
| `conductor` | primary | Decomposes goals, dispatches specialists, integrates results |
| `builder` | primary | Implementation, test-first (default agent) |
| `planner` | all | Approved design → bite-sized TDD task plan |
| `researcher` | subagent | Read-only reconnaissance with evidence |
| `debugger` | all | Four-phase root-cause debugging |
| `optimizer` | all | Measure → change one thing → measure |
| `reviewer` | subagent | Spec compliance + code quality, separate verdicts |
| `tester` | all | Behavior coverage and edge-case hunting |
| `architect` | subagent | Interface design and decision records |
| `scribe` | subagent | Docs verified against the source |
| `guardian` | subagent | Security audit: injection, traversal, leaks, bypasses |

Primary agents are driven by you (`/agent conductor`). Subagents are dispatched by agents
via the `task` tool — each runs in an isolated child session with its own permission rules
and reports back.

Custom agents are markdown files in `.coven/agents/`:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## Skills

A skill is a directory with a `SKILL.md`:

```markdown
---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code.
---
# The methodology, loaded only when needed…
```

Only names + descriptions enter the system prompt; bodies load on demand through the
`skill` tool. Discovery roots: `~/.config/coven/skills`, `.claude/skills` (Claude Code
compatible), `.coven/skills`, plus `skills.paths` from config.

## Guardrails

Permissions are ordered rules — **last match wins**, so later sources override earlier ones
(baseline → agent → your config → session "always" approvals):

```jsonc
// coven.json
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

What's always on:

- **Bash scanning** — commands are parsed (pipes, `&&`, `$()` substitution) into command
  heads matched against your rules; `rm -rf`, force-pushes, `curl | sh`, and `sudo` are
  flagged dangerous and always ask.
- **Path containment** — file tools resolve symlinks *before* the containment check;
  escaping the workspace requires an `external_directory` approval.
- **Doom-loop detection** — three identical consecutive tool calls pause for confirmation.
- **Secret hygiene** — `.env` reads ask; key material like `id_rsa` is denied outright.

Every ask is answered `once`, `always` (persists for the session), or `reject` — with
optional feedback that goes straight back to the model.

## Plugins

Drop a TypeScript file in `.coven/plugins/`:

```ts
export default function myPlugin({ root, config, subscribe }) {
  return {
    "tool.execute.before": async (meta, output) => { /* mutate output.args */ },
    "tool.execute.after":  async (meta, result) => { /* mutate result */ },
    "permission.ask":      async (request, verdict) => { /* verdict.action = "deny" */ },
    "chat.system":         async (input, output) => { output.system.push("…") },
    tools: { /* register custom tools with zod schemas */ },
  };
}
```

Hooks follow one convention: `(input, output) => void` — mutate `output` in place.
See `.coven/plugins/audit-log.ts` for a working example that records every command and
edit to `.coven/audit.jsonl`.

## Configuration

`coven.json` (project, discovered walking up from cwd) merged over
`~/.config/coven/coven.json` (global):

| Key | What |
|---|---|
| `model` | `"provider/model"`, e.g. `"anthropic/claude-opus-4-8"` |
| `small_model` | Cheap model for internal work |
| `default_agent` | Session starting agent (default `builder`) |
| `agent.<name>` | Override/add agents: `model`, `prompt`, `steps`, `permission`, `disable`… |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | The ruleset (see above) |
| `plugins` | Plugin module paths |
| `instructions` | Extra instruction files for the system prompt |
| `max_steps` | Agentic iteration cap per turn (default 100) |

Providers: `anthropic` is native; anything speaking the OpenAI wire protocol works via
config — `openai`, `groq`, `openrouter`, and `ollama` have built-in base URLs:

```jsonc
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

## Architecture

```
┌─────────────────────────── tui (REPL, streaming, asks) ──────────────────────────┐
│ ┌──────────────────────── session (loop, store, system) ─────────────────────┐  │
│ │ ┌────────── agent ─────────┐ ┌────────── skill ─────────┐ ┌─── plugin ───┐ │  │
│ │ │ 11 builtins + md files   │ │ SKILL.md discovery       │ │ hooks, tools │ │  │
│ │ └──────────────────────────┘ └──────────────────────────┘ └──────────────┘ │  │
│ │ ┌────────────── tool ─────────────┐ ┌──────────── provider ─────────────┐  │  │
│ │ │ bash·read·write·edit·grep·glob  │ │ anthropic native · openai-compat  │  │  │
│ │ │ ls·webfetch·todo·task·skill     │ │ normalized LLMEvent stream        │  │  │
│ │ └─────────────────────────────────┘ └───────────────────────────────────┘  │  │
│ │ ┌───────────────────── permission (rules, ask flow) ──────────────────────┐│  │
│ │ └──────────────────────────────────────────────────────────────────────────┘│  │
│ └─────────────────────────────────────────────────────────────────────────────┘  │
│      bus (typed events) · config (zod, cascading) · util (errors, ids, ansi)     │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Dependencies point downward only. The session loop owns tool execution: validate args
(zod) → permission gate → plugin `before` → execute → plugin `after` → feed result back.
A subagent is just a child session run to completion.

## Development

```bash
bun test              # 68 tests, includes a full loop integration suite with a fake provider
bunx tsc --noEmit     # strict typecheck
bun run compile       # single-binary build → dist/coven
```

The repo dogfoods its own methodology: skills in `.coven/skills/`, agent instructions in
`AGENTS.md`, audit-log plugin enabled.

## Roadmap

- Session compaction (auto-summarize on context overflow)
- MCP client support
- Parallel subagent dispatch
- LSP diagnostics after edits
- Session restore (`coven --continue`)

## License

MIT
