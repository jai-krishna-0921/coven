<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">Un aquelarre de agentes de programación en tu terminal.</p>

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

Coven es un asistente de programación con IA basado en terminal, construido en torno a cuatro ideas:

1. **Muchos agentes, no uno.** Once especialistas integrados: un conductor que orquesta, además de planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe y guardian, cada uno con su propio cometido, modelo y correa de permisos. Los subagentes se despachan en paralelo. Añade los tuyos con un archivo markdown.
2. **Habilidades en lugar de prompts.** La metodología reutilizable (TDD, depuración sistemática, despacho paralelo, verificación-antes-de-completar) se distribuye como habilidades bajo demanda con tablas de racionalización y listas de señales de alerta: divulgación progresiva, no un system prompt sobrecargado.
3. **Barreras de protección como arquitectura.** Cada llamada a una herramienta pasa por un motor de permisos, un escáner de comandos bash, contención de rutas segura frente a enlaces simbólicos y un detector de bucles infinitos. Los plugins pueden observar y vetar todo.
4. **Contexto que se gestiona solo.** Contabilidad de tokens informada por el proveedor, poda al estilo DCP de salidas de herramientas obsoletas y compactación continua con resumen anclado: las sesiones largas se mantienen nítidas en lugar de morir contra el muro del contexto.

