<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">ターミナルに集うコーディングエージェントの一団。</p>

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

Coven は、4 つのアイデアを軸に構築された、ターミナルベースの AI コーディングアシスタントです。

1. **単一ではなく、多数のエージェント。** 11 個の組み込みスペシャリスト — オーケストレーションを担う conductor に加え、planner、builder、researcher、debugger、optimizer、reviewer、tester、architect、scribe、guardian — がそれぞれ独自の役割（charter）、モデル、そしてパーミッションの制約を持ちます。サブエージェントは並列でディスパッチされます。markdown ファイルで独自のエージェントを追加できます。
2. **プロンプトよりスキル。** 再利用可能な方法論（TDD、体系的デバッグ、並列ディスパッチ、完了前の検証）は、合理化テーブルと危険信号（red-flag）リストを備えたオンデマンドのスキルとして提供されます — システムプロンプトを肥大化させるのではなく、段階的開示（progressive disclosure）で。
3. **アーキテクチャとしてのガードレール。** すべてのツール呼び出しは、パーミッションエンジン、bash コマンドスキャナー、シンボリックリンクに安全なパス封じ込め、そしてデッドループ（doom-loop）検出器を通過します。プラグインはすべてを監視し、拒否（veto）できます。
4. **自らを管理するコンテキスト。** プロバイダー報告によるトークン集計、古くなったツール出力の DCP 方式のプルーニング、そしてローリング方式のアンカー付きサマリーによるコンパクションにより、長いセッションでもコンテキストの壁で破綻することなく、鋭敏さを保ちます。

