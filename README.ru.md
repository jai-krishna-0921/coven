<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">Ковен агентов для программирования в вашем терминале.</p>

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

Coven — это терминальный ИИ-ассистент для программирования, построенный вокруг четырёх идей:

1. **Много агентов, а не один.** Одиннадцать встроенных специалистов — conductor, который оркеструет, плюс planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe и guardian — у каждого свой устав, своя модель и свой поводок разрешений. Субагенты запускаются параллельно. Добавьте своих с помощью markdown-файла.
2. **Навыки вместо промптов.** Переиспользуемые методологии (TDD, систематическая отладка, параллельная диспетчеризация, проверка перед завершением) поставляются как навыки по требованию с таблицами рационализаций и списками красных флагов — прогрессивное раскрытие, а не раздувание системного промпта.
3. **Ограждения как архитектура.** Каждый вызов инструмента проходит через движок разрешений, сканер bash-команд, защищённое от симлинков ограничение путей и детектор циклов зацикливания. Плагины могут наблюдать за всем и накладывать вето.
4. **Контекст, который управляет собой сам.** Учёт токенов по данным провайдера, отсечение устаревших выводов инструментов в стиле DCP и скользящее уплотнение с якорным резюме — длинные сессии остаются чёткими, а не умирают у стены контекста.

