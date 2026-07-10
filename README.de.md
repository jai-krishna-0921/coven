<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">Ein Zirkel von Coding-Agents in deinem Terminal.</p>

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

Coven ist ein terminalbasierter KI-Coding-Assistent, der um vier Ideen herum aufgebaut ist:

1. **Viele Agents, nicht nur einer.** Elf integrierte Spezialisten — ein conductor, der orchestriert, dazu planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe und guardian — jeder mit eigenem Auftrag, eigenem Modell und eigener Berechtigungsleine. Subagents werden parallel dispatcht. Ergänze deine eigenen mit einer Markdown-Datei.
2. **Skills statt Prompts.** Wiederverwendbare Methodik (TDD, systematisches Debugging, paralleles Dispatchen, Verification-before-Completion) wird als bei Bedarf abrufbare Skills ausgeliefert — mit Rationalisierungstabellen und Red-Flag-Listen — progressive Offenlegung statt aufgeblähtem System-Prompt.
3. **Guardrails als Architektur.** Jeder Tool-Aufruf durchläuft eine Berechtigungs-Engine, einen Bash-Kommando-Scanner, eine symlink-sichere Pfad-Eingrenzung und einen Doom-Loop-Detektor. Plugins können alles beobachten und mit einem Veto belegen.
4. **Kontext, der sich selbst verwaltet.** Vom Provider gemeldete Token-Buchhaltung, DCP-artiges Pruning veralteter Tool-Ausgaben und rollierende, verankerte Zusammenfassungs-Kompaktierung — lange Sitzungen bleiben scharf, statt an der Kontextwand zu sterben.

