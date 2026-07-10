<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">在你的終端機裡，一群協作的程式設計代理。</p>

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

Coven 是一個以終端機為基礎的 AI 程式設計助手，建構於四個核心理念之上：

1. **多個代理，而非單一代理。** 內建十一位專職專家——一位負責統籌調度的 conductor，再加上 planner、builder、researcher、debugger、optimizer、reviewer、tester、architect、scribe 與 guardian——每一位都有自己的職責章程、模型與權限限制。子代理可以並行派發。你也能透過一個 markdown 檔案加入自己的代理。
2. **技能勝過提示詞。** 可重複使用的方法論（TDD、系統化除錯、並行派發、完成前驗證）以隨需取用的技能形式交付，附帶合理化對照表與危險訊號清單——這是漸進式揭露，而非讓系統提示詞臃腫膨脹。
3. **護欄即架構。** 每一次工具呼叫都會經過一套權限引擎、一個 bash 指令掃描器、防護符號連結的路徑封控，以及一個死迴圈偵測器。外掛可以觀察並否決一切。
4. **能自我管理的上下文。** 由供應商回報的 token 計量、DCP 風格的過時工具輸出修剪，以及滾動式錨定摘要壓縮——讓長時間的工作階段保持敏銳，而不是在上下文極限處崩潰。

