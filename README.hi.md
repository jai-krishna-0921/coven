<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">आपके terminal में coding agents का एक coven।</p>

<p align="center">
  <a href="https://www.npmjs.com/package/coven-cli"><img alt="npm" src="https://img.shields.io/npm/v/coven-cli?style=flat-square&color=c026d3&label=coven-cli"></a>
  <a href="https://www.npmjs.com/package/coven-cli"><img alt="downloads" src="https://img.shields.io/npm/dm/coven-cli?style=flat-square&color=a21caf"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/coven-cli?style=flat-square&color=7c3aed"></a>
  <img alt="node" src="https://img.shields.io/node/v/coven-cli?style=flat-square&color=6d28d9">
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

Coven एक terminal-आधारित AI coding assistant है, जो चार विचारों के इर्द-गिर्द बना है:

1. **एक नहीं, कई agents।** ग्यारह built-in विशेषज्ञ — एक conductor जो orchestrate करता है, साथ ही planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe, और guardian — प्रत्येक का अपना charter, model, और permission की सीमा है। Subagents समानांतर (parallel) में dispatch होते हैं। एक markdown file के साथ अपना खुद का जोड़ें।
2. **Prompts से बढ़कर Skills।** पुनः-उपयोग योग्य कार्यप्रणाली (TDD, systematic debugging, parallel dispatch, verification-before-completion) on-demand skills के रूप में आती है, जिनमें rationalization tables और red-flag lists होती हैं — progressive disclosure, न कि system-prompt की भरमार।
3. **Architecture के रूप में Guardrails।** हर tool call एक permission engine, एक bash command scanner, symlink-safe path containment, और एक doom-loop detector से गुज़रती है। Plugins हर चीज़ को देख सकते हैं और veto कर सकते हैं।
4. **Context जो खुद को संभालता है।** Provider द्वारा रिपोर्ट किया गया token accounting, बासी tool outputs की DCP-शैली pruning, और rolling anchored-summary compaction — लंबे sessions context की दीवार पर दम तोड़ने के बजाय तेज़ बने रहते हैं।