Construido con [Bun](https://bun.sh) + TypeScript, se distribuye como binario para Node ≥ 20. Dos dependencias en tiempo de ejecución (`@anthropic-ai/sdk`, `zod`).

## Instalación

```bash
npm install -g thecoven          # the binary is `coven`
# or
bun install -g thecoven
pnpm add -g thecoven
```

Desde el código fuente:

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Inicio rápido

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

Modo de una sola ejecución:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## Usa tu propia clave

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

Cualquier endpoint compatible con OpenAI funciona mediante configuración; `openai`, `groq`, `openrouter` y `ollama` tienen URLs base integradas:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Las ventanas de contexto y los precios provienen del catálogo, de modo que la línea de estado muestra el coste real y el uso de contexto por sesión.

## El aquelarre

| Agente | Modo | Cometido |
|---|---|---|
| `conductor` | primary | Descompone objetivos, despacha especialistas **en paralelo**, integra |
| `builder` | primary | Implementación, con pruebas primero (por defecto) |
| `planner` | all | Diseño aprobado → plan de tareas TDD en porciones pequeñas |
| `researcher` | subagent | Reconocimiento de solo lectura con evidencia |
| `debugger` | all | Depuración de causa raíz en cuatro fases |
| `optimizer` | all | Medir → cambiar una sola cosa → medir |
| `reviewer` | subagent | Cumplimiento de la especificación + calidad del código, veredictos por separado |
| `tester` | all | Cobertura de comportamiento y búsqueda de casos límite |
| `architect` | subagent | Diseño de interfaces y registros de decisiones |
| `scribe` | subagent | Documentación verificada contra el código fuente |
| `guardian` | subagent | Auditoría de seguridad: inyección, traversal, filtraciones, elusiones |

Cambia el agente primario con `/agent <name>`. Los subagentes son despachados por los agentes mediante la herramienta `task`: cada uno se ejecuta en una sesión hija aislada con su propio conjunto de reglas de permisos e informa de vuelta. Las llamadas `task` consecutivas en un mismo turno se ejecutan **de forma concurrente**.

Los agentes personalizados son archivos markdown en `.coven/agents/`:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## En la sesión

| Comando | Qué hace |
|---|---|
| `/agents` · `/agent <name>` | lista los agentes / cambia el agente primario |
| `/models [filter]` · `/model <ref>` | explora el catálogo / define el modelo |
| `/auth login <provider>` | almacena una clave de API (BYOK) |
| `/skills` · `/tools` | lista habilidades / herramientas |
| `/status` | sesión, % de contexto, coste, voz |
| `/compact` | resume el historial más antiguo para liberar contexto |
| `/voice [on\|off]` | activa o desactiva la síntesis de voz |
| `/init` | genera `AGENTS.md` para este repositorio |
| `/review [target]` | despacha una revisión de código |
| `/new` · `/sessions` · `/resume <n>` | gestión de sesiones |
| `/export [file]` | escribe la transcripción en markdown |
| `!<cmd>` | ejecuta tú mismo un comando de shell |
| `@file` | adjunta un archivo a tu prompt |

Entrada multilínea: termina una línea con `\` o abre una cerca ` ``` `. Autocompletado con Tab para comandos y agentes; el historial de entrada persiste entre sesiones.

### Comandos personalizados

Coloca markdown en `.coven/commands/` — con semántica compatible con OpenCode:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

Marcadores de posición `$ARGUMENTS` / `$1..$N`, inyección de shell `` !`cmd` `` (controlada por permisos) y adjuntos `@file` (verificados en cuanto a contención y secretos).

## Gestión del contexto

- **Contabilidad** — el uso informado por el proveedor es la fuente de verdad; la línea de estado muestra el % de contexto en vivo frente a la ventana real del modelo.
- **Poda primero** (barata, sin llamada al LLM) — las salidas de herramientas antiguas que exceden un presupuesto protegido de 40k tokens de recencia se enmascaran; las llamadas y sus argumentos permanecen visibles. No se elimina nada; las máscaras se aplican en el momento del renderizado y son reversibles.
- **Compactación después** — al desbordarse, el modelo pequeño resume los turnos más antiguos en un *resumen anclado* continuo, conservando los turnos más recientes textualmente. `/compact` la activa manualmente.
- **Amigable con la caché** — el almacén de mensajes es de solo adición; el prompt caching de Anthropic obtiene puntos de corte continuos (precio de entrada 0,1× en las relecturas del historial).

## Voz

`/voice on` lee en voz alta las respuestas del asistente. Los backends se detectan automáticamente en este orden: OpenAI TTS (`gpt-4o-mini-tts`, cuando existen `OPENAI_API_KEY` + un reproductor) → `say` de macOS → `piper` / `spd-say` / `espeak-ng` de Linux → SAPI de PowerShell en Windows. Cero configuración, cero dependencias; `COVEN_TTS=off|say|espeak|…` lo anula. Interrumpir la sesión detiene la voz de inmediato.

## Permisos

Reglas ordenadas, **gana la última coincidencia** (base → agente → tu configuración → aprobaciones de la sesión):

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

Siempre activo: escaneo de comandos bash (`rm -rf`, force-push, `curl | sh`, `sudo` siempre preguntan), contención de rutas con enlaces simbólicos resueltos, detección de bucles infinitos, preguntar para `.env` / denegar material de claves. Cada pregunta se responde con `once`, `always` (persiste durante la sesión) o `reject`, con retroalimentación que vuelve directamente al modelo.

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

Los hooks siguen una única convención: `(input, output) => void` — muta `output` en el sitio. Consulta `.coven/plugins/audit-log.ts` para ver un ejemplo funcional.

## Configuración

`coven.json` (del proyecto, descubierto ascendiendo desde el cwd) fusionado sobre `~/.config/coven/coven.json` (global):

| Clave | Qué hace |
|---|---|
| `model` / `small_model` | `"provider/model"` — el modelo pequeño se encarga de la compactación |
| `default_agent` | Agente inicial de la sesión (por defecto `builder`) |
| `agent.<name>` | Anula/añade agentes: `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | El conjunto de reglas |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Extensiones |
| `max_steps` | Límite de iteraciones agénticas por turno (por defecto 100) |

## Arquitectura

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

Las dependencias apuntan solo hacia abajo. El bucle de la sesión es dueño de la ejecución de herramientas: validar (zod) → puerta de permisos → plugin `before` → ejecutar → plugin `after` → retroalimentar. Un subagente es una sesión hija ejecutada hasta su finalización.

## Desarrollo

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contribuir

Se agradecen issues y PRs. Coven sigue su propia metodología: diseño antes que código, TDD, verificación antes de completar; las habilidades en `.coven/skills/` lo documentan. El nuevo comportamiento llega con una prueba en el mismo commit; conventional commits; dos dependencias en tiempo de ejecución, y eso se mantiene de forma deliberada.

Si construyes algo que use "coven" en su nombre, añade una nota que aclare que no está afiliado a este proyecto.

## Licencia

[MIT](./LICENSE)