以 [Bun](https://bun.sh) + TypeScript 建構，並以 Node ≥ 20 的執行檔形式交付。僅有兩個執行期相依套件（`@anthropic-ai/sdk`、`zod`）。

## Installation

```bash
npm install -g coven-cli          # the binary is `coven`
# or
bun install -g coven-cli
pnpm add -g coven-cli
```

從原始碼安裝：

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

一次性模式：

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

任何相容於 OpenAI 的端點都能透過設定運作——`openai`、`groq`、`openrouter` 與 `ollama` 皆內建了基礎 URL：

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

上下文視窗與定價來自型錄，因此狀態列會顯示每個工作階段的真實成本與上下文用量。

## The coven

| Agent | Mode | Charter |
|---|---|---|
| `conductor` | primary | 拆解目標、**並行**派發專家、整合成果 |
| `builder` | primary | 實作，測試優先（預設） |
| `planner` | all | 已核准的設計 → 細分的 TDD 任務計畫 |
| `researcher` | subagent | 唯讀式偵察，並提出佐證 |
| `debugger` | all | 四階段的根因除錯 |
| `optimizer` | all | 量測 → 只更動一項 → 再量測 |
| `reviewer` | subagent | 規格符合度＋程式碼品質，分別給出結論 |
| `tester` | all | 行為覆蓋與邊界案例的搜捕 |
| `architect` | subagent | 介面設計與決策記錄 |
| `scribe` | subagent | 對照原始碼查核過的文件 |
| `guardian` | subagent | 安全稽核：注入、路徑穿越、外洩、繞過 |

以 `/agent <name>` 切換主要代理。子代理由代理透過 `task` 工具派發——每一個都在獨立的子工作階段中執行，擁有自己的權限規則集，並會回報結果。同一輪中連續的 `task` 呼叫會**並行**執行。

自訂代理是位於 `.coven/agents/` 的 markdown 檔案：

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
| `/agents` · `/agent <name>` | 列出代理／切換主要代理 |
| `/models [filter]` · `/model <ref>` | 瀏覽型錄／設定模型 |
| `/auth login <provider>` | 儲存一組 API 金鑰（BYOK） |
| `/skills` · `/tools` | 列出技能／工具 |
| `/status` | 工作階段、上下文百分比、成本、語音 |
| `/compact` | 摘要較舊的歷史以釋出上下文 |
| `/voice [on\|off]` | 切換文字轉語音 |
| `/init` | 為此儲存庫產生 `AGENTS.md` |
| `/review [target]` | 派發一次程式碼審查 |
| `/new` · `/sessions` · `/resume <n>` | 工作階段管理 |
| `/export [file]` | 將對話記錄寫入 markdown |
| `!<cmd>` | 自行執行一個 shell 指令 |
| `@file` | 將一個檔案附加到你的提示詞 |

多行輸入：在行尾加上 `\`，或開啟一個 ` ``` ` 圍欄。指令與代理支援 Tab 自動補全；輸入歷史會跨工作階段保存。

### Custom commands

在 `.coven/commands/` 中放入 markdown——語意與 OpenCode 相容：

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

支援 `$ARGUMENTS` / `$1..$N` 佔位符、`` !`cmd` `` shell 注入（受權限把關），以及 `@file` 附件（經過封控與機密檢查）。

## Context management

- **計量**——由供應商回報的用量即為真實依據；狀態列會針對模型的真實視窗顯示即時的上下文百分比。
- **先修剪**（成本低，無須呼叫 LLM）——超出受保護的 40k-token 近期預算之外的舊工具輸出會被遮蔽；呼叫本身與其參數仍保持可見。不會刪除任何內容；遮蔽是在算繪時進行且可還原。
- **後壓縮**——在溢位時，較舊的對話輪次會由小型模型摘要成一份滾動式*錨定摘要*，同時原封不動地保留最近的輪次。`/compact` 可手動觸發。
- **對快取友善**——訊息儲存為僅附加式；Anthropic 的提示詞快取會取得滾動式斷點（重新讀取歷史時為 0.1 倍的輸入價格）。

## Voice

`/voice on` 會朗讀助手的回覆。後端會依序自動偵測：OpenAI TTS（`gpt-4o-mini-tts`，當 `OPENAI_API_KEY` 與播放器同時存在時）→ macOS `say` → Linux `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI。零設定、零相依；`COVEN_TTS=off|say|espeak|…` 可覆寫。中斷工作階段會立即停止語音。

## Permissions

有序規則，**最後匹配者勝出**（基準線 → 代理 → 你的設定 → 工作階段核准）：

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

永遠啟用：bash 指令掃描（`rm -rf`、強制推送、`curl | sh`、`sudo` 一律詢問）、解析符號連結後的路徑封控、死迴圈偵測、`.env` 詢問／金鑰資料拒絕。每一次詢問都以 `once`、`always`（於工作階段內持續生效）或 `reject` 回應——並附上直接回饋給模型的意見。

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

掛鉤遵循單一慣例：`(input, output) => void`——就地變更 `output`。可參考 `.coven/plugins/audit-log.ts` 中一個可運作的範例。

## Configuration

`coven.json`（專案層級，從 cwd 向上尋訪而得）會合併覆蓋於 `~/.config/coven/coven.json`（全域層級）之上：

| Key | What |
|---|---|
| `model` / `small_model` | `"provider/model"`——小型模型負責處理壓縮 |
| `default_agent` | 工作階段的起始代理（預設為 `builder`） |
| `agent.<name>` | 覆寫／新增代理：`model`、`prompt`、`steps`、`permission`、`disable` |
| `provider.<id>` | `apiKeyEnv`、`baseUrl`、`protocol: "anthropic" \| "openai"` |
| `permission` | 規則集 |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | 擴充功能 |
| `max_steps` | 每一輪的代理式迭代上限（預設為 100） |

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

相依關係只會向下指向。工作階段迴圈負責掌管工具執行：驗證（zod）→ 權限把關 → 外掛 `before` → 執行 → 外掛 `after` → 回饋。子代理即是一個執行至完成的子工作階段。

## Development

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contributing

歡迎提交 issue 與 PR。Coven 遵循自己的方法論——先設計後寫程式、TDD、完成前驗證；`.coven/skills/` 中的技能記載了這套方法。新行為必須在同一個提交中隨附一個測試；使用慣例式提交；兩個執行期相依套件，且這個數字會刻意保持不變。

如果你打造的東西名稱中含有「coven」，請加上一段說明，釐清它與本專案並無關聯。

## License

[MIT](./LICENSE)
