# Coven TUI 2.0 — full-screen shell, command surface, onboarding

- **Status:** approved design → spec
- **Date:** 2026-07-12
- **Scope owner cycle:** slice #1 of 4 ("everything OpenCode is") — the full-screen TUI shell
  **plus** the complete slash-command surface. Slices #2 LSP, #3 MCP, #4 share/timeline are
  explicitly out (their sidebar panels render as framed stubs).
- **Engine chosen by user:** Ink (React reconciler for terminals). This deliberately overrides
  Coven's "2 runtime deps" rule; each new dependency is justified in §3 and must be repeated in
  the commit body.

---

## 1. Goal

Replace Coven's line-based REPL with a full-screen, alternate-screen terminal application — the
whole terminal becomes Coven, the way OpenCode does — with:

1. A **home splash** for empty sessions (centered logo, "Ask anything…" input, `Build · model ·
   provider` line, hint row, version).
2. **Inline slash-command autocomplete** that narrows as you type (`r` → all `r…`, `ra` → `ra…`,
   `/` → everything), plus a full `ctrl+p`/`ctrl+k` **command palette**.
3. An **interactive Help guide** (navigable, searchable) and a which-key cheatsheet.
4. A **first-run onboarding wizard** (theme → accent → layout/density → glyph style →
   connector+key) with live preview — a Coven-native feature OpenCode does not have.
5. **7 built-in themes**, live-previewable and persisted.
6. A **four-region layout** (header · body+sidebar · footer/status · modal layer) with dialogs
   for sessions, models, agents, themes, skills, permission, status, confirm, prompt.
7. Everything **understandable at a glance**: hint rows, clear empty/loading/error states, and a
   "no connector yet" banner that guides the user to set a key.

The engine (session loop, bus, permissions, store, providers, catalog, auth, tts, commands) is
untouched except for the three small additions in §5. `coven run -p` and piped/non-TTY usage keep
working unchanged.

## 2. Scope

### In
Full-screen Ink shell; home splash; transcript with streaming text, reasoning, tool lines, inline
edit diffs; multiline prompt editor with history, `@file`, `!shell`, and inline autocomplete;
unified command surface (UI-action commands + template commands) reachable by palette and by
typing `/`; interactive Help + which-key; theme system (7 themes) + glyph/border styles +
persistence; onboarding wizard; live model/agent switching; dialogs listed in §12; sidebar with a
real Context panel and a real Modified-Files panel; permission-ask prompting; non-TTY fallback;
engine `setModel`/`setAgent` + `session.model`; publishing `session.updated`.

### Out (later slices / YAGNI)
Real LSP diagnostics (panel is a framed stub reading "LSP — later"); real MCP client (panel stub);
session share links; timeline / fork / undo-redo; workspaces; UI plugin-slot extensibility;
syntax highlighting of code blocks (rendered as themed-plain text this cycle); a full modal
diff-viewer with hunk navigation (inline diffs only); mouse support; clipboard copy of messages.

## 3. Dependencies

Runtime, added (build marks them **external** — see §18 — so they install from `node_modules`,
not bundled):

| Package | Version | Justification |
|---|---|---|
| `ink` | `^7.1.0` | Terminal React reconciler: `render(…,{alternateScreen})`, flexbox layout (Yoga), `useInput`, `useWindowSize`, `useCursor`, `position:"absolute"` overlays. Verified present in 7.1.0. The chosen engine. |
| `react` | `19.2.x` (pinned) | Peer of Ink 7 (`>=19.2.0`). Component model + hooks. |
| `fuzzysort` | `^3` | Zero-dependency fuzzy matcher for the palette and file/@ autocomplete; returns match indices for highlight. Tiny. |

Dev, added:

| Package | Version | Justification |
|---|---|---|
| `@types/react` | `19.2.x` | Types for the `.tsx` sources. |
| `ink-testing-library` | `^4` | Render Ink components in `bun test`, drive stdin, assert `lastFrame()`. |

No `ink-spinner`, `ink-text-input`, `ink-big-text`, `ink-gradient`, `ink-select-input` — all
hand-rolled to keep the footprint deliberate (spinner via a frame timer; input/select/logo are
first-class components we own).

Runtime dep count goes 2 → 5 (`@anthropic-ai/sdk`, `zod`, `ink`, `react`, `fuzzysort`).

## 4. Architecture

### 4.1 Module map (all new files under `coven/src/tui/`)