[Bun](https://bun.sh) + TypeScript で構築され、Node ≥ 20 のバイナリとして提供されます。ランタイム依存は 2 つ（`@anthropic-ai/sdk`、`zod`）だけです。

## インストール

```bash
npm install -g thecoven          # the binary is `coven`
# or
bun install -g thecoven
pnpm add -g thecoven
```

ソースから:

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## クイックスタート

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

ワンショットモード:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## 独自のキーを使う（BYOK）

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

OpenAI 互換のエンドポイントは設定を通じて利用できます — `openai`、`groq`、`openrouter`、`ollama` には組み込みのベース URL が用意されています:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

コンテキストウィンドウと価格はカタログから取得されるため、ステータスラインにはセッションごとの実際のコストとコンテキスト使用量が表示されます。

## コヴン

| Agent | Mode | 役割 |
|---|---|---|
| `conductor` | primary | ゴールを分解し、スペシャリストを**並列で**ディスパッチし、統合する |
| `builder` | primary | 実装、テストファースト（デフォルト） |
| `planner` | all | 承認済みの設計 → 細分化した TDD タスク計画 |
| `researcher` | subagent | 証拠に基づく読み取り専用の調査 |
| `debugger` | all | 4 フェーズの根本原因デバッグ |
| `optimizer` | all | 計測 → 一つだけ変更 → 計測 |
| `reviewer` | subagent | 仕様準拠 + コード品質、別々の判定 |
| `tester` | all | 振る舞いのカバレッジとエッジケースの洗い出し |
| `architect` | subagent | インターフェース設計と意思決定記録 |
| `scribe` | subagent | ソースと照合して検証されたドキュメント |
| `guardian` | subagent | セキュリティ監査: インジェクション、トラバーサル、漏洩、バイパス |

プライマリエージェントは `/agent <name>` で切り替えます。サブエージェントは `task` ツールを介してエージェントによってディスパッチされ、それぞれが独自のパーミッションルールセットを持つ独立した子セッションで実行され、結果を報告します。1 ターン内で連続する `task` 呼び出しは**同時に**実行されます。

カスタムエージェントは `.coven/agents/` 内の markdown ファイルです:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## セッション内で

| Command | 動作 |
|---|---|
| `/agents` · `/agent <name>` | エージェント一覧 / プライマリエージェントの切り替え |
| `/models [filter]` · `/model <ref>` | カタログを閲覧 / モデルを設定 |
| `/auth login <provider>` | API キーを保存（BYOK） |
| `/skills` · `/tools` | スキル / ツールの一覧 |
| `/status` | セッション、コンテキスト %、コスト、音声 |
| `/compact` | 古い履歴を要約してコンテキストを解放 |
| `/voice [on\|off]` | テキスト読み上げの切り替え |
| `/init` | このリポジトリ用の `AGENTS.md` を生成 |
| `/review [target]` | コードレビューをディスパッチ |
| `/new` · `/sessions` · `/resume <n>` | セッション管理 |
| `/export [file]` | トランスクリプトを markdown に書き出す |
| `!<cmd>` | シェルコマンドを自分で実行 |
| `@file` | プロンプトにファイルを添付 |

複数行入力: 行末を `\` で終えるか、` ``` ` フェンスを開きます。コマンドとエージェントのタブ補完に対応し、入力履歴はセッションをまたいで保持されます。

### カスタムコマンド

`.coven/commands/` に markdown を置くだけ — OpenCode 互換のセマンティクスです:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

`$ARGUMENTS` / `$1..$N` のプレースホルダー、`` !`cmd` `` のシェルインジェクション（パーミッションで制御）、そして `@file` の添付（封じ込めとシークレットのチェック済み）。

## コンテキスト管理

- **集計** — プロバイダーが報告する使用量が信頼できる基準です。ステータスラインには、モデルの実際のウィンドウに対するリアルタイムのコンテキスト % が表示されます。
- **まずプルーニング**（低コスト、LLM 呼び出し不要） — 保護された 40k トークンの直近予算を超える古いツール出力はマスクされますが、呼び出しと引数は表示されたままです。何も削除されません。マスクはレンダリング時のもので、可逆的です。
- **次にコンパクション** — オーバーフロー時には、古いターンが small model によってローリング方式の *アンカー付きサマリー* に要約され、直近のターンはそのまま保持されます。`/compact` で手動でトリガーできます。
- **キャッシュフレンドリー** — メッセージストアは追記のみ（append-only）です。Anthropic のプロンプトキャッシュはローリングのブレークポイントを取得します（履歴の再読み込みでは入力価格が 0.1 倍になります）。

## 音声

`/voice on` はアシスタントの返信を読み上げます。バックエンドは次の順序で自動検出されます: OpenAI TTS（`gpt-4o-mini-tts`、`OPENAI_API_KEY` とプレーヤーが存在する場合） → macOS の `say` → Linux の `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI。設定不要、依存関係もゼロです。`COVEN_TTS=off|say|espeak|…` で上書きできます。セッションを中断すると、読み上げは即座に停止します。

## パーミッション

順序付けされたルールで、**最後にマッチしたものが優先されます**（baseline → agent → ユーザー設定 → セッション承認）:

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

常時有効: bash コマンドスキャン（`rm -rf`、force-push、`curl | sh`、`sudo` は常に確認）、シンボリックリンクを解決したパス封じ込め、デッドループ（doom-loop）検出、`.env` は確認 / キーマテリアルは拒否。すべての確認には `once`、`always`（セッション中は保持）、または `reject` で応答でき、そのフィードバックはそのままモデルに返されます。

## プラグイン

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

フックは 1 つの規約に従います: `(input, output) => void` — `output` をその場で変更します。動作する例については `.coven/plugins/audit-log.ts` を参照してください。

## 設定

`coven.json`（プロジェクト、cwd から上位へたどって検出）を `~/.config/coven/coven.json`（グローバル）に上書きマージします:

| Key | 内容 |
|---|---|
| `model` / `small_model` | `"provider/model"` — small model がコンパクションを担当 |
| `default_agent` | セッション開始時のエージェント（デフォルト `builder`） |
| `agent.<name>` | エージェントの上書き / 追加: `model`、`prompt`、`steps`、`permission`、`disable` |
| `provider.<id>` | `apiKeyEnv`、`baseUrl`、`protocol: "anthropic" \| "openai"` |
| `permission` | ルールセット |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | 拡張機能 |
| `max_steps` | 1 ターンあたりのエージェント反復の上限（デフォルト 100） |

## アーキテクチャ

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

依存関係は下方向にのみ向きます。セッションループがツール実行を所有します: 検証（zod） → パーミッションゲート → プラグイン `before` → 実行 → プラグイン `after` → フィードバック。サブエージェントは、完了まで実行される子セッションです。

## 開発

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## コントリビューション

Issue と PR を歓迎します。Coven は独自の方法論に従います — コードの前に設計、TDD、完了前の検証。これらは `.coven/skills/` 内のスキルに文書化されています。新しい振る舞いは同じコミット内にテストを伴って導入されます。コミットは conventional commits に従います。ランタイム依存は 2 つのみで、これは意図的に維持されています。

名前に「coven」を使ったものを作る場合は、本プロジェクトとは関係がないことを明記する注記を追加してください。

## ライセンス

[MIT](./LICENSE)