[Bun](https://bun.sh) + TypeScript के साथ बना, Node ≥ 20 binary के रूप में आता है। दो runtime dependencies (`@anthropic-ai/sdk`, `zod`)।

## Installation

```bash
npm install -g coven-cli          # the binary is `coven`
# or
bun install -g coven-cli
pnpm add -g coven-cli
```

Source से:

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

## अपनी खुद की key लाएँ

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

कोई भी OpenAI-compatible endpoint config के ज़रिए काम करता है — `openai`, `groq`, `openrouter`, और `ollama` के base URLs built-in हैं:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Context windows और pricing catalog से आते हैं, इसलिए status line प्रति session असली cost और context usage दिखाती है।

## The coven

| Agent | Mode | Charter |
|---|---|---|
| `conductor` | primary | लक्ष्यों को टुकड़ों में बाँटता है, विशेषज्ञों को **समानांतर में** dispatch करता है, integrate करता है |
| `builder` | primary | Implementation, test-first (default) |
| `planner` | all | स्वीकृत design → छोटे-छोटे TDD task plan |
| `researcher` | subagent | प्रमाण के साथ read-only reconnaissance |
| `debugger` | all | चार-चरणीय root-cause debugging |
| `optimizer` | all | मापें → एक चीज़ बदलें → मापें |
| `reviewer` | subagent | Spec अनुपालन + code quality, अलग-अलग verdicts |
| `tester` | all | व्यवहार coverage और edge-case खोज |
| `architect` | subagent | Interface design और decision records |
| `scribe` | subagent | Source के विरुद्ध सत्यापित docs |
| `guardian` | subagent | Security audit: injection, traversal, leaks, bypasses |

`/agent <name>` से primary agent बदलें। Subagents को agents `task` tool के ज़रिए dispatch करते हैं — प्रत्येक अपने अलग permission ruleset के साथ एक isolated child session में चलता है और वापस रिपोर्ट करता है। एक ही turn में लगातार `task` calls **समवर्ती (concurrently)** चलती हैं।

Custom agents `.coven/agents/` में markdown files होती हैं:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## Session के भीतर

| Command | Does |
|---|---|
| `/agents` · `/agent <name>` | agents की सूची दें / primary agent बदलें |
| `/models [filter]` · `/model <ref>` | catalog देखें / model सेट करें |
| `/auth login <provider>` | एक API key store करें (BYOK) |
| `/skills` · `/tools` | skills की सूची दें / tools की सूची दें |
| `/status` | session, context %, cost, voice |
| `/compact` | context खाली करने के लिए पुराने history को सारांशित करें |
| `/voice [on\|off]` | text-to-speech चालू/बंद करें |
| `/init` | इस repo के लिए `AGENTS.md` बनाएँ |
| `/review [target]` | एक code review dispatch करें |
| `/new` · `/sessions` · `/resume <n>` | session management |
| `/export [file]` | transcript को markdown में लिखें |
| `!<cmd>` | खुद एक shell command चलाएँ |
| `@file` | अपने prompt के साथ एक file संलग्न करें |

Multi-line input: किसी line को `\` से खत्म करें या एक ` ``` ` fence खोलें। Commands और agents के लिए Tab-completion; input history sessions के बीच बनी रहती है।

### Custom commands

`.coven/commands/` में markdown रखें — OpenCode-compatible semantics:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

`$ARGUMENTS` / `$1..$N` placeholders, `` !`cmd` `` shell injection (permission-gated), और `@file` attachments (containment- और secret-checked)।

## Context management

- **Accounting** — provider द्वारा रिपोर्ट किया गया usage ही आधार-सत्य है; status line model की असली window के मुकाबले live context % दिखाती है।
- **पहले Pruning** (सस्ती, कोई LLM call नहीं) — सुरक्षित 40k-token recency budget से परे पुराने tool outputs मास्क कर दिए जाते हैं; calls और args दिखते रहते हैं। कुछ भी delete नहीं होता; masks render-time के हैं और उलटे जा सकते हैं।
- **फिर Compaction** — overflow पर पुराने turns को small model द्वारा एक rolling *anchored summary* में सारांशित किया जाता है, सबसे हाल के turns को हूबहू रखते हुए। `/compact` इसे मैन्युअल रूप से trigger करता है।
- **Cache-friendly** — message store append-only है; Anthropic prompt caching को rolling breakpoints मिलते हैं (history re-reads पर 0.1× input price)।

## Voice

`/voice on` assistant के जवाब बोलता है। Backends इस क्रम में auto-detect होते हैं: OpenAI TTS (`gpt-4o-mini-tts`, जब `OPENAI_API_KEY` + एक player मौजूद हों) → macOS `say` → Linux `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI। शून्य configuration, शून्य dependencies; `COVEN_TTS=off|say|espeak|…` इसे override करता है। Session में बाधा डालने से speech तुरंत रुक जाती है।

## Permissions

क्रमबद्ध rules, **आखिरी match जीतता है** (baseline → agent → आपकी config → session approvals):

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

हमेशा चालू: bash command scanning (`rm -rf`, force-push, `curl | sh`, `sudo` हमेशा ask), symlink-resolved path containment, doom-loop detection, `.env` ask / key-material deny। हर ask का जवाब `once`, `always` (session के लिए बना रहता है), या `reject` से दिया जाता है — feedback के साथ जो सीधे model के पास वापस जाता है।

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

Hooks एक ही परिपाटी का पालन करते हैं: `(input, output) => void` — `output` को उसी जगह mutate करें। एक कार्यशील उदाहरण के लिए `.coven/plugins/audit-log.ts` देखें।

## Configuration

`coven.json` (project, cwd से ऊपर की ओर चलते हुए खोजी जाती है) `~/.config/coven/coven.json` (global) के ऊपर merge होती है:

| Key | What |
|---|---|
| `model` / `small_model` | `"provider/model"` — small model compaction संभालता है |
| `default_agent` | Session का शुरुआती agent (default `builder`) |
| `agent.<name>` | agents को override/जोड़ें: `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | The ruleset |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Extensions |
| `max_steps` | प्रति turn agentic iteration की सीमा (default 100) |

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

Dependencies केवल नीचे की ओर इशारा करती हैं। Session loop tool execution की मालिक है: validate (zod) → permission gate → plugin `before` → execute → plugin `after` → feed back। एक subagent पूरा होने तक चलाया गया एक child session है।

## Development

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contributing

Issues और PRs का स्वागत है। Coven अपनी खुद की कार्यप्रणाली का पालन करता है — code से पहले design, TDD, पूरा होने से पहले verification; `.coven/skills/` की skills इसे दर्ज करती हैं। नया व्यवहार उसी commit में एक test के साथ आता है; conventional commits; दो runtime deps और यह जानबूझकर वैसा ही रहता है।

अगर आप "coven" नाम का उपयोग करते हुए कुछ बनाते हैं, तो कृपया एक नोट जोड़ें जो स्पष्ट करे कि यह इस project से संबद्ध नहीं है।

## License

[MIT](./LICENSE)