```
tui/
  index.ts            runTui(app): Promise<void>            — entry; TTY→Ink, else fallback
  fallback.ts         runFallbackRepl(app): Promise<void>   — minimal readline loop (non-TTY)
  app.tsx             <App app> — root layout + modal layer + global keymap wiring
  store.ts            UiStore — external store (useSyncExternalStore); bus→state; delta throttle
  types.ts            UiState, ModalKind, PaletteItem, CommandContext, ToastKind (interfaces)
  theme.ts            Theme, THEMES (7), ThemeProvider, useTheme, glyph/border helpers
  prefs.ts            UiPrefs, loadPrefs(), savePrefs(), prefs file path
  keymap.ts           KeyAction, resolveKey(input, key, ctx): KeyAction | null  (pure)
  commands.ts         buildPaletteItems(ctx): PaletteItem[] + runCommandSubtask()  (UI + template)
  autocomplete.ts     completionsFor(input, cursor, items, files): Completion[]  (pure; prefix→fuzzy)
  glyphs.ts           ICONS record keyed by iconSet; logo ASCII/block; border sets
  input/
    editor.tsx        <PromptEditor> — controlled multiline buffer + cursor + autocomplete popover
    history.ts        InputHistory — persisted at ~/.local/share/coven/history
    buffer.ts         TextBuffer — pure cursor/edit model (insert/delete/word/line ops)
  components/
    Header.tsx        logo · model · agent · title
    Home.tsx          splash for empty sessions
    Transcript.tsx    bottom-anchored scroll viewport (history+live) — NO Static (alt-screen has no scrollback)
    Message.tsx       renders one Message (text/reasoning/tool parts)
    ToolLine.tsx      one tool call (spinner→✓/✗, title, timing)
    Diff.tsx          inline unified diff (edit tool)
    Markdown.tsx      minimal markdown → themed <Text> (headings, bold, code, lists)
    Sidebar.tsx       Context (real) · Modified Files (real) · Todo/LSP/MCP (stub)
    Footer.tsx        help hint · context · cost · diagnostics · model
    Spinner.tsx       frame-timer spinner (no dep)
    Banner.tsx        connector-missing / info banners
  dialogs/
    ModalLayer.tsx    renders the active dialog centered/absolute, last child
    Select.tsx        <SelectDialog> generic filterable single-select (base for most)
    Palette.tsx       command palette (ctrl+p / ctrl+k)
    Help.tsx          interactive help guide (categories + search)
    WhichKey.tsx      keybinding cheatsheet
    Sessions.tsx      session switcher
    Models.tsx        model picker (catalog-backed, grouped by provider)
    Agents.tsx        agent picker (primaries)
    Themes.tsx        theme picker with live preview
    Skills.tsx        skill browser (name + description + body preview)
    Permission.tsx    permission ask prompt (once/always/reject + feedback)
    Confirm.tsx       yes/no
    Prompt.tsx        single-line text input (e.g. rename, key entry)
    Status.tsx        status view (session, context, cost, model, agent, tts, connectors)
  onboarding/
    Wizard.tsx        <OnboardingWizard onDone> — 5 steps, live preview
    steps.tsx         Theme, Accent, Layout, Glyphs, Connector step components
    nerdfont.ts       detectNerdFont(): 'likely'|'unlikely'|'unknown'  (best-effort)
```

### 4.2 Layering

`index.ts` → `app.tsx` → (`store.ts`, `theme.ts`, `prefs.ts`, `keymap.ts`, `commands.ts`) →
components/dialogs/onboarding. Only `store.ts` and `commands.ts` touch `App`/engine; components
receive data via props and `useUi()`/`useTheme()` hooks. Dependencies point downward; components
never import each other's siblings except through `types.ts`.

### 4.3 Data flow

```
engine (unchanged)
  │  bus.publish(BusEvent)                 store.get / engine.contextInfo (pull)
  ▼                                              ▲
UiStore  ── subscribe(bus) ──▶ reduce ──▶ snapshot(UiState) ──┐
  │  (throttle part.delta to ~25ms)                           │ useSyncExternalStore
  ▼                                                           ▼
App/components render ──▶ user key ──▶ keymap ──▶ CommandContext.run / editor edits
                                             │
                                             ▼
                                    engine.prompt / permissions.reply / engine.setModel …
```

The UI is a **pure function of `UiState` + `UiPrefs` + `Theme`**. All engine mutation goes through
`CommandContext` (§10.2). The store is the only bus subscriber inside the UI.

## 5. Engine / config additions (outside `tui/`)

Minimal, additive, independently testable.

### 5.1 `session/types.ts`
Add one optional field to `SessionInfo`:
```ts
model?: string;   // per-session model override "provider/model-id"; undefined = inherit
```

### 5.2 `session/loop.ts` — per-turn override + model precedence
Add an optional 4th arg to `prompt` (backward-compatible; `runPrintMode` still calls it with 3):
```ts
async prompt(sessionID, text, abort, override?: { agent?: string; model?: string }): Promise<Message>
```
`prompt` resolves the agent as `agents.get(override?.agent ?? session.agent)`; it passes `override`
into `runLoop`. In `runLoop` (session already fetched fresh at line 184) the model precedence
becomes:
```ts
const modelRef = override?.model ?? session.model ?? agent.model ?? this.o.config.model ?? DEFAULT_MODEL;
```
`prompt()` already re-reads `store.get(sessionID)` each turn, so a *persisted* switch (§5.3) takes
effect next turn; `override` gives a *single-turn* switch that leaves the session record untouched.

### 5.3 `SessionEngine` — two persistent setters + one event
```ts
setModel(sessionID: string, modelRef: string): SessionInfo
// validates modelRef contains "/"; updates store record .model; publishes session.updated; returns it.

setAgent(sessionID: string, agentName: string): SessionInfo
// throws if agents.get(agentName) is undefined or not user-drivable (mode primary|all);
// updates store record .agent; publishes session.updated; returns it.
```
Both call `store.update(next)` then `bus.publish({ type: "session.updated", session: next })`.
`session.updated` is already declared in `BusEvent` but never published today; this begins
publishing it. The headless `runPrintMode` ignores it (no behavior change).