Gebaut mit [Bun](https://bun.sh) + TypeScript, ausgeliefert als Node-≥-20-Binary. Zwei Laufzeitabhängigkeiten (`@anthropic-ai/sdk`, `zod`).

## Installation

```bash
npm install -g coven-cli          # the binary is `coven`
# or
bun install -g coven-cli
pnpm add -g coven-cli
```

Aus dem Quellcode:

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Schnellstart

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

One-Shot-Modus:

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## Bring deinen eigenen Schlüssel mit

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

Jeder OpenAI-kompatible Endpunkt funktioniert über die Konfiguration — `openai`, `groq`, `openrouter` und `ollama` haben eingebaute Basis-URLs:

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Kontextfenster und Preise stammen aus dem Katalog, sodass die Statuszeile die tatsächlichen Kosten und die Kontextnutzung pro Sitzung anzeigt.

## Der Zirkel

| Agent | Modus | Auftrag |
|---|---|---|
| `conductor` | primary | Zerlegt Ziele, dispatcht Spezialisten **parallel**, integriert |
| `builder` | primary | Implementierung, test-first (Standard) |
| `planner` | all | Freigegebenes Design → mundgerechter TDD-Aufgabenplan |
| `researcher` | subagent | Nur-lesende Aufklärung mit Belegen |
| `debugger` | all | Vierphasige Root-Cause-Fehlersuche |
| `optimizer` | all | Messen → eine Sache ändern → messen |
| `reviewer` | subagent | Spec-Konformität + Codequalität, getrennte Urteile |
| `tester` | all | Verhaltensabdeckung und Edge-Case-Jagd |
| `architect` | subagent | Interface-Design und Entscheidungsprotokolle |
| `scribe` | subagent | Gegen die Quelle verifizierte Doku |
| `guardian` | subagent | Sicherheitsaudit: Injection, Traversal, Leaks, Bypasses |

Wechsle den primären Agent mit `/agent <name>`. Subagents werden von Agents über das `task`-Tool dispatcht — jeder läuft in einer isolierten Kindsitzung mit eigenem Berechtigungs-Regelsatz und meldet zurück. Aufeinanderfolgende `task`-Aufrufe in einem Zug laufen **nebenläufig**.

Eigene Agents sind Markdown-Dateien in `.coven/agents/`:

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## In der Sitzung

| Befehl | Funktion |
|---|---|
| `/agents` · `/agent <name>` | Agents auflisten / primären Agent wechseln |
| `/models [filter]` · `/model <ref>` | Katalog durchsuchen / Modell festlegen |
| `/auth login <provider>` | einen API-Schlüssel hinterlegen (BYOK) |
| `/skills` · `/tools` | Skills / Tools auflisten |
| `/status` | Sitzung, Kontext-%, Kosten, Sprache |
| `/compact` | ältere Historie zusammenfassen, um Kontext freizugeben |
| `/voice [on\|off]` | Text-to-Speech umschalten |
| `/init` | `AGENTS.md` für dieses Repo generieren |
| `/review [target]` | einen Code-Review dispatchen |
| `/new` · `/sessions` · `/resume <n>` | Sitzungsverwaltung |
| `/export [file]` | das Transkript nach Markdown schreiben |
| `!<cmd>` | selbst einen Shell-Befehl ausführen |
| `@file` | eine Datei an deinen Prompt anhängen |

Mehrzeilige Eingabe: eine Zeile mit `\` beenden oder einen ` ``` `-Codeblock öffnen. Tab-Vervollständigung für Befehle und Agents; der Eingabeverlauf bleibt über Sitzungen hinweg erhalten.

### Eigene Befehle

Lege Markdown in `.coven/commands/` ab — mit OpenCode-kompatibler Semantik:

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

`$ARGUMENTS` / `$1..$N`-Platzhalter, `` !`cmd` ``-Shell-Injection (berechtigungsgesteuert) und `@file`-Anhänge (auf Eingrenzung und Geheimnisse geprüft).

## Kontextverwaltung

- **Buchhaltung** — die vom Provider gemeldete Nutzung ist die Grundwahrheit; die Statuszeile zeigt den Live-Kontext-% gegenüber dem tatsächlichen Fenster des Modells.
- **Pruning zuerst** (günstig, kein LLM-Aufruf) — alte Tool-Ausgaben jenseits eines geschützten Aktualitätsbudgets von 40k Token werden maskiert; die Aufrufe und Argumente bleiben sichtbar. Nichts wird gelöscht; Masken erfolgen zur Render-Zeit und sind reversibel.
- **Kompaktierung als Zweites** — bei Überlauf werden die älteren Züge vom kleinen Modell in eine rollierende *verankerte Zusammenfassung* überführt, während die jüngsten Züge wörtlich erhalten bleiben. `/compact` löst dies manuell aus.
- **Cache-freundlich** — der Nachrichtenspeicher ist append-only; das Prompt-Caching von Anthropic erhält rollierende Breakpoints (0,1×-Eingabepreis beim erneuten Lesen der Historie).

## Sprache

`/voice on` spricht die Antworten des Assistenten aus. Die Backends werden automatisch in dieser Reihenfolge erkannt: OpenAI TTS (`gpt-4o-mini-tts`, wenn `OPENAI_API_KEY` + ein Player vorhanden sind) → macOS `say` → Linux `piper` / `spd-say` / `espeak-ng` → Windows PowerShell SAPI. Null Konfiguration, null Abhängigkeiten; `COVEN_TTS=off|say|espeak|…` überschreibt. Das Unterbrechen der Sitzung stoppt die Sprachausgabe sofort.

## Berechtigungen

Geordnete Regeln, **letzter Treffer gewinnt** (Baseline → Agent → deine Konfiguration → Sitzungsfreigaben):

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

Immer aktiv: Bash-Kommando-Scanning (`rm -rf`, Force-Push, `curl | sh`, `sudo` fragen immer nach), symlink-aufgelöste Pfad-Eingrenzung, Doom-Loop-Erkennung, `.env` fragt nach / Schlüsselmaterial wird verweigert. Jede Nachfrage wird mit `once`, `always` (bleibt für die Sitzung bestehen) oder `reject` beantwortet — mit einer Rückmeldung, die direkt an das Modell zurückgeht.

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

Hooks folgen einer Konvention: `(input, output) => void` — mutiere `output` an Ort und Stelle. Ein funktionierendes Beispiel findest du in `.coven/plugins/audit-log.ts`.

## Konfiguration

`coven.json` (Projekt, gefunden durch Aufwärtslaufen vom cwd) wird über `~/.config/coven/coven.json` (global) gemergt:

| Schlüssel | Was |
|---|---|
| `model` / `small_model` | `"provider/model"` — das kleine Modell übernimmt die Kompaktierung |
| `default_agent` | Start-Agent der Sitzung (Standard `builder`) |
| `agent.<name>` | Agents überschreiben/hinzufügen: `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | Der Regelsatz |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Erweiterungen |
| `max_steps` | Obergrenze der Agenten-Iterationen pro Zug (Standard 100) |

## Architektur

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

Abhängigkeiten zeigen ausschließlich nach unten. Die Sitzungsschleife besitzt die Tool-Ausführung: validieren (zod) → Berechtigungs-Gate → Plugin `before` → ausführen → Plugin `after` → zurückspeisen. Ein Subagent ist eine bis zum Abschluss ausgeführte Kindsitzung.

## Entwicklung

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Mitwirken

Issues und PRs sind willkommen. Coven folgt seiner eigenen Methodik — Design vor Code, TDD, Verifikation vor Abschluss; die Skills in `.coven/skills/` dokumentieren sie. Neues Verhalten landet mit einem Test im selben Commit; Conventional Commits; zwei Laufzeitabhängigkeiten, und das bleibt bewusst so.

Wenn du etwas baust, das „coven“ im Namen trägt, füge bitte einen Hinweis hinzu, der klarstellt, dass es nicht mit diesem Projekt verbunden ist.

## Lizenz

[MIT](./LICENSE)
