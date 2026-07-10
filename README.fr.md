<p align="center">
  <a href="https://github.com/jai-krishna-0921/coven">
    <picture>
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="https://raw.githubusercontent.com/jai-krishna-0921/coven/main/assets/logo-light.svg" alt="coven" width="360">
    </picture>
  </a>
</p>

<p align="center">Un cénacle d'agents de code dans votre terminal.</p>

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

Coven est un assistant de code IA fonctionnant dans le terminal, construit autour de quatre idées :

1. **Plusieurs agents, pas un seul.** Onze spécialistes intégrés — un conductor qui orchestre, plus planner, builder, researcher, debugger, optimizer, reviewer, tester, architect, scribe et guardian — chacun avec sa propre charte, son propre modèle et sa propre laisse de permissions. Les sous-agents sont dispatchés en parallèle. Ajoutez les vôtres à l'aide d'un fichier markdown.
2. **Les compétences plutôt que les prompts.** Une méthodologie réutilisable (TDD, débogage systématique, dispatch parallèle, vérification avant complétion) est livrée sous forme de compétences à la demande, avec des tables de rationalisation et des listes de signaux d'alerte — divulgation progressive, plutôt que surcharge du prompt système.
3. **Les garde-fous comme architecture.** Chaque appel d'outil passe par un moteur de permissions, un scanner de commandes bash, un confinement des chemins résistant aux liens symboliques et un détecteur de boucles infernales. Les plugins peuvent tout observer et opposer leur veto.
4. **Un contexte qui se gère lui-même.** Comptabilisation des tokens rapportée par le fournisseur, élagage de type DCP des sorties d'outils obsolètes et compaction par résumé ancré glissant — les longues sessions restent nettes au lieu de mourir au mur du contexte.

