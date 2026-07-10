<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">Um coven de agentes de programação no seu terminal.</p>

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

Coven é um assistente de programação com IA baseado em terminal, construído em torno de quatro ideias:

1. **Muitos agentes, não apenas um.** Onze especialistas integrados — um conductor que orquestra, além de planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe e guardian — cada um com seu próprio mandato, modelo e limite de permissão. Subagentes são despachados em paralelo. Adicione os seus com um arquivo markdown.
2. **Skills em vez de prompts.** Metodologia reutilizável (TDD, depuração sistemática, despacho paralelo, verificação antes da conclusão) vem como skills sob demanda, com tabelas de racionalização e listas de sinais de alerta — divulgação progressiva, não inchaço do prompt de sistema.
3. **Guardrails como arquitetura.** Toda chamada de ferramenta passa por um motor de permissões, um scanner de comandos bash, contenção de caminhos segura contra symlinks e um detector de doom-loop. Plugins podem observar e vetar tudo.
4. **Contexto que se gerencia sozinho.** Contabilização de tokens reportada pelo provedor, poda ao estilo DCP de saídas de ferramentas obsoletas e compactação contínua com resumo ancorado — sessões longas permanecem afiadas em vez de morrer na parede de contexto.

Construído com [Bun](https://bun.sh) + TypeScript, distribuído como um binário Node ≥ 20. Duas dependências de runtime (`@anthropic-ai/sdk`, `zod`).

## Instalação

```bash
npm install -g coven-cli          # the binary is `coven`
# or
bun install -g coven-cli
pnpm add -g coven-cli
```

A partir do código-fonte:

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Início rápido

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

Modo de execução única:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## Traga sua própria chave

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

Qualquer endpoint compatível com OpenAI funciona via configuração — `openai`, `groq`, `openrouter` e `ollama` têm URLs base integradas:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

As janelas de contexto e os preços vêm do catálogo, então a linha de status mostra o custo real e o uso de contexto por sessão.

## O coven

| Agent | Mode | Charter |
|---|---|---|
| `conductor` | primary | Decompõe objetivos, despacha especialistas **em paralelo**, integra |
| `builder` | primary | Implementação, com testes primeiro (padrão) |
| `planner` | all | Design aprovado → plano de tarefas TDD em pequenas porções |
| `researcher` | subagent | Reconhecimento somente leitura com evidências |
| `debugger` | all | Depuração de causa raiz em quatro fases |
| `optimizer` | all | Medir → mudar uma coisa → medir |
| `reviewer` | subagent | Conformidade com a especificação + qualidade de código, veredictos separados |
| `tester` | all | Cobertura de comportamento e caça a casos-limite |
| `architect` | subagent | Design de interfaces e registros de decisões |
| `scribe` | subagent | Documentação verificada em relação ao código-fonte |
| `guardian` | subagent | Auditoria de segurança: injeção, travessia, vazamentos, contornos |

Troque o agente primário com `/agent <name>`. Subagentes são despachados pelos agentes por meio da ferramenta `task` — cada um roda em uma sessão-filha isolada com seu próprio conjunto de regras de permissão e reporta de volta. Chamadas `task` consecutivas em um mesmo turno rodam **concorrentemente**.

Agentes personalizados são arquivos markdown em `.coven/agents/`:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## Na sessão

| Command | Does |
|---|---|
| `/agents` · `/agent <name>` | lista os agentes / troca o agente primário |
| `/models [filter]` · `/model <ref>` | navega pelo catálogo / define o modelo |
| `/auth login <provider>` | armazena uma chave de API (BYOK) |
| `/skills` · `/tools` | lista skills / ferramentas |
| `/status` | sessão, % de contexto, custo, voz |
| `/compact` | resume o histórico mais antigo para liberar contexto |
| `/voice [on\|off]` | alterna texto para fala |
| `/init` | gera `AGENTS.md` para este repositório |
| `/review [target]` | despacha uma revisão de código |
| `/new` · `/sessions` · `/resume <n>` | gerenciamento de sessões |
| `/export [file]` | escreve a transcrição em markdown |
| `!<cmd>` | executa um comando de shell você mesmo |
| `@file` | anexa um arquivo ao seu prompt |

Entrada em múltiplas linhas: termine uma linha com `\` ou abra uma cerca ` ``` `. Autocompletar com Tab para comandos e agentes; o histórico de entrada persiste entre as sessões.

### Comandos personalizados

Coloque markdown em `.coven/commands/` — semântica compatível com OpenCode:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

Espaços reservados `$ARGUMENTS` / `$1..$N`, injeção de shell `` !`cmd` `` (controlada por permissão) e anexos `@file` (verificados quanto a contenção e segredos).

## Gerenciamento de contexto

- **Contabilização** — o uso reportado pelo provedor é a verdade fundamental; a linha de status mostra a % de contexto ao vivo em relação à janela real do modelo.
- **Poda primeiro** (barata, sem chamada de LLM) — saídas antigas de ferramentas além de um orçamento de recência protegido de 40k tokens são mascaradas; as chamadas e os argumentos permanecem visíveis. Nada é excluído; as máscaras são aplicadas em tempo de renderização e reversíveis.
- **Compactação em segundo** — no overflow, os turnos mais antigos são resumidos em um *resumo ancorado* contínuo pelo modelo pequeno, mantendo os turnos mais recentes na íntegra. `/compact` o aciona manualmente.
- **Amigável ao cache** — o armazenamento de mensagens é somente de anexação; o cache de prompts da Anthropic recebe pontos de quebra contínuos (0,1× do preço de entrada em releituras do histórico).

## Voz

`/voice on` fala as respostas do assistente. Os backends são detectados automaticamente nesta ordem: OpenAI TTS (`gpt-4o-mini-tts`, quando `OPENAI_API_KEY` + um player existem) → `say` do macOS → `piper` / `spd-say` / `espeak-ng` do Linux → SAPI do PowerShell no Windows. Zero configuração, zero dependências; `COVEN_TTS=off|say|espeak|…` sobrepõe. Interromper a sessão para a fala imediatamente.

## Permissões

Regras ordenadas, **a última correspondência vence** (baseline → agente → sua configuração → aprovações de sessão):

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

Sempre ativo: varredura de comandos bash (`rm -rf`, force-push, `curl | sh`, `sudo` sempre perguntam), contenção de caminhos com symlinks resolvidos, detecção de doom-loop, `.env` pergunta / material de chave nega. Todo pergunta é respondido com `once`, `always` (persiste durante a sessão) ou `reject` — com feedback que vai direto de volta ao modelo.

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

Os hooks seguem uma convenção única: `(input, output) => void` — mute `output` no local. Veja `.coven/plugins/audit-log.ts` para um exemplo funcional.

## Configuração

`coven.json` (do projeto, descoberto subindo a partir do cwd) mesclado sobre `~/.config/coven/coven.json` (global):

| Key | What |
|---|---|
| `model` / `small_model` | `"provider/model"` — o modelo pequeno cuida da compactação |
| `default_agent` | Agente inicial da sessão (padrão `builder`) |
| `agent.<name>` | Sobrepõe/adiciona agentes: `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | O conjunto de regras |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Extensões |
| `max_steps` | Limite de iterações agênticas por turno (padrão 100) |

## Arquitetura

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

As dependências apontam apenas para baixo. O loop de sessão é dono da execução das ferramentas: validar (zod) → portão de permissão → plugin `before` → executar → plugin `after` → retornar o resultado. Um subagente é uma sessão-filha executada até a conclusão.

## Desenvolvimento

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contribuindo

Issues e PRs são bem-vindos. Coven segue sua própria metodologia — design antes do código, TDD, verificação antes da conclusão; as skills em `.coven/skills/` a documentam. Novo comportamento chega com um teste no mesmo commit; conventional commits; duas dependências de runtime, e isso permanece deliberado.

Se você construir algo usando "coven" no nome, por favor adicione uma nota esclarecendo que não é afiliado a este projeto.

## Licença

[MIT](./LICENSE)
