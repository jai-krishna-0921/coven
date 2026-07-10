<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">终端里的编码智能体团队。</p>

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

Coven 是一个基于终端的 AI 编码助手，围绕四个理念构建：

1. **多个智能体，而非单一智能体。** 内置十一位专家——一个负责编排的 conductor，外加 planner、builder、researcher、debugger、optimizer、reviewer、tester、architect、scribe 和 guardian——每位都有自己的职责章程、模型和权限约束。子代理可并行派发。用一个 markdown 文件即可添加你自己的智能体。
2. **技能优先于提示词。** 可复用的方法论（TDD、系统化调试、并行派发、完成前验证）以按需加载的技能形式提供，配有合理化对照表和危险信号清单——渐进式披露，而非臃肿的系统提示词。
3. **护栏即架构。** 每次工具调用都会经过权限引擎、bash 命令扫描器、防符号链接的路径隔离，以及死循环检测器。插件可以观察并否决一切。
4. **自我管理的上下文。** 由服务商上报的 token 计量、DCP 式的陈旧工具输出裁剪，以及滚动式锚定摘要压缩——长会话始终保持清晰，而不会在上下文上限处崩溃。

使用 [Bun](https://bun.sh) + TypeScript 构建，以 Node ≥ 20 二进制文件发布。仅两个运行时依赖（`@anthropic-ai/sdk`、`zod`）。

## Installation

```bash
npm install -g coven-cli          # the binary is `coven`
# or
bun install -g coven-cli
pnpm add -g coven-cli
```

从源码构建：

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

一次性执行模式：

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

任何兼容 OpenAI 的端点都可通过配置使用——`openai`、`groq`、`openrouter` 和 `ollama` 已内置基础 URL：

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

上下文窗口和价格来自目录，因此状态栏会显示每个会话的真实成本和上下文使用量。

## The coven

| Agent | Mode | 职责 |
|---|---|---|
| `conductor` | primary | 拆解目标，**并行**派发专家，整合结果 |
| `builder` | primary | 实现代码，测试先行（默认） |
| `planner` | all | 已批准的设计 → 细粒度的 TDD 任务计划 |
| `researcher` | subagent | 只读侦察，附带证据 |
| `debugger` | all | 四阶段根因调试 |
| `optimizer` | all | 度量 → 只改一处 → 再度量 |
| `reviewer` | subagent | 规范符合性 + 代码质量，分别给出结论 |
| `tester` | all | 行为覆盖与边界情形挖掘 |
| `architect` | subagent | 接口设计与决策记录 |
| `scribe` | subagent | 对照源码核实的文档 |
| `guardian` | subagent | 安全审计：注入、遍历、泄漏、绕过 |

使用 `/agent <name>` 切换主智能体。子代理由智能体通过 `task` 工具派发——每个都在隔离的子会话中运行，拥有自己的权限规则集，并将结果回报。同一轮中连续的 `task` 调用会**并发**执行。

自定义智能体是 `.coven/agents/` 中的 markdown 文件：

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## In the session

| Command | 作用 |
|---|---|
| `/agents` · `/agent <name>` | 列出智能体 / 切换主智能体 |
| `/models [filter]` · `/model <ref>` | 浏览目录 / 设置模型 |
| `/auth login <provider>` | 存储 API 密钥（BYOK） |
| `/skills` · `/tools` | 列出技能 / 工具 |
| `/status` | 会话、上下文占比、成本、语音 |
| `/compact` | 摘要较早的历史以释放上下文 |
| `/voice [on\|off]` | 切换文本转语音 |
| `/init` | 为本仓库生成 `AGENTS.md` |
| `/review [target]` | 派发一次代码审查 |
| `/new` · `/sessions` · `/resume <n>` | 会话管理 |
| `/export [file]` | 将对话记录写为 markdown |
| `!<cmd>` | 自行运行 shell 命令 |
| `@file` | 将文件附加到你的提示词 |

多行输入：以 `\` 结尾一行，或打开一个 ` ``` ` 代码围栏。命令和智能体支持 Tab 补全；输入历史会跨会话保留。

### Custom commands

将 markdown 放入 `.coven/commands/`——语义兼容 OpenCode：

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

支持 `$ARGUMENTS` / `$1..$N` 占位符、`` !`cmd` `` shell 注入（受权限管控），以及 `@file` 附件（经隔离与密钥检查）。

## Context management

- **计量**——以服务商上报的用量为准；状态栏对照模型的真实窗口实时显示上下文占比。
- **优先裁剪**（廉价，无需 LLM 调用）——超出受保护的 40k-token 近期预算之外的旧工具输出会被遮蔽；调用及其参数仍然可见。不会删除任何内容；遮蔽只发生在渲染时且可逆。
- **其次压缩**——溢出时，较早的轮次由小模型摘要为一份滚动的*锚定摘要*，同时逐字保留最近的若干轮。`/compact` 可手动触发。
- **缓存友好**——消息存储为仅追加式；Anthropic 提示缓存获得滚动断点（历史重读时输入价格为 0.1 倍）。

## Voice

`/voice on` 会朗读助手的回复。后端按顺序自动检测：OpenAI TTS（`gpt-4o-mini-tts`，当存在 `OPENAI_API_KEY` 且有可用播放器时）→ macOS `say` → Linux `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI。零配置、零依赖；`COVEN_TTS=off|say|espeak|…` 可覆盖。打断会话会立即停止朗读。

## Permissions

有序规则，**最后匹配者胜出**（基线 → 智能体 → 你的配置 → 会话审批）：

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

始终开启：bash 命令扫描（`rm -rf`、强制推送、`curl | sh`、`sudo` 一律询问）、解析符号链接后的路径隔离、死循环检测、`.env` 询问 / 密钥材料拒绝。每次询问都以 `once`、`always`（在本会话内持续生效）或 `reject` 回答——反馈会直接回传给模型。

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

钩子遵循同一种约定：`(input, output) => void`——就地修改 `output`。可参考 `.coven/plugins/audit-log.ts` 中的可运行示例。

## Configuration

`coven.json`（项目级，从 cwd 向上查找发现）叠加合并在 `~/.config/coven/coven.json`（全局级）之上：

| Key | 含义 |
|---|---|
| `model` / `small_model` | `"provider/model"`——小模型负责压缩 |
| `default_agent` | 会话起始智能体（默认 `builder`） |
| `agent.<name>` | 覆盖/新增智能体：`model`、`prompt`、`steps`、`permission`、`disable` |
| `provider.<id>` | `apiKeyEnv`、`baseUrl`、`protocol: "anthropic" \| "openai"` |
| `permission` | 规则集 |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | 扩展项 |
| `max_steps` | 每轮智能体迭代上限（默认 100） |

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

依赖只向下指。会话循环负责工具执行：校验（zod）→ 权限闸门 → 插件 `before` → 执行 → 插件 `after` → 回传反馈。子代理就是一个运行至完成的子会话。

## Development

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contributing

欢迎提交 Issue 和 PR。Coven 遵循它自己的方法论——先设计后编码、TDD、完成前验证；`.coven/skills/` 中的技能对此有详尽记录。新行为要在同一次提交中附带测试；采用约定式提交；保持仅两个运行时依赖，并让这一点始终是有意为之。

如果你构建的东西在名称中使用了 “coven”，请附上一条说明，澄清它与本项目无关。

## License

[MIT](./LICENSE)