Construit avec [Bun](https://bun.sh) + TypeScript, livré sous forme de binaire Node ≥ 20. Deux dépendances d'exécution (`@anthropic-ai/sdk`, `zod`).

## Installation

```bash
npm install -g thecoven          # the binary is `coven`
# or
bun install -g thecoven
pnpm add -g thecoven
```

Depuis les sources :

```bash
git clone https://github.com/jai-krishna-0921/coven && cd coven
bun install && bun run dev
```

## Démarrage rapide

```bash
export ANTHROPIC_API_KEY=sk-ant-…   # or: coven auth login anthropic
coven                                # interactive session
```

Mode ponctuel :

```bash
coven run -p "explain src/session/loop.ts" --agent researcher
coven run -p "add input validation to the config loader" --yes
```

## Apportez votre propre clé

```bash
coven auth login anthropic     # stored in ~/.local/share/coven/auth.json (mode 0600)
coven auth list                # env vars are detected too
coven models                   # live catalog from models.dev (cached, offline fallback)
coven models openrouter
```

N'importe quel point de terminaison compatible OpenAI fonctionne via la configuration — `openai`, `groq`, `openrouter` et `ollama` ont des URL de base intégrées :

```jsonc
// coven.json
{ "model": "ollama/qwen3-coder", "provider": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }
```

Les fenêtres de contexte et la tarification proviennent du catalogue, si bien que la ligne d'état affiche le coût réel et l'utilisation du contexte par session.

## Le coven

| Agent | Mode | Charte |
|---|---|---|
| `conductor` | primary | Décompose les objectifs, dispatche les spécialistes **en parallèle**, intègre |
| `builder` | primary | Implémentation, tests d'abord (par défaut) |
| `planner` | all | Design approuvé → plan de tâches TDD à petites bouchées |
| `researcher` | subagent | Reconnaissance en lecture seule avec preuves |
| `debugger` | all | Débogage de la cause racine en quatre phases |
| `optimizer` | all | Mesurer → changer une seule chose → mesurer |
| `reviewer` | subagent | Conformité à la spécification + qualité du code, verdicts séparés |
| `tester` | all | Couverture comportementale et chasse aux cas limites |
| `architect` | subagent | Design d'interfaces et enregistrement des décisions |
| `scribe` | subagent | Documentation vérifiée par rapport aux sources |
| `guardian` | subagent | Audit de sécurité : injection, traversée, fuites, contournements |

Changez l'agent principal avec `/agent <name>`. Les sous-agents sont dispatchés par les agents via l'outil `task` — chacun s'exécute dans une session enfant isolée avec son propre jeu de règles de permissions et rend compte. Les appels `task` consécutifs dans un même tour s'exécutent **de manière concurrente**.

Les agents personnalisés sont des fichiers markdown dans `.coven/agents/` :

```markdown
---
name: shipwright
description: Release engineering — versioning, changelogs, tags
mode: subagent
---
You are the Shipwright. …
```

## Dans la session

| Commande | Fait |
|---|---|
| `/agents` · `/agent <name>` | liste les agents / change l'agent principal |
| `/models [filter]` · `/model <ref>` | parcourt le catalogue / définit le modèle |
| `/auth login <provider>` | stocke une clé API (BYOK) |
| `/skills` · `/tools` | liste les compétences / outils |
| `/status` | session, % de contexte, coût, voix |
| `/compact` | résume l'historique ancien pour libérer du contexte |
| `/voice [on\|off]` | active/désactive la synthèse vocale |
| `/init` | génère `AGENTS.md` pour ce dépôt |
| `/review [target]` | dispatche une revue de code |
| `/new` · `/sessions` · `/resume <n>` | gestion des sessions |
| `/export [file]` | écrit la transcription en markdown |
| `!<cmd>` | exécute vous-même une commande shell |
| `@file` | attache un fichier à votre prompt |

Saisie multiligne : terminez une ligne par `\` ou ouvrez une clôture ` ``` `. Complétion par tabulation pour les commandes et les agents ; l'historique de saisie persiste entre les sessions.

### Commandes personnalisées

Déposez du markdown dans `.coven/commands/` — sémantique compatible OpenCode :

```markdown
---
description: Run tests with coverage and suggest fixes
agent: builder
---
Run the full test suite with coverage. Focus on failures: !`bun test 2>&1 | tail -20`
Then look at @package.json and suggest fixes for $ARGUMENTS.
```

Espaces réservés `$ARGUMENTS` / `$1..$N`, injection shell `` !`cmd` `` (soumise aux permissions) et pièces jointes `@file` (vérifiées pour le confinement et les secrets).

## Gestion du contexte

- **Comptabilisation** — l'utilisation rapportée par le fournisseur fait foi ; la ligne d'état affiche le % de contexte en direct par rapport à la fenêtre réelle du modèle.
- **Élagage d'abord** (peu coûteux, sans appel LLM) — les anciennes sorties d'outils au-delà d'un budget de récence protégé de 40k tokens sont masquées ; les appels et leurs arguments restent visibles. Rien n'est supprimé ; les masques sont appliqués au moment du rendu et réversibles.
- **Compaction ensuite** — en cas de débordement, les tours plus anciens sont résumés en un *résumé ancré* glissant par le petit modèle, en conservant les tours les plus récents mot pour mot. `/compact` la déclenche manuellement.
- **Compatible avec le cache** — le magasin de messages est en ajout seul ; la mise en cache des prompts d'Anthropic obtient des points de rupture glissants (prix d'entrée à 0,1× lors des relectures de l'historique).

## Voix

`/voice on` énonce les réponses de l'assistant. Les backends sont détectés automatiquement dans cet ordre : OpenAI TTS (`gpt-4o-mini-tts`, lorsque `OPENAI_API_KEY` + un lecteur sont présents) → `say` sur macOS → `piper` / `spd-say` / `espeak-ng` sur Linux → SAPI PowerShell sur Windows. Zéro configuration, zéro dépendance ; `COVEN_TTS=off|say|espeak|…` prend le dessus. Interrompre la session arrête immédiatement la parole.

## Permissions

Règles ordonnées, **la dernière correspondance l'emporte** (référence → agent → votre configuration → approbations de session) :

```jsonc
{
  "permission": {
    "bash": { "*": "ask", "git status": "allow", "git push": "ask" },
    "edit": "allow",
    "webfetch": { "*": "ask", "docs.anthropic.com": "allow" }
  }
}
```

Toujours actifs : analyse des commandes bash (`rm -rf`, force-push, `curl | sh`, `sudo` demandent toujours), confinement des chemins avec résolution des liens symboliques, détection de boucles infernales, `.env` demande / matériel de clé refusé. Chaque demande reçoit la réponse `once`, `always` (persiste pour la session) ou `reject` — avec un retour qui repart directement vers le modèle.

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

Les hooks suivent une seule convention : `(input, output) => void` — mutez `output` sur place. Voir `.coven/plugins/audit-log.ts` pour un exemple fonctionnel.

## Configuration

`coven.json` (projet, découvert en remontant depuis le cwd) fusionné par-dessus `~/.config/coven/coven.json` (global) :

| Clé | Quoi |
|---|---|
| `model` / `small_model` | `"provider/model"` — le petit modèle gère la compaction |
| `default_agent` | Agent de départ de la session (par défaut `builder`) |
| `agent.<name>` | Surcharge/ajout d'agents : `model`, `prompt`, `steps`, `permission`, `disable` |
| `provider.<id>` | `apiKeyEnv`, `baseUrl`, `protocol: "anthropic" \| "openai"` |
| `permission` | Le jeu de règles |
| `tts` | `{ backend, voice, rate, openaiVoice, openaiModel }` |
| `plugins` / `instructions` / `skills.paths` | Extensions |
| `max_steps` | Plafond d'itérations agentiques par tour (par défaut 100) |

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

Les dépendances pointent uniquement vers le bas. La boucle de session possède l'exécution des outils : valider (zod) → contrôle des permissions → plugin `before` → exécuter → plugin `after` → retour d'information. Un sous-agent est une session enfant menée jusqu'à son terme.

## Développement

```bash
bun test              # 200 tests, incl. a loop integration suite with a fake provider
bun run typecheck     # strict tsc
bun run build         # node-compatible bundle → dist/index.js
node dist/index.js --version   # verify the published artifact under plain node
```

## Contribuer

Les issues et les PR sont les bienvenues. Coven suit sa propre méthodologie — design avant code, TDD, vérification avant complétion ; les compétences dans `.coven/skills/` la documentent. Tout nouveau comportement arrive avec un test dans le même commit ; commits conventionnels ; deux dépendances d'exécution et cela reste délibéré.

Si vous construisez quelque chose utilisant « coven » dans son nom, veuillez ajouter une note précisant que ce n'est pas affilié à ce projet.

## Licence

[MIT](./LICENSE)