`setModel` does **not** call `providers.resolve` (which throws when a key is missing) — validation
is limited to shape, so switching to a keyless provider is allowed and only errors at send time,
matching current behavior. These setters are how the Models/Agents dialogs persist a choice;
one-turn overrides (from a template command's `def.agent`/`def.model`) go through the §5.2
`override` arg instead.

## 6. UiStore (`store.ts`)

### 6.1 State
```ts
interface UiState {
  session: SessionInfo;            // live copy (id, title, agent, model, usage, cost)
  history: Message[];              // completed messages (rendered in the scroll viewport)
  live: Message | null;            // the in-flight assistant message
  status: "idle" | "busy" | "error";
  compacting: boolean;
  context: { tokens: number; usable: number; pct: number };
  permission: PermissionRequest | null;   // head of the ask queue (serialized)
  modal: { kind: ModalKind; props?: ModalProps } | null;
  reonboarding: boolean;           // /onboarding re-run: render the wizard as a full-screen route
  sidebarOverlay: boolean;         // narrow-terminal sidebar shown as a non-capturing overlay
  scrollOffset: number;            // rows scrolled up from the tail; 0 = following the live tail
  toast: { text: string; kind: ToastKind } | null;   // transient, auto-clears
  changedFiles: string[];          // workspace-relative paths edited/written this session (deduped)
  connectorReady: boolean;         // any resolvable key for the active model's provider
}
type ModalKind =
  | "palette" | "help" | "whichkey" | "sessions" | "models" | "agents"
  | "themes" | "skills" | "permission" | "status" | "confirm" | "prompt";
type ToastKind = "info" | "success" | "warn" | "error";
```

### 6.2 Class
```ts
class UiStore {
  constructor(app: App, sessionID: string)
  subscribe(cb: () => void): () => void      // for useSyncExternalStore
  getSnapshot(): UiState
  // imperative UI actions (not bus-driven):
  openModal(kind: ModalKind, props?: unknown): void
  closeModal(): void
  toast(text: string, kind?: ToastKind): void
  replyPermission(reply: "once" | "always" | "reject", feedback?: string): void
  setSessionID(id: string): void             // on new/switch session: rebind + reload history
  appendSynthetic(message: Message): void    // push a display-only message (e.g. subtask result)
  setReonboarding(on: boolean): void         // /onboarding re-run route toggle
  dispose(): void                            // unsubscribe bus + clear timers
}
```

### 6.3 Bus → state reducer
Subscribes once to `app.bus`. Mapping (only events for the active `session.id`, except errors):

| Event | Effect |
|---|---|
| `session.status {status}` | set `status`; on `idle` → flush `live`→`history`, then pull `context` (`engine.contextInfo`) + `session` (`store.get`) |
| `message.created` role=user | append to `history` |
| `message.created` role=assistant | set `live` = that message |
| `part.delta {delta}` | append to buffered text of `live`'s streaming part (throttled) |
| `part.updated {part}` | replace/insert matching part in `live` (tool args/titles/output); if `part.type==="tool"` && `part.tool ∈ {edit, write}`, add its `args.filePath`/`args.path` (workspace-relative) to `changedFiles` (deduped) — `part.updated` is the only event carrying the tool args; `tool.finished` does not |
| `tool.started` | ensure a `tool` part exists in `live` with status running + start time |
| `tool.finished {status}` | mark tool part done (line-count `+/−` deltas are deferred; §15) |
| `session.compacting` | `compacting = true`; toast "compacting context…" |
| `session.compacted` | `compacting = false`; pull `context`; toast "context compacted" |
| `session.updated {session}` | replace `session` (drives header model/agent/title live) |
| `session.created` (subagent, parent = active) | toast "▸ dispatched <agent>" |
| `permission.asked {request}` | enqueue; if head, set `permission` |
| `permission.replied` | if it was the head, dequeue → next `permission` (or null) |

**Delta throttling:** `part.delta` appends to an in-memory buffer; a 25 ms timer coalesces buffered
text into a new snapshot and notifies subscribers. `session.status idle` forces an immediate flush.
This prevents per-token re-render storms (Ink pitfall).

**Permission serialization + ghost guard:** the queue head is surfaced; before surfacing, drop any
request no longer in `app.permissions.pendingRequests()` (a wave-mate `always`/cascade-`reject` may
have settled it). `replyPermission` calls `app.permissions.reply(head.id, reply, feedback)`.

**Subtask (child) sessions — the `session.id` filter is intentional.** A template command with
`subtask: true` runs in a *child* session (its own `sessionID`, `parentID = active`), so all of its
`message.*`/`part.*`/`tool.*` events fail the active-session filter and are dropped by the reducer —
by design. Their output does **not** stream live this cycle. Instead `runCommandSubtask` (§9.2)
awaits the child's final `Message` and the UI appends a **display-only synthetic assistant
`Message`** (a normal `text` part, prefixed with the command label) to `UiState.history` via a new
store method `appendSynthetic(message: Message)`. This synthetic message is UI-only — it is **not**
persisted to the parent session store, and it needs **no new `Part` variant** (it reuses `text`).
Live nested streaming of subtasks is a later enhancement (would require the reducer to also fold
events whose `parentID === active.id` into a dedicated part). While the child runs, the footer/spinner
shows `▸ <label> (<agent>)…`.

### 6.4 Context/cost pull
`context` and `session.usage/cost` are **pulled** (no bus event carries them). Pull on
`session.status idle`, `session.compacted`, and `session.updated`. During streaming the footer
shows the last known values (matches OpenCode).

## 7. Layout (`app.tsx`)

`render(<App app={app}/>, { alternateScreen: true, exitOnCtrlC: false, patchConsole: true })`.
Root sized from `useWindowSize()`:

```
<Box flexDirection="column" width={cols} height={rows}>
  <Header/>                               // 1 row (+1 rule)
  <Box flexGrow flexDirection="row">
    <Body/>                               // flexGrow: Home (empty) or Transcript
    {sidebar && <Sidebar/>}               // fixed width 32, hidden < 90 cols unless toggled
  </Box>
  <Footer/>                               // always rendered (useful on home too)
  <PromptEditor/>                         // 1–N rows (grows with multiline, capped)
  {modal && <ModalLayer/>}                // absolute, full-size, centered — LAST child
</Box>
```

- **Top-level route:** `app.tsx` renders the `<OnboardingWizard/>` (full-screen, replacing the
  whole layout — *not* a modal) when `!prefs.onboarded || uiState.reonboarding`; otherwise the
  layout below. Onboarding is therefore **not** a `ModalKind` and does not interact with input
  gating.
- The **modal layer** is the last sibling with `position="absolute" width="100%" height="100%"`,
  a centered bordered box with an explicit `backgroundColor` (opaque mask). When `modal` is set,
  the body/editor `useInput` is gated `isActive={false}`; the modal owns the keyboard.
- On terminals `< 90` cols the sidebar, when toggled on (`uiState.sidebarOverlay`), renders as an
  absolute overlay using the same positioning technique — but it is a **non-capturing** visual
  overlay tracked by the sidebar toggle, **not** `UiState.modal`; input is *not* gated, and
  `ctrl+b`/`esc` dismiss it. This keeps it distinct from dialogs.
- **Home vs Transcript:** if `history.length === 0 && !live`, Body renders `<Home/>` (splash);
  otherwise `<Transcript/>`.

### 7.1 Header
`◆ coven   <model-short>  ·  <agent>  ·  <title>` — accent logo left, dim metadata right, one rule
line below in `theme.border`. Reflects `session.updated` live.

### 7.2 Footer / status bar
Single row, matching the screenshots:
`? help │ ⛁ <tokens> (<pct>%) │ $<cost> │ <diagnostics> │ <model>`
- `diagnostics`: this cycle always `✓ no diagnostics` (LSP is a later slice) — real once slice #2
  lands.
- Colors: pct ≥ 80 → warning, ≥ 95 → error. Cost formatted `$0.00`. Glyphs swap per icon set.

### 7.3 Home splash (`Home.tsx`)
Centered vertically: the block/ASCII `coven` logo (per glyph pref), then a bordered input hint box
showing `Ask anything…  "fix the failing test"`, a line `<agent> · <model> · <provider>`, a dim
hint row `tab agents · ctrl+p commands · ? help`, and the version bottom-right. The real
`<PromptEditor/>` sits below and is where typing actually happens; the box is illustrative and
disappears once typing starts.

## 8. Prompt editor + inline autocomplete

### 8.1 `TextBuffer` (`input/buffer.ts`, pure)
Cursor/edit model over `string[]` lines: `insert(str)`, `backspace()`, `delete()`,
`moveLeft/Right/Up/Down()`, `home()/end()`, `wordLeft()/wordRight()`, `deleteWordLeft()`,
`killToLineStart()`, `value(): string`, `setValue(v)`, `cursor(): {row,col}`. No I/O. Fully unit
tested.

### 8.2 `<PromptEditor>` (`input/editor.tsx`)
Controlled via `TextBuffer`; renders lines with a themed cursor glyph (real cursor positioned via
`useCursor().setCursorPosition`, x computed with a wcwidth helper for CJK/emoji). Behaviors:
- **Submit** `enter` (unless an autocomplete item is highlighted → completes instead); **newline**
  `shift+enter` / `ctrl+j` / trailing `\`.
- **History** `up`/`down` when the buffer is empty or cursor on first/last line; persisted via
  `InputHistory` (reuses `~/.local/share/coven/history`).
- **`!cmd`** at buffer start → on submit, runs the shell escape (permission-gated, unchanged
  semantics) instead of sending.
- **`@file`** tokens expand on submit (unchanged `readAttachment` path).
- **Autocomplete popover** (below the input): see §8.3.

### 8.3 Inline autocomplete (`autocomplete.ts`, pure) — the explicit narrowing requirement
```ts
interface Completion { value: string; label: string; hint?: string; kind: "command" | "file"; matched?: number[]; }
function completionsFor(input: string, cursor: number, items: PaletteItem[], files: () => string[]): Completion[]
```
"Current token" = the whitespace-delimited run of characters containing the cursor. Trigger and
narrowing:
- The trimmed buffer starts with `/` **and** the cursor is within the first token → **command**
  completions (slash commands are only valid at buffer start). `"/"` → **all** commands (title +
  category). `"/r"` → every command whose slash-name starts with `r` (prefix match, case-insens),
  ranked before fuzzy sub-matches. `"/ra"` → narrows to those starting with `ra`. Each keystroke
  re-filters live.
- Current token starts with `@` (anywhere in the buffer) → **file** completions
  (workspace-relative, prefix then fuzzy, secret/`.env` files excluded per `readAttachment` rules).
- Popover shows up to 8 rows: `name` + dim `description`, matched chars highlighted (fuzzysort
  indices). `up`/`down` (or `ctrl+p`/`ctrl+n`) move; `tab` completes the token; `enter` completes
  (does not submit); `esc` dismisses. Empty result → popover hidden.

Prefix matches always sort above fuzzy matches so the "type r → r… , type ra → ra…" behavior is
exact and predictable, with fuzzy as a fallback for non-prefix hits.

## 9. Command surface (`commands.ts`)

### 9.1 `PaletteItem`
```ts
interface PaletteItem {
  id: string;                 // "session.new" | "cmd:init"
  title: string;              // "New session"
  slash: string;              // "new"  (what you type after "/")
  category: PaletteCategory;  // System|Session|Model|Agent|Theme|View|Voice|Prompt|Skill|Auth|Custom
  keybinding?: string;        // "ctrl+n" (display only)
  aliases?: string[];         // e.g. ["clear"] for /new
  run(ctx: CommandContext): void | Promise<void>;
  enabled?(ctx: CommandContext): boolean;
}
```

### 9.2 Sources merged by `buildPaletteItems(ctx)`
1. **Builtin UI-action items** (defined here):
   - System: `help`, `whichkey`, `status`, `clear` (redraw), `quit`, `onboarding` (re-run wizard)
   - Session: `new`, `sessions`, `resume`, `compact`, `export`, `rename`, `interrupt`
   - Model: `models` (picker), `model <ref>` (direct set)
   - Agent: `agents` (picker), `agent <name>` (direct set), agent cycle
   - Theme: `themes` (picker), `theme-toggle` (light/dark sibling)
   - View: `sidebar` (toggle), `density`
   - Voice: `voice` (toggle TTS `enabled`; disabled when `tts.backend === null`)
   - Prompt/Skill: `skills` (browser), `init` handled below as template
   - Auth: `login <provider>`, `connectors` (list), `logout <provider>`
2. **Template items** from `app.commands.all()` → one item each, `id = "cmd:"+def.name`,
   `slash = def.name`, category `Custom` (or `Prompt` for builtins init/review). `run(ctx)` first
   calls `app.commands.expand(def, args, { root, gateShell })` → `text`, then routes:
   - `def.subtask` → `await runCommandSubtask(ctx, { agent: def.agent ?? ctx.session.agent, model: def.model, text, label: "/"+def.name })`.
   - else if `def.agent` or `def.model` → `await ctx.send(text, { agent: def.agent, model: def.model })`
     (single-turn override via §5.2's `override` arg — the session record is not changed).
   - else → `await ctx.send(text)`.

   **`runCommandSubtask(ctx, { agent, model, text, label })`** (helper in `commands.ts`):
   1. `const child = app.store.create({ agent, parentID: ctx.session.id, title: label })`
   2. if `model` → `app.engine.setModel(child.id, model)` (so `def.model` is honored — the old
      `Tui.runSubtask` dropped it)
   3. `ctx.store.toast("▸ "+label+" ("+agent+")…")` (running indicator)
   4. `const result = await app.engine.prompt(child.id, text, ctx.abort)` (runs to completion; its
      events target `child.id` and are intentionally ignored by the reducer, §6.3)
   5. `ctx.store.appendSynthetic({ ...result, sessionID: ctx.session.id })` — the child's final
      assistant `Message`, shown labeled in the parent transcript (display-only).

The same list feeds the palette, the `/`-autocomplete, and `/help`.

## 10. Keybindings (`keymap.ts`)

### 10.1 Table (Coven v1 — direct ctrl bindings, matching the screenshots)

| Key | Context | Action |
|---|---|---|
| `ctrl+p`, `ctrl+k` | global | open command palette |
| `?` (empty buffer), `f1` | global | open interactive Help |
| `ctrl+n` | global | new session |
| `ctrl+s` | global | session switcher |
| `ctrl+o` | global | model picker |
| `ctrl+g` | global | agent picker |
| `ctrl+t` | global | theme picker |
| `ctrl+b` | global | toggle sidebar |
| `ctrl+e` | global | open `$EDITOR` to compose |
| `ctrl+f` | global | attach file (opens @ autocomplete seeded) |
| `ctrl+l` | global | clear/redraw screen |
| `tab` / `shift+tab` | empty buffer, no popover | cycle agent fwd/back |
| `tab` | popover open | complete highlighted item |
| `enter` | buffer | submit (or complete if popover item highlighted) |
| `shift+enter`, `ctrl+j` | buffer | newline |
| `up`/`down` | popover open | move selection |
| `up`/`down` | empty/edge buffer | history prev/next |
| `pageup`/`pagedown` | transcript | scroll page |
| `esc` | modal open | close modal |
| `esc` | busy, no modal | interrupt current turn |
| `esc` | popover open | dismiss popover |
| `ctrl+c` | busy | interrupt; twice within 1.5 s → quit |
| `ctrl+c` | idle, non-empty buffer | clear buffer |
| `ctrl+d` | empty buffer | quit |
| within modals | — | `up`/`ctrl+p`, `down`/`ctrl+n`, `pageup/down`, `home/end`, type-to-filter, `enter` select, `esc` close |

Editor line-editing (buffer focused): `left/right/home/end`, `ctrl+a` line-home, `End` line-end,
`backspace/delete`, `ctrl+w` delete word left, `ctrl+u` kill to line start,
`ctrl+left/right` word move.

### 10.2 `CommandContext`
```ts
interface CommandContext {
  app: App;
  store: UiStore;
  session: SessionInfo;
  abort: AbortSignal;                         // the active turn's abort signal (for subtasks/sends)
  send(text: string, override?: { agent?: string; model?: string }): Promise<void>;
  // send = engine.prompt(session.id, text, abort, override) with tts on completion
  openModal(kind: ModalKind, props?: unknown): void;
  closeModal(): void;
  toast(text: string, kind?: ToastKind): void;
  prefs: UiPrefs;
  setPrefs(patch: Partial<UiPrefs>): void;    // merges + savePrefs()
}
```

### 10.3 `resolveKey`
```ts
type KeyAction = { kind: "command"; id: string } | { kind: "builtin"; name: string };
function resolveKey(input: string, key: KeyObject, ctx: KeyContext): KeyAction | null
```
Pure: given the typed `input` string (needed to distinguish e.g. `?`, `!`), the `key` flags, and a
`KeyContext` (`{ modalOpen, busy, popoverOpen, bufferEmpty }`), returns the action or `null` (falls
through to the editor). Unit tested against the table.

**Precedence (first match wins):** (1) if `modalOpen`, only modal-nav keys resolve and `esc`
closes the modal; (2) else if `popoverOpen`, autocomplete-nav keys resolve and `esc` dismisses the
popover; (3) else if `busy`, `esc`/`ctrl+c` interrupt; (4) else global bindings from §10.1; (5)
else `null` → editor. So `esc` = close-modal > dismiss-popover > interrupt.

`ctrl+s` note: raw mode disables terminal XON/XOFF (`IXON`) so `ctrl+s` reaches the app rather than
freezing output. Verified in §18 risks.

## 11. Theme system (`theme.ts`, `glyphs.ts`)

### 11.1 `Theme`
```ts
interface Theme {
  name: string; label: string; mode: "dark" | "light"; light?: string; dark?: string; // sibling for toggle
  bg: string; bgPanel: string; bgOverlay: string;
  fg: string; fgMuted: string; fgSubtle: string;
  border: string; borderFocus: string;
  accent: string; accentAlt: string;
  success: string; warning: string; error: string; info: string;
  roleUser: string; roleAssistant: string;
  agent: string; tool: string; toolOk: string; toolErr: string;
  diffAdd: string; diffDel: string;
  selectionBg: string; selectionFg: string;
}
```
All values are hex; Ink `<Text color>` accepts hex on truecolor terminals and degrades to nearest
256/16 automatically.

### 11.2 Built-ins (`THEMES`) — the Popular bundle (7)
`coven-dark` (default; magenta accent `#c026d3`), `coven-light`, `catppuccin-mocha`, `tokyo-night`,
`gruvbox-dark`, `dracula`, `nord`. Each defines all tokens; `coven-dark`/`coven-light` are marked
as each other's light/dark siblings for `theme-toggle`.

### 11.3 Glyph / border styles (independent of theme, from prefs)
```ts
// glyphs.ts — a closed set of named glyphs; components reference only these keys
ICONS: Record<"nerd" | "ascii", {
  ok: string; err: string; warn: string; info: string;
  tool: string; agent: string; bullet: string; arrow: string;
  prompt: string; spinner: string[]; sidebar: string; context: string;
}>
BORDERS: Record<"unicode" | "ascii", BoxBorderStyle>   // maps to Ink borderStyle or a custom set
LOGO: Record<"block" | "ascii", string>                // multiline coven wordmark
```
`ThemeProvider` supplies `{ theme, icons, borders, logo, density }` via context; `useTheme()`
reads it. Changing theme/glyphs updates prefs and re-renders instantly (live preview uses the same
path).

## 12. Dialogs (`dialogs/`)

All built on `<SelectDialog>` unless noted. Shared nav from §10.1. Opened by `store.openModal`,
closed by `esc`/selection.

| Dialog | Opens via | Contract |
|---|---|---|
| `Palette` | `ctrl+p`/`ctrl+k` | fuzzy list of all `PaletteItem`s grouped by category; footer shows each item's keybinding; `enter` runs `item.run(ctx)`. |
| `Help` (interactive) | `?`/`f1`/`/help` | two-pane: category list (Shortcuts · Commands · Agents · Skills · Permissions · Getting started) + scrollable detail; `/`-search filters across all; not a `SelectDialog` — custom two-pane. |
| `WhichKey` | palette `whichkey` | compact grid of key→action from the §10.1 table. |
| `Sessions` | `ctrl+s` | lists `app.store.list()`; `enter` → `uiStore.setSessionID`; shows title, agent, updated, msg count. |
| `Models` | `ctrl+o` | `catalog.list()` grouped by provider, filterable; shows ctx window + $in/$out; `enter` → `engine.setModel`; marks providers with a resolvable key. |
| `Agents` | `ctrl+g`/palette | `agents.primaries()`; shows mode + description; `enter` → `engine.setAgent`. |
| `Themes` | `ctrl+t` | `THEMES`; **arrow = live preview** (applies to whole UI); `enter` commits to prefs; `esc` reverts. |
| `Skills` | palette `skills` | `skills.all()`; detail pane previews `content`. |
| `Permission` | `permission.asked` | not user-opened; shows `permission → patterns`, `title`, DANGEROUS banner when `metadata.dangerous`; `[y]once [a]always [n]reject`; on reject prompts free-text feedback; calls `uiStore.replyPermission`. |
| `Status` | `/status` | read-only: session id/title, agent, model, context tokens/pct, cost, tts status, connectors (`auth.entries()`). |
| `Confirm` | programmatic | yes/no; returns via callback prop. |
| `Prompt` | programmatic | single-line input (rename, key entry); returns string via callback. |

## 13. Onboarding wizard (`onboarding/`)

Rendered as a **top-level route** (§7) when `loadPrefs().onboarded !== true`, in place of the main
layout — not through `UiState.modal`. Re-runnable via `/onboarding`, which calls
`store.setReonboarding(true)` (cleared on finish). Five steps, each full-screen with a **live preview**
strip and `enter` next / `esc` back / `ctrl+c` skip-all (writes defaults + `onboarded:true`):

1. **Theme** — arrow through `THEMES`; the preview strip (header/message/tool/footer sample)
   recolors live. Default highlighted: `coven-dark`.
2. **Accent** — pick an accent swatch (theme default + a small palette) → `prefs.accent`.
3. **Layout** — density `comfortable`/`compact`; sidebar default on/off.
4. **Glyphs** — icon set `nerd`/`ascii`, logo `block`/`ascii`, borders `unicode`/`ascii`. Shows a
   sample row rendered both ways. Calls `detectNerdFont()`; if `unlikely`, shows a note: "No Nerd
   Font detected — glyph icons may render as boxes. Install one (e.g. `nerd-fonts`) and set it in
   your terminal; Coven can't change the font for you." with the choice defaulting to `ascii`.
5. **Connector** — lists `ENV_KEYS` providers; any already satisfied by env show ✓ detected. Pick
   one → `Prompt` for the key → `auth.set(provider, key)`; or "skip for now" (a connector-missing
   banner then guides them in-session). This closes the no-key-first-run gap found in the
   cross-check.

Finish → `savePrefs({ ...choices, onboarded: true })`.

`detectNerdFont()` is best-effort: inspects `TERM`, `TERM_PROGRAM`, `LC_TERMINAL`, and known
Nerd-Font env hints; returns `"likely" | "unlikely" | "unknown"`. It never blocks; it only sets the
default choice and the note. (A terminal app cannot enumerate installed fonts reliably.)

## 14. Non-TTY fallback (`fallback.ts`)

`runTui(app)`: if `process.stdout.isTTY && process.stdin.isTTY` → mount Ink; else
`runFallbackRepl(app)` — a ~40-line readline loop that subscribes to the bus, streams `part.delta`
to stdout, prints `[tool]` markers, and handles `/`, `!`, `@`. On `permission.asked` it **prompts
interactively on the same readline** (`[y]es/[a]lways/[n]o`, free-text feedback on `n`); if stdin
has closed (fully piped), it auto-rejects with guidance. No alt screen, no colors beyond basic ANSI.
Preserves piped-stdin behavior the old `InputReader` had. `coven run -p` (`runPrintMode`) is
untouched.

## 15. Sidebar panels (`Sidebar.tsx`)

- **Context** (real): tokens, pct bar, `$cost` — from `UiState.context` + `session.cost`.
- **Modified Files** (real): from `UiState.changedFiles` (paths captured on `part.updated` for
  `edit`/`write` tool parts, §6.3); path left-truncated; hidden when empty. Per-file `+add`/`-del`
  line counts are deferred (no engine field carries them this cycle).
- **Todo** (stub this cycle): framed "Todo — later" (real once todo state is surfaced from the
  engine in a later slice).
- **LSP** (stub): "LSP — slice #2".
- **MCP** (stub): "MCP — slice #3".
Sidebar visible when `prefs.sidebar` and cols ≥ 90; toggle `ctrl+b`; overlay on narrow terminals.

## 16. Cross-check result (informative, done 2026-07-12)

Models ✓ (160 providers / 5,628 models, correct metadata, offline fallback), connectors ✓
(`auth list`, provider resolution for openai/groq/openrouter/ollama; anthropic correctly demands a
key), TTS ✓ (`detectBackend` → `spd`, status/toggle correct). No fixes required. The only gap —
default model needs `ANTHROPIC_API_KEY` — is addressed by the onboarding Connector step (§13.5) and
the connector-missing banner.

## 17. Testing (TDD — test first, always)

### Unit (`bun test`)
- `buffer.ts`: every cursor/edit op, multi-line, word ops, wide chars.
- `autocomplete.ts`: `/`→all, `/r`→prefix set, `/ra`→narrowed, `@`→files, prefix-before-fuzzy
  ordering, secret-file exclusion.
- `keymap.ts`: `resolveKey` across all contexts in §10.1.
- `commands.ts`: builtin items present; template items from a fake `app.commands`; `run()` routing
  (send vs subtask vs temp-agent) via spies.
- `prefs.ts`: load defaults, save/reload round-trip, unknown-field tolerance, `onboarded` flag.
- `theme.ts`: all 7 themes define every token; light/dark siblings resolve.
- store reducer: feed synthetic `BusEvent`s → assert `UiState` transitions incl. throttle flush on
  idle, permission queue serialization + ghost guard.
- engine: `setModel`/`setAgent` update store + publish `session.updated`; `runLoop` precedence
  `session.model ?? agent.model ?? config.model` (fake provider).

### Component (`ink-testing-library`)
Render + `stdin.write(key)` + assert `lastFrame()`:
- Footer shows tokens/pct/cost/model and colors at thresholds.
- Palette narrows on typed filter; runs selected item.
- PromptEditor autocomplete popover narrows `/r`→`/ra`; `tab` completes.
- Transcript renders text/reasoning/tool/diff parts in a bottom-anchored scroll viewport (windowed).
- Permission dialog reply path calls `permissions.reply`.
- Home splash renders logo + hints when empty.
- Onboarding step navigation + live preview swaps theme.

### Smoke (manual / optional dev pty)
Launch under a real TTY (or `node-pty` dev script): open app, `ctrl+p`, type, `esc`, quit; assert
clean alt-screen enter/exit (no stranded buffer). Not part of `bun test`.

Existing 200 tests must stay green (engine untouched except §5, which gets its own tests).

## 18. Build / packaging

- `tsconfig.json`: add `"jsx": "react-jsx"`, `"jsxImportSource": "react"`; ensure `.tsx` included.
- `package.json` build: keep `bun build src/index.ts --target=node --outfile dist/index.js` but add
  `--external ink --external react --external react/jsx-runtime --external fuzzysort` — only the
  packages `src/` imports directly. Once `ink` is external the bundler never enters its transitive
  deps (react-reconciler, yoga-layout, react-devtools-core, scheduler), so those need no flag; they
  load from `node_modules` at runtime (and avoid yoga-wasm bundling pain). They are runtime `dependencies`, so
  `npm i -g thecoven` installs them.
- `files` stays `["dist","README.md","LICENSE"]`; `bin.coven = "dist/index.js"` unchanged.
- **Verification gate** (must pass before "done"): `bun test` green, `tsc --noEmit` clean,
  `bun run build`, then in a clean dir `npm pack` → install the tarball → `node <bin> --version` and
  a scripted pty launch render a frame. Bump to `0.3.0`.

## 19. Migration / removal

- Delete `src/tui/render.ts` and `src/tui/input.ts`.
- Replace the old `Tui` class in `src/tui/index.ts` with `export async function runTui(app: App)`.
- `src/index.ts` default branch: `await runTui(app)` (was `new Tui(app).run()`); all other
  subcommands (`run`, `auth`, `models`, `agents`, `skills`, help/version) unchanged.
- `util/ansi.ts` stays (may be used by `fallback.ts`); `Spinner`'s direct-stdout writes are gone.

## 20. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bundling Ink/React/Yoga into one node file fails (wasm/native) | Externalize them (§18); ship as real deps. Verify tarball install runs. |
| Large-transcript re-render storms / flicker | Scroll viewport renders only the visible window of messages (not the whole history); 25 ms delta coalescing; memoized `MessageView`. (`<Static>` is unusable here — alt-screen has no scrollback.) |
| Key conflicts with editor (ctrl+k/e/s) | Fixed table (§10.1); `ctrl+e`=external editor with `End` for line-end; `ctrl+s` works because raw mode clears `IXON`. |
| Alt-screen strands user on crash/exit | Never `process.exit()` while mounted; `unmount()`/`useApp().exit()` then `waitUntilExit`; wrap root in an error boundary that unmounts first. |
| Non-TTY / CI | `runTui` TTY guard → fallback REPL; Ink auto-ignores alt-screen when not interactive. |
| Nerd-Font glyphs render as boxes | Onboarding detects + defaults to ASCII when unlikely; `ascii` icon set fully functional. |
| `session.updated` now published — headless consumers | `runPrintMode` ignores it; only the UI store consumes it. No behavior change. |

## 21. File inventory

**New:** all files under §4.1 (`src/tui/**`), plus `docs/specs/2026-07-12-coven-tui-shell.md`
(this file).
**Modified:** `src/session/types.ts` (§5.1), `src/session/loop.ts` (§5.2–5.3),
`src/index.ts` (§19), `tsconfig.json` (§18), `package.json` (deps + build flags + version),
`CHANGELOG.md`, `README.md` (feature/screenshot updates).
**Deleted:** `src/tui/render.ts`, `src/tui/input.ts`.