Создан на [Bun](https://bun.sh) + TypeScript, поставляется как бинарник для Node ≥ 20. Две зависимости времени выполнения (`@anthropic-ai/sdk`, `zod`).

## Установка

```bash
npm install -g thecoven          # the binary is `coven`
# or
bun install -g thecoven
pnpm add -g thecoven
```

Из исходников:

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Быстрый старт

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

Однократный режим:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## Используйте свой собственный ключ

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

Любая совместимая с OpenAI конечная точка работает через конфигурацию — у `openai`, `groq`, `openrouter` и `ollama` есть встроенные базовые URL:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Окна контекста и цены берутся из каталога, поэтому строка статуса показывает реальную стоимость и использование контекста в каждой сессии.

## Ковен

| Agent | Mode | Charter |
|---|---|---|
| `conductor` | primary | Декомпозирует цели, диспетчеризует специалистов **параллельно**, интегрирует |
| `builder` | primary | Реализация, сначала тесты (по умолчанию) |
| `planner` | all | Одобренный дизайн → компактный план задач в стиле TDD |
| `researcher` | subagent | Разведка только для чтения с доказательствами |
| `debugger` | all | Четырёхфазная отладка с поиском первопричины |
| `optimizer` | all | Измерить → изменить одну вещь → измерить |
| `reviewer` | subagent | Соответствие спецификации + качество кода, отдельные вердикты |
| `tester` | all | Покрытие поведения и охота за граничными случаями |
| `architect` | subagent | Проектирование интерфейсов и записи решений |
| `scribe` | subagent | Документация, сверенная с исходным кодом |
| `guardian` | subagent | Аудит безопасности: инъекции, обход путей, утечки, обходы защиты |

Переключите основного агента командой `/agent <name>`. Субагенты диспетчеризуются агентами через инструмент `task` — каждый запускается в изолированной дочерней сессии со своим набором правил разрешений и отчитывается о результате. Последовательные вызовы `task` в одном ходе выполняются **параллельно**.

Пользовательские агенты — это markdown-файлы в `.coven/agents/`:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## В сессии

| Command | Does |
|---|---|
| `/agents` · `/agent <name>` | список агентов / переключить основного агента |
| `/models [filter]` · `/model <ref>` | просмотреть каталог / задать модель |
| `/auth login <provider>` | сохранить API-ключ (BYOK) |
| `/skills` · `/tools` | список навыков / инструментов |
| `/status` | сессия, контекст %, стоимость, голос |
| `/compact` | резюмировать старую историю, чтобы освободить контекст |
| `/voice [on\|off]` | включить/выключить синтез речи |
| `/init` | сгенерировать `AGENTS.md` для этого репозитория |
| `/review [target]` | запустить проверку кода |
| `/new` · `/sessions` · `/resume <n>` | управление сессиями |
| `/export [file]` | записать транскрипт в markdown |
| `!<cmd>` | выполнить команду оболочки самостоятельно |
| `@file` | прикрепить файл к вашему промпту |

Многострочный ввод: завершите строку символом `\` или откройте ограждение ` ``` `. Автодополнение по Tab для команд и агентов; история ввода сохраняется между сессиями.

### Пользовательские команды

Поместите markdown в `.coven/commands/` — семантика, совместимая с OpenCode:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

Плейсхолдеры `$ARGUMENTS` / `$1..$N`, инъекция оболочки `` !`cmd` `` (под контролем разрешений) и вложения `@file` (с проверкой ограничения путей и секретов).

## Управление контекстом

- **Учёт** — использование по данным провайдера является истиной в последней инстанции; строка статуса показывает актуальный процент контекста относительно реального окна модели.
- **Сначала отсечение** (дёшево, без вызова LLM) — старые выводы инструментов за пределами защищённого бюджета свежести в 40k токенов маскируются; сами вызовы и аргументы остаются видимыми. Ничего не удаляется; маски применяются на этапе рендеринга и обратимы.
- **Затем уплотнение** — при переполнении старые ходы резюмируются малой моделью в скользящее *якорное резюме*, при этом самые недавние ходы сохраняются дословно. `/compact` запускает это вручную.
- **Дружелюбно к кэшу** — хранилище сообщений только дополняется; кэширование промптов Anthropic получает скользящие точки останова (цена ввода 0.1× при повторном чтении истории).

## Голос

`/voice on` озвучивает ответы ассистента. Бэкенды автоопределяются по порядку: OpenAI TTS (`gpt-4o-mini-tts`, когда есть `OPENAI_API_KEY` + проигрыватель) → macOS `say` → Linux `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI. Никакой настройки, никаких зависимостей; `COVEN_TTS=off|say|espeak|…` переопределяет выбор. Прерывание сессии немедленно останавливает речь.

## Разрешения

Упорядоченные правила, **побеждает последнее совпадение** (базовые → агент → ваша конфигурация → одобрения сессии):

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

Всегда включено: сканирование bash-команд (`rm -rf`, force-push, `curl | sh`, `sudo` всегда спрашивают), ограничение путей с разрешением симлинков, обнаружение циклов зацикливания, `.env` спрашивает / ключевой материал запрещает. На каждый запрос отвечают `once`, `always` (сохраняется на время сессии) или `reject` — с обратной связью, которая идёт прямо обратно к модели.

## Плагины

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

Хуки следуют одному соглашению: `(input, output) => void` — изменяйте `output` на месте. Рабочий пример смотрите в `.coven/plugins/audit-log.ts`.

## Конфигурация

`coven.json` (проектный, обнаруживается обходом вверх от cwd) объединяется поверх `~/.config/coven/coven.json` (глобальный):

| Key | What |
|---|---|
| `model` / `small_model` | `"provider/model"` — малая модель занимается уплотнением |
| `default_agent` | Стартовый агент сессии (по умолчанию `builder`) |
| `agent.<name>` | Переопределить/добавить агентов: `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | Набор правил |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Расширения |
| `max_steps` | Ограничение агентных итераций на ход (по умолчанию 100) |

## Архитектура

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

Зависимости направлены только вниз. Цикл сессии владеет выполнением инструментов: валидация (zod) → шлюз разрешений → плагин `before` → выполнение → плагин `after` → обратная связь. Субагент — это дочерняя сессия, запущенная до завершения.

## Разработка

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Участие в проекте

Задачи (issues) и pull-запросы приветствуются. Coven следует собственной методологии — дизайн до кода, TDD, проверка перед завершением; навыки в `.coven/skills/` документируют её. Новое поведение появляется вместе с тестом в том же коммите; conventional commits; две зависимости времени выполнения, и это остаётся осознанным.

Если вы создаёте что-то со словом «coven» в названии, пожалуйста, добавьте примечание, поясняющее, что это не связано с этим проектом.

## Лицензия

[MIT](./LICENSE)
