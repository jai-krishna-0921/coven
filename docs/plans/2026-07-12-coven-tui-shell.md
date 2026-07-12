# Plan: Coven TUI 2.0 — full-screen Ink shell + command surface + onboarding

> **For agentic workers:** execute with executing-plans task-by-task; steps use `- [ ]`
> checkboxes for tracking. Spec: `docs/specs/2026-07-12-coven-tui-shell.md`.

Goal: Replace Coven's line-based REPL with a full-screen Ink (React) terminal app: alternate-screen
layout (header · body+sidebar · footer · modal layer), home splash, streaming transcript with tool
lines and inline diffs, a multiline prompt editor with prefix-narrowing `/`-autocomplete, a
`ctrl+p`/`ctrl+k` command palette + interactive Help, 12 dialogs, 7 themes with live preview, a full
first-run onboarding wizard, live model/agent switching, and a non-TTY fallback. `coven run -p` and
piped usage stay unchanged.

Architecture: `src/index.ts` default branch calls `runTui(app)`. Ink renders a component tree fed by
a single `UiStore` that subscribes to `app.bus` and pulls context/cost from `app.engine`. All engine
mutation flows through a `CommandContext`. The engine gains only: `SessionInfo.model`, a per-turn
`override` arg on `prompt`, and `setModel`/`setAgent` publishing `session.updated`.

Tech Stack: TypeScript strict; Bun for dev/test (`~/.bun/bin/bun`), `bun:test`; **shipped runtime is
Node ≥ 20** (no `Bun.*` APIs in `src/`); Ink 7.1 + React 19.2 + fuzzysort 3; `ink-testing-library`
for component tests.

Global Constraints (every task inherits these, even when not restated):
- ESM only. **Named exports only; no default exports.**
- **No `any`** — use `unknown` and narrow. TypeScript strict must stay clean (`./node_modules/.bin/tsc --noEmit`).
- Errors extend `NamedError` from `src/util/error.ts`; never throw bare strings.
- No `Bun.*` APIs in shipped `src/` (Node-compat). `node:fs`, `node:path`, `node:os` only. Tests may use `bun:test`.
- New `.tsx`/`.ts` UI files live under `src/tui/`. React import style: `import React from "react"` is NOT needed (automatic JSX runtime via tsconfig `jsx: react-jsx`); import hooks/components by name from `react`/`ink`.
- One concern per file. Public shapes go in `src/tui/types.ts`; implementations import from it, not vice versa.
- Test command in every task: `~/.bun/bin/bun test <file>`. Typecheck when a task changes types: `./node_modules/.bin/tsc --noEmit`.
- Commits: conventional (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`), atomic, test included.
- Do not touch `source-codes/` (read-only). Do not regress the existing 200-test suite.

Phase map (execution order; later phases consume earlier Produces):
- **Phase 0** T1–T4: build/deps setup + engine additions.
- **Phase 1** T5–T13: pure logic in dependency order — types, prefs, theme, glyphs, buffer, autocomplete, keymap, history, commands.
- **Phase 2** T14: the UiStore.
- **Phase 3** T15–T26: components (Spinner…PromptEditor).
- **Phase 4** T27–T39: dialogs.
- **Phase 5** T40–T42: onboarding.
- **Phase 6** T43–T47: integration, fallback, entry swap, packaging.

---

## Phase 0 — build foundation + engine additions

## Task 1: Ink/React toolchain installed and a smoke component renders

Files: modify `package.json` (deps + build script + version), modify `tsconfig.json` (JSX);
create `test/tui/smoke.test.tsx`
Interfaces:
  Consumes: nothing
  Produces: a working Ink+React+ink-testing-library toolchain (all later UI tasks depend on it)
Steps:
- [ ] 1. Create the failing test `test/tui/smoke.test.tsx`:

    import { describe, expect, test } from "bun:test";
    import { render } from "ink-testing-library";
    import { Text } from "ink";

    describe("ink toolchain", () => {
      test("renders a Text node", () => {
        const { lastFrame } = render(<Text>coven-ready</Text>);
        expect(lastFrame()).toContain("coven-ready");
      });
    });

- [ ] 2. Run: `~/.bun/bin/bun test test/tui/smoke.test.tsx`
       Expected: FAIL — `Cannot find module 'ink'` (deps not installed yet).
- [ ] 3. Install deps (writes to package.json + bun.lock):

    ~/.bun/bin/bun add ink@^7.1.0 react@19.2 fuzzysort@^3
    ~/.bun/bin/bun add -d @types/react@19.2 ink-testing-library@^4

- [ ] 4. Edit `tsconfig.json` `compilerOptions`: add `"jsx": "react-jsx"`, `"jsxImportSource": "react"`.
       Ensure `.tsx` is included (the `include` should already cover `src`/`test`; if it lists
       extensions, add `tsx`).
- [ ] 5. Edit `package.json` `scripts.build` to externalize the UI libs so the node bundle stays lean:

    "build": "bun build src/index.ts --target=node --outfile dist/index.js --external ink --external react --external react/jsx-runtime --external fuzzysort"

       (Only externalize what `src/` imports directly. Ink's own transitive deps — react-reconciler,
       yoga-layout, react-devtools-core, scheduler — are NOT entered by the bundler once `ink` is
       external, so they need no `--external` flag; they resolve from node_modules at runtime.
       `ink-testing-library` is a devDep never imported by `src/`, so it is never in the bundle graph.)

       And bump `"version"` to `"0.3.0"`.
- [ ] 6. Run: `~/.bun/bin/bun test test/tui/smoke.test.tsx`
       Expected: 1 pass, 0 fail.
- [ ] 7. Run: `./node_modules/.bin/tsc --noEmit`
       Expected: no errors (JSX compiles).
- [ ] 8. Commit "chore(tui): add ink/react/fuzzysort toolchain + JSX config"

## Task 2: SessionInfo carries an optional per-session model override

Files: modify `src/session/types.ts`; create `test/session-model-field.test.ts`
Interfaces:
  Consumes: nothing
  Produces: `SessionInfo.model?: string` (consumed by Task 3, Task 4, Task 14, dialogs)
Steps:
- [ ] 1. Write failing test `test/session-model-field.test.ts`:

    import { describe, expect, test } from "bun:test";
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    import { SessionStore } from "../src/session/store.ts";

    describe("SessionInfo.model", () => {
      test("model override round-trips through disk", () => {
        const data = mkdtempSync(join(tmpdir(), "coven-sess-"));  // SessionStore(root, dataDir?)
        const store = new SessionStore(process.cwd(), data);
        const s = store.create({ agent: "builder", title: "t" });
        store.update({ ...s, model: "openai/gpt-5.4" });
        // reload from disk with a fresh instance to prove real persistence:
        const reloaded = new SessionStore(process.cwd(), data);
        expect(reloaded.get(s.id)?.model).toBe("openai/gpt-5.4");
        rmSync(data, { recursive: true, force: true });
      });
    });

- [ ] 2. Run: `~/.bun/bin/bun test test/session-model-field.test.ts`
       Expected: FAIL — TS error `'model' does not exist on type 'SessionInfo'` (or the assertion fails).
- [ ] 3. In `src/session/types.ts`, add to the `SessionInfo` interface (after `agent`):

    /** Per-session model override "provider/model-id"; undefined = inherit agent/config. */
    model?: string;

- [ ] 4. Run: `~/.bun/bin/bun test test/session-model-field.test.ts`
       Expected: 1 pass. Then `./node_modules/.bin/tsc --noEmit` → clean.
- [ ] 5. Commit "feat(session): add optional per-session model override field"

## Task 3: runLoop model precedence honours per-turn override then session then agent then config

Files: modify `src/session/loop.ts`; create `test/session-model-precedence.test.ts`
Interfaces:
  Consumes: `SessionInfo.model` (Task 2)
  Produces: `engine.prompt(sessionID, text, abort, override?: { agent?: string; model?: string })`
    resolving model as `override.model ?? session.model ?? agent.model ?? config.model ?? DEFAULT_MODEL`
Steps:
- [ ] 1. Read `src/session/loop.ts` lines 125–190 to confirm current shapes (`prompt`, `runLoop`,
       `providers.resolve`, the `agent.model ?? this.o.config.model ?? DEFAULT_MODEL` line ~185).
- [ ] 2. Write failing test `test/session-model-precedence.test.ts` using the existing fake-provider
       harness pattern (copy the provider-injection setup already used by the loop integration
       suite — find it with `grep -rl "providers:" test | head`). The test builds an engine with a
       fake `ProviderResolver` that records the `modelRef` it was asked to resolve, then asserts:

    // pseudo-focused assertions (fill provider/store/bus fakes from the existing loop test util)
    // a) override wins:
    await engine.prompt(id, "hi", ac.signal, { model: "openai/o" });
    expect(fake.lastResolved).toBe("openai/o");
    // b) session.model next:
    store.update({ ...store.get(id)!, model: "groq/g" });
    await engine.prompt(id, "hi", ac.signal);
    expect(fake.lastResolved).toBe("groq/g");
    // c) agent.model next (session.model cleared); d) config.model last.

       If no reusable fake exists, create `test/util/fake-engine.ts` exporting `makeEngine(opts)`
       that wires `SessionEngine` with fake `providers`/`bus`/`store` and a `lastResolved` capture.
- [ ] 3. Run: `~/.bun/bin/bun test test/session-model-precedence.test.ts`
       Expected: FAIL — override arg ignored / `prompt` has no 4th param.
- [ ] 4. Modify `src/session/loop.ts`:
       - `prompt` signature → `async prompt(sessionID: string, text: string, abort: AbortSignal, override?: { agent?: string; model?: string }): Promise<Message>`.
       - Resolve agent as: `const agent = this.o.agents.get(override?.agent ?? session.agent);` (keep the existing not-found throw).
       - Pass `override` into `runLoop`: `return await this.runLoop(sessionID, agent, abort, override);`
       - `runLoop` signature gains `override?: { agent?: string; model?: string }`.
       - Change the model line (~185) to:
         `const modelRef = override?.model ?? session.model ?? agent.model ?? this.o.config.model ?? DEFAULT_MODEL;`
- [ ] 5. Run: `~/.bun/bin/bun test test/session-model-precedence.test.ts` → all pass.
       Then `~/.bun/bin/bun test` (full suite) → still green; `./node_modules/.bin/tsc --noEmit` → clean.
- [ ] 6. Commit "feat(session): per-turn model/agent override + precedence"

## Task 4: engine.setModel / setAgent persist and publish session.updated

Files: modify `src/session/loop.ts`; create `test/session-setters.test.ts`
Interfaces:
  Consumes: `SessionInfo.model` (Task 2); `Bus` (`src/bus/index.ts`); `AgentRegistry.get/primaries`
  Produces:
    `SessionEngine.setModel(sessionID: string, modelRef: string): SessionInfo`
    `SessionEngine.setAgent(sessionID: string, agentName: string): SessionInfo`
    (both publish `{ type: "session.updated", session }`)
Steps:
- [ ] 1. Write failing test `test/session-setters.test.ts`:

    import { describe, expect, test } from "bun:test";
    // build an engine via the Task 3 fake-engine util; subscribe a spy to bus "session.updated".
    // setModel:
    //   const updated = engine.setModel(id, "openai/gpt-5.4");
    //   expect(updated.model).toBe("openai/gpt-5.4");
    //   expect(store.get(id)!.model).toBe("openai/gpt-5.4");
    //   expect(events).toContainEqual({ type: "session.updated", session: updated });
    // setModel invalid: expect(() => engine.setModel(id, "noslash")).toThrow();
    // setAgent valid primary: engine.setAgent(id, "researcher") updates + publishes.
    // setAgent unknown: expect(() => engine.setAgent(id, "nope")).toThrow();

- [ ] 2. Run: `~/.bun/bin/bun test test/session-setters.test.ts`
       Expected: FAIL — `engine.setModel is not a function`.
- [ ] 3. Add to `SessionEngine` in `src/session/loop.ts`:

    setModel(sessionID: string, modelRef: string): SessionInfo {
      if (!modelRef.includes("/")) throw new SessionError(`Invalid model ref "${modelRef}"`);
      const session = this.o.store.get(sessionID);
      if (!session) throw new SessionError(`No session ${sessionID}`);
      const next = { ...session, model: modelRef };
      this.o.store.update(next);
      this.o.bus.publish({ type: "session.updated", session: next });
      return next;
    }

    setAgent(sessionID: string, agentName: string): SessionInfo {
      const agent = this.o.agents.get(agentName);
      if (!agent || agent.hidden || agent.mode === "subagent")
        throw new SessionError(`Agent "${agentName}" is not user-selectable`);
      const session = this.o.store.get(sessionID);
      if (!session) throw new SessionError(`No session ${sessionID}`);
      const next = { ...session, agent: agentName };
      this.o.store.update(next);
      this.o.bus.publish({ type: "session.updated", session: next });
      return next;
    }

       `SessionError` does not exist yet — `src/util/error.ts` only exports the abstract `NamedError`
       plus permission/config/provider errors. FIRST add to `src/util/error.ts`:

    export class SessionError extends NamedError {
      override readonly name = "SessionError";
      constructor(readonly detail: string) { super(detail); }
    }

       Import it into `src/session/loop.ts` and use it in the snippets above. Do NOT `throw` a bare
       string, and do NOT reuse `PermissionDeniedError`/`PermissionRejectedError` (wrong semantics).
- [ ] 4. Run: `~/.bun/bin/bun test test/session-setters.test.ts` → pass; full suite green; tsc clean.
- [ ] 5. Commit "feat(session): setModel/setAgent publish session.updated"

---

## Phase 1 — pure logic (no Ink rendering)

## Task 5: shared UI types compile

Files: create `src/tui/types.ts`; create `test/tui/types.test.ts`
Interfaces:
  Consumes: `SessionInfo`, `Message`, `Part`, `Usage` (`src/session/types.ts`); `App` (`src/app.ts`);
    `PermissionRequest` (`src/permission/types.ts`)
  Produces: `UiState`, `ModalKind`, `ToastKind`, `Completion`, `PaletteCategory`, `PaletteItem`,
    `CommandContext`, `KeyAction`, `KeyContext` (imported by nearly every later task)
Steps:
- [ ] 1. Write `test/tui/types.test.ts` — a compile-gate that constructs a minimal value of each
       exported type behind `satisfies`, so `tsc` fails if a field is wrong:

    import { describe, expect, test } from "bun:test";
    import type { UiState, PaletteItem, Completion, KeyAction } from "../../src/tui/types.ts";

    describe("tui types", () => {
      test("shapes construct", () => {
        const c: Completion = { value: "/new", label: "New session", kind: "command" };
        const a: KeyAction = { kind: "builtin", name: "quit" };
        expect(c.kind).toBe("command");
        expect(a.kind).toBe("builtin");
      });
    });

- [ ] 2. Run: `~/.bun/bin/bun test test/tui/types.test.ts`
       Expected: FAIL — `Cannot find module '../../src/tui/types.ts'`.
- [ ] 3. Create `src/tui/types.ts` (copy these shapes verbatim from spec §6.1/§8.3/§9.1/§10.2/§10.3):

    import type { SessionInfo, Message } from "../session/types.ts";
    import type { App } from "../app.ts";
    import type { PermissionRequest } from "../permission/types.ts";
    import type { UiPrefs } from "./prefs.ts";
    // NOTE: do NOT import ./store.ts here — it is produced in Task 14 and a forward module
    // import would fail every intervening `tsc --noEmit` gate. CommandContext.store is typed
    // structurally via UiStoreLike below; the concrete UiStore (Task 14) `implements UiStoreLike`.

    export type ModalKind =
      | "palette" | "help" | "whichkey" | "sessions" | "models" | "agents"
      | "themes" | "skills" | "permission" | "status" | "confirm" | "prompt";
    export type ToastKind = "info" | "success" | "warn" | "error";
    export type PaletteCategory =
      | "System" | "Session" | "Model" | "Agent" | "Theme" | "View"
      | "Voice" | "Prompt" | "Skill" | "Auth" | "Custom";

    export interface Completion {
      value: string; label: string; hint?: string;
      kind: "command" | "file"; matched?: number[];
    }

    // Typed modal props (consumed by ModalLayer in Task 39; opened via CommandContext.openModal).
    export type ModalProps =
      | { kind: "rename"; message: string; initial: string; onSubmit(title: string): void }
      | { kind: "login"; message: string; onSubmit(key: string): void }
      | { kind: "confirm"; message: string; onYes(): void; onNo(): void };

    // Structural view of UiStore (Task 14) so types.ts has no forward module dependency.
    export interface UiStoreLike {
      setSessionID(id: string): void;
      appendSynthetic(message: Message): void;
      replyPermission(reply: "once" | "always" | "reject", feedback?: string): void;
      openModal(kind: ModalKind, props?: ModalProps): void;
      closeModal(): void;
      toast(text: string, kind?: ToastKind): void;
      setReonboarding(on: boolean): void;
      scrollBy(deltaRows: number): void;   // + = older/up, − = newer/down; clamps; 0 follows tail
      clearInput?(): void;                 // optional hook the editor registers for ctrl-c clear
    }

    export interface UiState {
      session: SessionInfo;
      history: Message[];
      live: Message | null;
      status: "idle" | "busy" | "error";
      compacting: boolean;
      context: { tokens: number; usable: number; pct: number };
      permission: PermissionRequest | null;
      modal: { kind: ModalKind; props?: ModalProps } | null;
      reonboarding: boolean;
      sidebarOverlay: boolean;
      scrollOffset: number;          // rows scrolled up from the tail; 0 = following the live tail
      toast: { text: string; kind: ToastKind } | null;
      changedFiles: string[];
      connectorReady: boolean;
    }

    export interface CommandHost {           // App-local actions the App injects (Task 43)
      redraw(): void;
      openEditor(): Promise<void>;
      attachFile(): void;
      exportTranscript(): Promise<void>;
      interrupt(): void;
      quit(): void;
    }

    export interface CommandContext {
      app: App;
      store: UiStoreLike;
      session: SessionInfo;
      abort: AbortSignal;
      host: CommandHost;
      send(text: string, override?: { agent?: string; model?: string }): Promise<void>;
      gateShell(command: string): Promise<boolean>;   // permission-gated shell for command expansion (App wires to app.permissions.ask)
      openModal(kind: ModalKind, props?: ModalProps): void;
      closeModal(): void;
      toast(text: string, kind?: ToastKind): void;
      prefs: UiPrefs;
      setPrefs(patch: Partial<UiPrefs>): void;
    }

    export interface PaletteItem {
      id: string; title: string; slash: string; category: PaletteCategory;
      keybinding?: string; aliases?: string[];
      run(ctx: CommandContext): void | Promise<void>;
      enabled?(ctx: CommandContext): boolean;
    }

    export type KeyAction = { kind: "command"; id: string } | { kind: "builtin"; name: string };
    export interface KeyContext { modalOpen: boolean; busy: boolean; popoverOpen: boolean; bufferEmpty: boolean; }

- [ ] 4. Run: `~/.bun/bin/bun test test/tui/types.test.ts` → pass. `./node_modules/.bin/tsc --noEmit`
       will report missing `./store.ts`/`./prefs.ts` — that is EXPECTED until Tasks 6 & 14; this
       task's gate is the bun test only. (Later tasks resolve the type-only imports.)
- [ ] 5. Commit "feat(tui): shared UI types"

## Task 6: UiPrefs load/save with defaults

Files: create `src/tui/prefs.ts`; create `test/tui/prefs.test.ts`
Interfaces:
  Consumes: nothing (uses `node:fs`, `node:os`, `node:path`)
  Produces: `UiPrefs` interface; `loadPrefs(dir?: string): UiPrefs`; `savePrefs(p: UiPrefs, dir?: string): void`;
    `DEFAULT_PREFS: UiPrefs`; `prefsPath(dir?: string): string`
Steps:
- [ ] 1. Write `test/tui/prefs.test.ts`:

    import { describe, expect, test, beforeEach } from "bun:test";
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    import { loadPrefs, savePrefs, DEFAULT_PREFS } from "../../src/tui/prefs.ts";

    describe("prefs", () => {
      test("returns defaults when no file", () => {
        const dir = mkdtempSync(join(tmpdir(), "coven-prefs-"));
        expect(loadPrefs(dir)).toEqual(DEFAULT_PREFS);
        rmSync(dir, { recursive: true, force: true });
      });
      test("round-trips and tolerates unknown fields", () => {
        const dir = mkdtempSync(join(tmpdir(), "coven-prefs-"));
        savePrefs({ ...DEFAULT_PREFS, theme: "dracula", onboarded: true }, dir);
        const p = loadPrefs(dir);
        expect(p.theme).toBe("dracula");
        expect(p.onboarded).toBe(true);
        expect(p.density).toBe(DEFAULT_PREFS.density);
        rmSync(dir, { recursive: true, force: true });
      });
    });

- [ ] 2. Run: `~/.bun/bin/bun test test/tui/prefs.test.ts` → FAIL (module missing).
- [ ] 3. Create `src/tui/prefs.ts`:

    import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
    import { homedir } from "node:os";
    import { join, dirname } from "node:path";

    export interface UiPrefs {
      version: 1;
      onboarded: boolean;
      theme: string;
      accent?: string;
      density: "comfortable" | "compact";
      sidebar: boolean;
      glyphs: "nerd" | "ascii";
      logo: "block" | "ascii";
      borders: "unicode" | "ascii";
      recentModels: string[];
    }

    export const DEFAULT_PREFS: UiPrefs = {
      version: 1, onboarded: false, theme: "coven-dark",
      density: "comfortable", sidebar: true, glyphs: "ascii",
      logo: "block", borders: "unicode", recentModels: [],
    };

    export function prefsPath(dir: string = join(homedir(), ".local", "share", "coven")): string {
      return join(dir, "tui.json");
    }

    export function loadPrefs(dir?: string): UiPrefs {
      try {
        const raw = JSON.parse(readFileSync(prefsPath(dir), "utf8")) as Partial<UiPrefs>;
        return { ...DEFAULT_PREFS, ...raw, version: 1 };
      } catch {
        return { ...DEFAULT_PREFS };
      }
    }

    export function savePrefs(p: UiPrefs, dir?: string): void {
      const file = prefsPath(dir);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(p, null, 2), { mode: 0o600 });
    }

- [ ] 4. Run test → pass; `./node_modules/.bin/tsc --noEmit` → clean.
- [ ] 5. Commit "feat(tui): UiPrefs persistence"

## Task 7: Theme registry with 7 complete themes

Files: create `src/tui/theme.ts`; create `test/tui/theme.test.ts`
Interfaces:
  Consumes: nothing
  Produces: `Theme` interface; `THEMES: Record<string, Theme>` (keys: `coven-dark`, `coven-light`,
    `catppuccin-mocha`, `tokyo-night`, `gruvbox-dark`, `dracula`, `nord`); `DEFAULT_THEME = "coven-dark"`
    (Note: the `ThemeProvider`/`useTheme` React context that consumes `THEMES` is added in Task 15.)
Steps:
- [ ] 1. Write `test/tui/theme.test.ts`:

    import { describe, expect, test } from "bun:test";
    import { THEMES } from "../../src/tui/theme.ts";

    const TOKENS = ["bg","bgPanel","bgOverlay","fg","fgMuted","fgSubtle","border","borderFocus",
      "accent","accentAlt","success","warning","error","info","roleUser","roleAssistant",
      "agent","tool","toolOk","toolErr","diffAdd","diffDel","selectionBg","selectionFg"];

    describe("themes", () => {
      test("all 7 present", () => {
        expect(Object.keys(THEMES).sort()).toEqual(
          ["catppuccin-mocha","coven-dark","coven-light","dracula","gruvbox-dark","nord","tokyo-night"]);
      });
      test("every theme defines every token as a hex string", () => {
        for (const [name, t] of Object.entries(THEMES))
          for (const k of TOKENS)
            expect(t[k as keyof typeof t], `${name}.${k}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
      test("coven dark/light are siblings", () => {
        expect(THEMES["coven-dark"].light).toBe("coven-light");
        expect(THEMES["coven-light"].dark).toBe("coven-dark");
      });
    });

- [ ] 2. Run → FAIL (module missing).
- [ ] 3. Create `src/tui/theme.ts` defining the `Theme` interface (all 24 tokens from spec §11.1 plus
       `name: string; label: string; mode: "dark" | "light"; light?: string; dark?: string`) and the
       `THEMES` record. Use these accent anchors, fill remaining tokens with palette-appropriate hex
       (all must be 6-digit hex): `coven-dark` accent `#c026d3` on `#0d1117`; `coven-light` accent
       `#a21caf` on `#faf9fb`; `catppuccin-mocha` accent `#cba6f7` on `#1e1e2e`; `tokyo-night` accent
       `#7aa2f7` on `#1a1b26`; `gruvbox-dark` accent `#fabd2f` on `#282828`; `dracula` accent
       `#bd93f9` on `#282a36`; `nord` accent `#88c0d0` on `#2e3440`. Set `mode` per theme;
       `coven-dark.light = "coven-light"` and `coven-light.dark = "coven-dark"`. Export
       `DEFAULT_THEME = "coven-dark"`.
- [ ] 4. Run test → pass; tsc clean.
- [ ] 5. Commit "feat(tui): 7-theme registry with token completeness"

## Task 8: glyph + border + logo sets for nerd and ascii

Files: create `src/tui/glyphs.ts`; create `test/tui/glyphs.test.ts`
Interfaces:
  Consumes: nothing
  Produces: `IconSet` type; `ICONS: Record<"nerd" | "ascii", IconSet>`;
    `BORDERS: Record<"unicode" | "ascii", string>` (values map to Ink `borderStyle` names:
    `"round"` / `"classic"`); `LOGO: Record<"block" | "ascii", string>`
Steps:
- [ ] 1. Write `test/tui/glyphs.test.ts`:

    import { describe, expect, test } from "bun:test";
    import { ICONS, BORDERS, LOGO } from "../../src/tui/glyphs.ts";

    const KEYS = ["ok","err","warn","info","tool","agent","bullet","arrow","prompt","spinner","sidebar","context"];
    describe("glyphs", () => {
      test("both icon sets define every key", () => {
        for (const set of ["nerd","ascii"] as const)
          for (const k of KEYS) expect(ICONS[set][k as keyof typeof ICONS.nerd], `${set}.${k}`).toBeDefined();
      });
      test("spinner frames are non-empty arrays", () => {
        expect(ICONS.ascii.spinner.length).toBeGreaterThan(0);
        expect(ICONS.nerd.spinner.length).toBeGreaterThan(0);
      });
      test("borders + logos exist", () => {
        expect(BORDERS.unicode).toBeDefined(); expect(BORDERS.ascii).toBeDefined();
        expect(LOGO.block).toContain("\n"); expect(LOGO.ascii.length).toBeGreaterThan(0);
      });
    });

- [ ] 2. Run → FAIL.
- [ ] 3. Create `src/tui/glyphs.ts`. `IconSet = { ok,err,warn,info,tool,agent,bullet,arrow,prompt,sidebar,context: string; spinner: string[] }`.
       `ascii` uses plain chars (`ok:"√"`→ use `"✓"`? keep ASCII-safe: `ok:"[ok]"` is ugly; prefer
       single unicode that renders everywhere: use `ok:"✓", err:"✗", warn:"!", info:"i", tool:"›",
       agent:"◆", bullet:"•", arrow:"›", prompt:"❯", sidebar:"▏", context:"▤", spinner:["|","/","-","\\"]`).
       `nerd` uses Nerd-Font glyphs (`ok:"", err:"", warn:"", info:"",
       tool:"", agent:""...`, `spinner` the braille frames `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`).
       `BORDERS = { unicode: "round", ascii: "classic" }`. `LOGO.block` = a multi-line block-letter
       `coven` wordmark (reuse the ASCII already in `assets`/README if handy); `LOGO.ascii` = a
       one-line `c o v e n` fallback.
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): glyph/border/logo sets (nerd + ascii)"

## Task 9: TextBuffer cursor/edit model

Files: create `src/tui/input/buffer.ts`; create `test/tui/buffer.test.ts`
Interfaces:
  Consumes: nothing
  Produces: `class TextBuffer` with `value(): string`, `setValue(v: string): void`,
    `cursor(): { row: number; col: number }`, `insert(s: string)`, `backspace()`, `del()`,
    `moveLeft()`, `moveRight()`, `moveUp()`, `moveDown()`, `home()`, `end()`,
    `wordLeft()`, `wordRight()`, `deleteWordLeft()`, `killToLineStart()`, `isEmpty(): boolean`
Steps:
- [ ] 1. Write `test/tui/buffer.test.ts` covering: insert appends + advances cursor; newline via
       `insert("\n")` creates a row; `backspace` at col 0 joins lines; `moveLeft/Right` clamp;
       `home/end`; `wordLeft`/`deleteWordLeft` on `"foo bar"`; `killToLineStart`; `isEmpty`.

    import { describe, expect, test } from "bun:test";
    import { TextBuffer } from "../../src/tui/input/buffer.ts";
    describe("TextBuffer", () => {
      test("insert + cursor", () => { const b = new TextBuffer(); b.insert("hi"); expect(b.value()).toBe("hi"); expect(b.cursor()).toEqual({ row: 0, col: 2 }); });
      test("deleteWordLeft", () => { const b = new TextBuffer(); b.insert("foo bar"); b.deleteWordLeft(); expect(b.value()).toBe("foo "); });
      test("newline + backspace joins", () => { const b = new TextBuffer(); b.insert("a\nb"); b.home(); b.backspace(); expect(b.value()).toBe("ab"); });
      test("isEmpty", () => { expect(new TextBuffer().isEmpty()).toBe(true); });
    });

- [ ] 2. Run → FAIL.
- [ ] 3. Implement `TextBuffer` as a class over `lines: string[]` + `row`/`col`, all methods pure
       in-memory (no I/O). Full implementation (write real code; ~120 lines). Cursor clamps to line
       bounds; `moveUp/Down` preserve preferred column; `wordLeft/Right` skip `\s+` then `\S+`.
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): TextBuffer cursor/edit model"

## Task 10: completionsFor — prefix-narrowing then fuzzy

Files: create `src/tui/autocomplete.ts`; create `test/tui/autocomplete.test.ts`
Interfaces:
  Consumes: `PaletteItem`, `Completion` (Task 5); `fuzzysort`
  Produces: `completionsFor(input: string, cursor: number, items: PaletteItem[], files: () => string[]): Completion[]`
Steps:
- [ ] 1. Write `test/tui/autocomplete.test.ts`:

    import { describe, expect, test } from "bun:test";
    import { completionsFor } from "../../src/tui/autocomplete.ts";
    import type { PaletteItem } from "../../src/tui/types.ts";
    const mk = (slash: string): PaletteItem => ({ id: slash, title: slash, slash, category: "System", run() {} });
    const items = ["review","rename","resume","new","models"].map(mk);
    describe("completionsFor", () => {
      test("bare slash → all commands", () => {
        expect(completionsFor("/", 1, items, () => []).map(c => c.value)).toContain("/review");
        expect(completionsFor("/", 1, items, () => []).length).toBe(items.length);
      });
      test("prefix r narrows", () => {
        const v = completionsFor("/r", 2, items, () => []).map(c => c.value);
        expect(v).toEqual(expect.arrayContaining(["/review","/rename","/resume"]));
        expect(v).not.toContain("/new");
      });
      test("prefix re narrows further, prefix before fuzzy", () => {
        const v = completionsFor("/re", 3, items, () => []).map(c => c.value);
        expect(v.slice(0,3).sort()).toEqual(["/rename","/resume","/review"]);
      });
      test("@ triggers file completions", () => {
        const v = completionsFor("look @src/i", 11, items, () => ["src/index.ts","src/app.ts"]).map(c => c.value);
        expect(v).toContain("src/index.ts");
      });
      test("non-command text → no command completions", () => {
        expect(completionsFor("hello world", 11, items, () => [])).toEqual([]);
      });
    });

- [ ] 2. Run → FAIL.
- [ ] 3. Implement per spec §8.3: find the token containing `cursor`. If the trimmed buffer starts
       with `/` and the cursor is within the first token → command mode: strip leading `/`, let
       `q = token`. Partition items into prefix-matches (`slash.toLowerCase().startsWith(q)`) sorted
       alphabetically, then fuzzysort matches on `slash`/`title` excluding prefix hits; map to
       `Completion{ value:"/"+slash, label:title, hint:category, kind:"command", matched }`. If the
       token starts with `@` → file mode: `q = token.slice(1)`; prefix then fuzzysort over
       `files()`; map to `Completion{ value:path, label:path, kind:"file" }`. Otherwise return `[]`.
       Cap at 8. Exclude paths that `readAttachment` (`src/util/path.ts`) would reject
       (secret/`.env`/key material): if `util/path.ts` exports a reusable secret/deny predicate, call
       it; otherwise replicate its denylist exactly (do not invent a looser one) so completion and
       attachment stay in agreement.
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): prefix-then-fuzzy autocomplete"

## Task 11: resolveKey with context precedence

Files: create `src/tui/keymap.ts`; create `test/tui/keymap.test.ts`
Interfaces:
  Consumes: `KeyAction`, `KeyContext` (Task 5)
  Produces: `type KeyObject` (subset of Ink's key: `{ ctrl, shift, meta, return: boolean; escape, upArrow, downArrow, leftArrow, rightArrow, pageUp, pageDown, tab, backspace, delete: boolean }`);
    `resolveKey(input: string, key: KeyObject, ctx: KeyContext): KeyAction | null`
Steps:
- [ ] 1. Write `test/tui/keymap.test.ts` asserting the §10.1 table + §10.3 precedence:

    import { describe, expect, test } from "bun:test";
    import { resolveKey, type KeyObject } from "../../src/tui/keymap.ts";
    const K = (o: Partial<KeyObject> = {}): KeyObject => ({ ctrl:false,shift:false,meta:false,return:false,escape:false,upArrow:false,downArrow:false,leftArrow:false,rightArrow:false,pageUp:false,pageDown:false,tab:false,backspace:false,delete:false, ...o });
    const base = { modalOpen:false, busy:false, popoverOpen:false, bufferEmpty:true };
    describe("resolveKey", () => {
      test("ctrl+p → palette", () => expect(resolveKey("p", K({ctrl:true}), base)).toEqual({ kind:"command", id:"command.palette" }));
      test("ctrl+n → new session", () => expect(resolveKey("n", K({ctrl:true}), base)).toEqual({ kind:"command", id:"session.new" }));
      test("? on empty buffer → help", () => expect(resolveKey("?", K(), base)).toEqual({ kind:"command", id:"help" }));
      test("? with text → falls through", () => expect(resolveKey("?", K(), { ...base, bufferEmpty:false })).toBeNull());
      test("esc closes modal before interrupt", () => expect(resolveKey("", K({escape:true}), { ...base, modalOpen:true, busy:true })).toEqual({ kind:"builtin", name:"modal.close" }));
      test("esc interrupts when busy no modal", () => expect(resolveKey("", K({escape:true}), { ...base, busy:true })).toEqual({ kind:"builtin", name:"interrupt" }));
      test("pageUp → scroll.up", () => expect(resolveKey("", K({pageUp:true}), base)).toEqual({ kind:"builtin", name:"scroll.up" }));
      test("pageDown → scroll.down", () => expect(resolveKey("", K({pageDown:true}), base)).toEqual({ kind:"builtin", name:"scroll.down" }));
      test("ctrl+c → ctrl-c builtin (App owns the state machine)", () => expect(resolveKey("c", K({ctrl:true}), base)).toEqual({ kind:"builtin", name:"ctrl-c" }));
      test("ctrl+c ignored while modal open (falls to modal.close via esc path only)", () => expect(resolveKey("c", K({ctrl:true}), { ...base, modalOpen:true })).toEqual({ kind:"builtin", name:"modal.close" }));
    });

- [ ] 2. Run → FAIL.
- [ ] 3. Implement `resolveKey` with the precedence ladder from spec §10.3 (modal → popover → busy →
       global → null) and the full §10.1 binding table. Global command ids: `command.palette`
       (ctrl+p/ctrl+k), `help` (`?` when bufferEmpty, or `f1`), `session.new` (ctrl+n),
       `session.list` (ctrl+s), `model.picker` (ctrl+o), `agent.picker` (ctrl+g), `theme.picker`
       (ctrl+t), `sidebar.toggle` (ctrl+b), `editor.external` (ctrl+e), `file.attach` (ctrl+f),
       `screen.clear` (ctrl+l). Builtins: `modal.close` (esc/ctrl+c when a modal is open),
       `popover.dismiss` (esc when the autocomplete popover is open), `interrupt` (esc when busy, no
       modal), `scroll.up`/`scroll.down` (pageUp/pageDown, no modal), `ctrl-c` (ctrl+c when no modal —
       the App owns the 1.5 s double-press→quit / busy→interrupt / non-empty-buffer→clear state
       machine, Task 43), `agent.cycle`/`agent.cycle.reverse` (tab/shift+tab when bufferEmpty &&
       !popoverOpen), `quit` (ctrl+d when bufferEmpty). Return `null` for anything that should reach
       the editor.
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): context-aware keymap resolver"

## Task 12: InputHistory persistence

Files: create `src/tui/input/history.ts`; create `test/tui/history.test.ts`
Interfaces:
  Consumes: nothing (`node:fs`)
  Produces: `class InputHistory` with `constructor(file?: string)`, `push(entry: string): void`,
    `prev(): string | undefined`, `next(): string | undefined`, `reset(): void`, `all(): string[]`
Steps:
- [ ] 1. Write `test/tui/history.test.ts`: push three, `prev()` walks back newest-first, `next()`
       walks forward, `reset()` returns to the live line, persistence across a new instance on the
       same temp file, and de-dup of consecutive identical entries.
- [ ] 2. Run → FAIL.
- [ ] 3. Implement over an in-memory array persisted line-per-entry to
       `~/.local/share/coven/history` (default) via `node:fs` append; cap at 1000 lines; ignore
       read errors (fresh history).
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): persisted input history"

## Task 13: command catalog + subtask runner

Files: create `src/tui/commands.ts`; create `test/tui/commands.test.ts`
Interfaces:
  Consumes: `PaletteItem`, `CommandContext` (Task 5); `App`/`CommandsLike` (`src/app.ts`);
    `engine.setModel`/`prompt` (Tasks 3–4)
  Produces: `buildPaletteItems(ctx: CommandContext): PaletteItem[]`;
    `runCommandSubtask(ctx: CommandContext, o: { agent: string; model?: string; text: string; label: string }): Promise<void>`
Steps:
- [ ] 1. Write `test/tui/commands.test.ts` with a fake `CommandContext` (stub `app.commands.all()`
       returning one `{ name:"init", description:"", template:"do $ARGUMENTS", source:"builtin", hints:["$ARGUMENTS"] }`,
       stub `send`/`openModal`/`toast` as spies, a fake `app.store.create`/`app.engine.prompt`/`setModel`):
       - `buildPaletteItems(ctx)` includes ids `session.new`, `command.palette`, `theme.picker`,
         `voice.toggle`, and a `cmd:init` item whose `run` calls `ctx.send` with the expanded text.
       - a template with `subtask:true` routes through `runCommandSubtask` (assert `app.store.create`
         called with `parentID = ctx.session.id`, and `ctx.store.appendSynthetic` called with the
         child result).
       - `runCommandSubtask` with a `model` calls `app.engine.setModel(child.id, model)` before `prompt`.

    // sketch — fill fakes:
    // const ctx = makeCtx();  const items = buildPaletteItems(ctx);
    // expect(items.find(i => i.id === "session.new")).toBeTruthy();
    // await items.find(i => i.id === "cmd:init")!.run(ctx);
    // expect(ctx.send).toHaveBeenCalledWith("do ", undefined);  // expanded, no args

- [ ] 2. Run → FAIL.
- [ ] 3. Implement `buildPaletteItems`. **ID CONTRACT (must match Task 11's keymap ids exactly, since
       Task 43 routes `{kind:"command",id}` by looking the id up here):** return builtin items with
       these `{ id, slash, category, keybinding }` and a `run`:

    | id | slash | category | key | run does |
    |---|---|---|---|---|
    | `command.palette` | `palette` | System | ctrl+p | `ctx.openModal("palette")` |
    | `help` | `help` | System | ? | `ctx.openModal("help")` |
    | `whichkey` | `keys` | System | — | `ctx.openModal("whichkey")` |
    | `status` | `status` | System | — | `ctx.openModal("status")` |
    | `screen.clear` | `clear` | System | ctrl+l | clear+redraw (App handles) |
    | `app.quit` | `quit` | System | — | `ctx.host.quit()` |
    | `onboarding` | `onboarding` | System | — | `ctx.store.setReonboarding(true)` |
    | `session.new` | `new` | Session | ctrl+n | `ctx.store.setSessionID(ctx.app.store.create({agent:ctx.session.agent,title:"New session"}).id)` |
    | `session.list` | `sessions` | Session | ctrl+s | `ctx.openModal("sessions")` |
    | `session.resume` | `resume` | Session | — | `ctx.openModal("sessions")` |
    | `session.compact` | `compact` | Session | — | `await ctx.app.engine.compact(ctx.session.id,{auto:false,abort:ctx.abort})` |
    | `session.export` | `export` | Session | — | write transcript md (App helper) |
    | `session.rename` | `rename` | Session | — | `ctx.openModal("prompt", { kind:"rename", message:"Rename session", initial: ctx.session.title, onSubmit:(t)=>{ ctx.app.store.update({ ...ctx.app.store.get(ctx.session.id)!, title:t }); ctx.app.bus.publish({type:"session.updated",session:ctx.app.store.get(ctx.session.id)!}); ctx.closeModal(); } })` |
    | `session.interrupt` | `interrupt` | Session | — | App interrupt handler |
    | `model.picker` | `models` | Model | ctrl+o | `ctx.openModal("models")` |
    | `agent.picker` | `agents` | Agent | ctrl+g | `ctx.openModal("agents")` |
    | `theme.picker` | `themes` | Theme | ctrl+t | `ctx.openModal("themes")` |
    | `theme.toggle` | `theme-toggle` | Theme | — | swap to the theme's light/dark sibling via `ctx.setPrefs` |
    | `sidebar.toggle` | `sidebar` | View | ctrl+b | `ctx.setPrefs({sidebar:!ctx.prefs.sidebar})` |
    | `voice.toggle` | `voice` | Voice | — | flip `ctx.app.tts.enabled`; `enabled:()=>!!ctx.app.tts&&ctx.app.tts.backend!==null` |
    | `skills` | `skills` | Skill | — | `ctx.openModal("skills")` |
    | `editor.external` | `editor` | Prompt | ctrl+e | open `$EDITOR` (App helper) |
    | `file.attach` | `attach` | Prompt | ctrl+f | App seeds an `@` in the editor |
    | `auth.login` | `login` | Auth | — | opens a provider `SelectDialog` (`Object.keys(ENV_KEYS)`), then a masked `Prompt` (`kind:"login"`) whose `onSubmit(key)` → `ctx.app.auth?.set(provider,key)` + `ctx.app.providers.invalidate(provider)` + toast + `ctx.closeModal()` |
    | `connectors` | `connectors` | Auth | — | `ctx.openModal("status")` (connectors shown there) |

       Items whose `run` needs App-only state (screen.clear, export, editor.external, file.attach,
       session.interrupt, rename, quit) call the `ctx.host.*` capabilities (a `CommandHost` object the
       App injects onto `CommandContext` — see Task 5 addition and Task 43): `screen.clear` →
       `ctx.host.redraw()`; `editor.external` → `await ctx.host.openEditor()`; `file.attach` →
       `ctx.host.attachFile()`; `session.export` → `await ctx.host.exportTranscript()`;
       `session.interrupt` → `ctx.host.interrupt()`; `app.quit` → `ctx.host.quit()`. Every `run` is a
       real function (never undefined) so the palette lists them. Then append template items from
       `app.commands.all()` per §9.2(2) (`id="cmd:"+name`, `slash=name`, `category="Custom"` or
       `"Prompt"` for init/review). Implement `runCommandSubtask` per the §9.2 helper (create child,
       optional setModel, toast, prompt to completion, appendSynthetic).
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): command catalog + subtask runner"

---

## Phase 2 — the UiStore

## Task 14: UiStore reduces bus events into UiState

Files: create `src/tui/store.ts`; create `test/tui/store.test.ts`
Interfaces:
  Consumes: `App` (`src/app.ts`), `Bus`/`BusEvent` (`src/bus/index.ts`), `UiState`/`ModalKind`/`ToastKind`
    (Task 5), `SessionInfo`/`Message`/`Part` (`src/session/types.ts`), `PermissionRequest` (`src/permission/types.ts`)
  Produces: `class UiStore` with `constructor(app: App, sessionID: string)`, `subscribe(cb: () => void): () => void`,
    `getSnapshot(): UiState`, `openModal(kind: ModalKind, props?: unknown): void`, `closeModal(): void`,
    `toast(text: string, kind?: ToastKind): void`, `replyPermission(reply, feedback?): void`,
    `setSessionID(id: string): void`, `appendSynthetic(message: Message): void`,
    `setReonboarding(on: boolean): void`, `dispose(): void`
Steps:
- [ ] 1. Write `test/tui/store.test.ts`. Build a real `new Bus()` and a fake `app` (object literal
       with `bus`, `store` = a fake `SessionStore` returning a seed `SessionInfo` and `[]` messages,
       `engine` = `{ contextInfo: () => ({ tokens: 10, usable: 100, pct: 10 }) }`, `permissions` =
       `{ pendingRequests: () => pend, reply: spy }`, `auth` = `{ resolveKey: () => undefined }`).
       Assert:
       - after `bus.publish({ type:"message.created", message: userMsg })` → `getSnapshot().history`
         has the user message.
       - `message.created` (assistant) sets `live`; a `part.delta` appends to the live text after the
         throttle flush — drive the flush by calling the store's exposed test hook or by publishing
         `session.status idle` (which forces an immediate flush per §6.3). Assert `live` text.
       - on `session.status idle` → `live` moves into `history`, `live` becomes null, and `context`
         updates to `{tokens:10,...}` (pulled).
       - `part.updated` with a `tool` part `{ tool:"write", args:{ filePath:"a.ts" } }` adds `"a.ts"`
         to `changedFiles` (deduped on a second identical event).
       - `permission.asked` sets `permission`; a second ask queues; `replyPermission("once")` calls
         `app.permissions.reply(id,"once",undefined)` and advances to the queued one.
       - an event for a DIFFERENT `sessionID` (a subtask child) is ignored (history unchanged).
       - `subscribe` fires on change; `dispose` unsubscribes.

- [ ] 2. Run → FAIL (module missing).
- [ ] 3. Implement `src/tui/store.ts` exactly per spec §6. Key points to get right:
       - Hold private mutable `state: UiState`; `getSnapshot()` returns the SAME frozen reference
         until a change, then a NEW object (so `useSyncExternalStore` detects change by identity).
       - Subscribe to `app.bus` in the constructor; the listener switch mirrors the §6.3 table.
       - **Throttle**: buffer `part.delta` text; a `setInterval`/`setTimeout(25)` coalesces into a
         new snapshot + notify; `session.status idle` clears the timer and flushes immediately.
       - **Active-session filter**: ignore events whose `sessionID` ≠ current (except keep the store
         robust to `message`/`session` events that carry a nested `.session`/`.message` with the id).
       - **Permission queue** + ghost-guard via `app.permissions.pendingRequests()`.
       - `changedFiles` from `part.updated` where `part.type==="tool" && part.tool ∈ {edit,write}` →
         push `part.args.filePath ?? part.args.path` if not already present.
       - `connectorReady`: recompute on `session.updated`/model change from
         `app.auth?.resolveKey(providerID)` where providerID = `session.model?.split("/")[0]` or the
         config model's provider.
       - `appendSynthetic(m)` pushes to `history` + notifies. `openModal/closeModal/toast/
         setReonboarding/setSessionID` mutate state + notify. `toast` auto-clears after 4s.
       - `scrollBy(delta)` adjusts `state.scrollOffset` (clamped to `[0, maxOffset]`). When new
         history/live content arrives while `scrollOffset===0`, stay at 0 (auto-follow tail); when
         `scrollOffset>0`, leave it (frozen) but re-clamp to the new max.
       - `changedFiles` reads `part.args.filePath` only (both edit and write tools use `filePath`;
         narrow `part.args` as `{ filePath?: string }` — do NOT use `any`).
       - `dispose()` unsubscribes + clears timers.
       Implement `UiStore` as `implements UiStoreLike` (Task 5) so `CommandContext.store` type-checks.
- [ ] 4. Run → pass; `~/.bun/bin/bun test` (full) green; `./node_modules/.bin/tsc --noEmit` clean
       (the Task 5 `./store.ts` type-only import now resolves).
- [ ] 5. Commit "feat(tui): UiStore bus→state reducer"

---

## Phase 3 — components (rendered/tested with ink-testing-library)

> Shared testing note for every Phase 3–5 task: import `{ render }` from `ink-testing-library`,
> wrap the component under test in the providers it needs (`<ThemeProvider prefs={...}>`,
> `<UiProvider store={...}>` from Task 15), and assert on `lastFrame()`. Drive keys with
> `stdin.write("[B")` (down), `"\r"` (enter), `""` (esc).

## Task 15: React glue — ThemeProvider/useTheme + UiProvider/useUi

Files: create `src/tui/context.tsx`; create `test/tui/context.test.tsx`
Interfaces:
  Consumes: `THEMES`/`Theme`/`DEFAULT_THEME` (Task 7), `ICONS`/`BORDERS`/`LOGO` (Task 8),
    `UiPrefs` (Task 6), `UiStore`/`UiState` (Tasks 5/14)
  Produces: `ThemeProvider({ prefs, children })`; `useTheme(): { theme: Theme; icons; borders; logo; density }`;
    `UiProvider({ store, children })`; `useUi(): UiState`; `useStore(): UiStore`
Steps:
- [ ] 1. Write `test/tui/context.test.tsx`: a probe component reads `useTheme().theme.accent` and
       renders it; render inside `<ThemeProvider prefs={{...DEFAULT_PREFS, theme:"dracula"}}>` and
       assert `lastFrame()` contains `#bd93f9`. A second probe reads `useUi().status` from a fake
       store and asserts it renders "idle".
- [ ] 2. Run → FAIL.
- [ ] 3. Implement two React contexts. `ThemeProvider` resolves `THEMES[prefs.theme] ?? THEMES[DEFAULT_THEME]`,
       applies `prefs.accent` override onto `theme.accent`, and selects `ICONS[prefs.glyphs]`,
       `BORDERS[prefs.borders]`, `LOGO[prefs.logo]`, `prefs.density`. `UiProvider` wires
       `useSyncExternalStore(store.subscribe, store.getSnapshot)` and exposes it via `useUi()`; the
       store itself via `useStore()`.
- [ ] 4. Run → pass; tsc clean.
- [ ] 5. Commit "feat(tui): theme + ui React context"

## Task 16: Spinner (dependency-free frame timer)

Files: create `src/tui/components/Spinner.tsx`; create `test/tui/spinner.test.tsx`
Interfaces:
  Consumes: `useTheme` (Task 15)
  Produces: `Spinner({ label? }: { label?: string })` — cycles `icons.spinner` on a 80 ms timer
Steps:
- [ ] 1. Test: render `<Spinner label="working"/>` inside ThemeProvider; assert `lastFrame()`
       contains `working` and one of the ascii spinner frames (`|`,`/`,`-`,`\`).
- [ ] 2. Run → FAIL. 3. Implement with `useState` frame index + `useEffect` `setInterval(80)` cleared
       on unmount; render `<Text color={theme.accent}>{frame} {label}</Text>`.
- [ ] 4. Run → pass; tsc clean. 5. Commit "feat(tui): Spinner component"

## Task 17: Markdown (minimal inline renderer)

Files: create `src/tui/components/Markdown.tsx`; create `test/tui/markdown.test.tsx`
Interfaces:
  Consumes: `useTheme`
  Produces: `Markdown({ text }: { text: string })` → themed `<Text>` runs
Steps:
- [ ] 1. Test: headings (`# H`) render bold; `**bold**` bold; `` `code` `` in `theme.accentAlt`;
       `- item` as `bullet item`; plain lines pass through. Assert substrings + that markup chars are
       stripped (e.g. no literal `**`).
- [ ] 2. Run → FAIL. 3. Implement a line-based parser (no external md lib): split on `\n`, per line
       apply regexes for heading/bullet/inline-bold/inline-code, emit nested `<Text>`; unmatched →
       plain. Keep it small and total (never throw).
- [ ] 4. Run → pass; tsc clean. 5. Commit "feat(tui): minimal markdown renderer"

## Task 18: Diff (inline unified diff)

Files: create `src/tui/components/Diff.tsx`; create `test/tui/diff.test.tsx`
Interfaces:
  Consumes: `useTheme`
  Produces: `Diff({ oldText, newText, path }: { oldText: string; newText: string; path: string })`
Steps:
- [ ] 1. Test: `<Diff oldText={"a\nb"} newText={"a\nc"} path="f.ts"/>` shows `path`, a `-b` line in
       `theme.diffDel`, a `+c` line in `theme.diffAdd`, context `a` dim.
- [ ] 2. Run → FAIL. 3. Implement a minimal line diff (LCS or the simple `diff` pkg is NOT a dep —
       hand-roll a naive line-by-line compare; for equal-length just mark changed lines; for
       unequal, fall back to "-all old / +all new"). Cap at ~20 rendered lines with a `… N more`.
- [ ] 4. Run → pass; tsc clean. 5. Commit "feat(tui): inline diff component"

## Task 19: ToolLine

Files: create `src/tui/components/ToolLine.tsx`; create `test/tui/toolline.test.tsx`
Interfaces:
  Consumes: `useTheme`, `Spinner` (Task 16), `Part` (tool variant, `src/session/types.ts`)
  Produces: `ToolLine({ part }: { part: Part & { type: "tool" } })`
Steps:
- [ ] 1. Test: a running tool part renders the tool name + Spinner; a completed part renders
       `icons.ok` in `theme.toolOk` + title; an error part renders `icons.err` in `theme.toolErr`.
- [ ] 2. Run → FAIL. 3. Implement a single row: `{status===running ? <Spinner/> : status==="error" ?
       err : ok} {tool} {title ?? ""}`; if `part.tool==="edit"` and args present, render nothing here
       (the Message renders `<Diff/>`). 4. pass; tsc clean. 5. Commit "feat(tui): ToolLine component"

## Task 20: Message

Files: create `src/tui/components/Message.tsx`; create `test/tui/message.test.tsx`
Interfaces:
  Consumes: `useTheme`, `Markdown`, `ToolLine`, `Diff`, `Message`/`Part` types
  Produces: `MessageView({ message }: { message: Message })`
Steps:
- [ ] 1. Test: a user message renders its text prefixed with `icons.prompt` in `theme.roleUser`; an
       assistant message with a `text` part renders via Markdown; a `tool` part renders a ToolLine; an
       `edit` tool part with `args.oldString/newString` renders a `<Diff/>`; a `reasoning` part renders
       dim.
- [ ] 2. Run → FAIL. 3. Implement mapping over `message.parts` by `part.type`. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): MessageView component"

## Task 21: Transcript (bottom-anchored scroll viewport)

Files: create `src/tui/components/Transcript.tsx`; create `test/tui/transcript.test.tsx`
Interfaces:
  Consumes: `useUi` (Task 15), `MessageView` (Task 20)
  Produces: `Transcript({ height }: { height: number })` — renders a bottom-anchored, scrollable
    window of `[...history, ...(live?[live]:[])]` sized to `height` rows; scroll driven by
    `state.scrollOffset` (0 = following the tail)
IMPORTANT: **Do NOT use Ink `<Static>`.** In alternate-screen mode the terminal has no scrollback,
so Static content that overflows the top is lost and unreachable. The transcript must own its own
scroll viewport instead.
Steps:
- [ ] 1. Test: snapshot `history:[u1,a1,u2,a2]`, `live:null`, `scrollOffset:0`, small `height` →
       assert the MOST RECENT messages render (tail-anchored) and older ones are clipped; with
       `scrollOffset` > 0 assert an earlier message becomes visible and the newest is clipped; with
       `live` set and `scrollOffset:0` assert the streaming message is visible at the bottom. Extract
       a pure `windowMessages(all: Message[], height: number, scrollOffset: number): Message[]` and
       unit-test its slicing directly (this is the load-bearing logic; keep the component thin).
- [ ] 2. Run → FAIL. 3. Implement: flatten `[...history, live].filter(Boolean)`; `windowMessages`
       returns the message slice that fits `height` rows anchored to the tail, shifted up by
       `scrollOffset` (message-granular windowing — a single message taller than the viewport renders
       from its top; row-accurate within-message scroll is a documented later refinement). Render the
       slice in a `<Box flexDirection="column" height={height} overflow="hidden">`; a `↑ N earlier`
       hint when older messages are hidden above. (App owns `scrollOffset` and computes `height`;
       Tasks 11+43.)
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): Transcript scroll viewport (no Static)"

## Task 22: Header

Files: create `src/tui/components/Header.tsx`; create `test/tui/header.test.tsx`
Interfaces:
  Consumes: `useUi`, `useTheme`
  Produces: `Header()` — `◆ coven  <model-short> · <agent> · <title>` + a rule line
Steps:
- [ ] 1. Test: with a snapshot `session:{ agent:"builder", model:"anthropic/claude-opus-4-8", title:"T" }`,
       assert frame contains `coven`, `builder`, `claude-opus-4-8` (short form after the `/`), `T`.
- [ ] 2. Run → FAIL. 3. Implement; model-short = part after last `/`. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): Header component"

## Task 23: Footer / status bar

Files: create `src/tui/components/Footer.tsx`; create `test/tui/footer.test.tsx`
Interfaces:
  Consumes: `useUi`, `useTheme`
  Produces: `Footer()` — `? help │ ⛁ <tokens> (<pct>%) │ $<cost> │ ✓ no diagnostics │ <model>`
Steps:
- [ ] 1. Test: snapshot `context:{tokens:12400,usable:100000,pct:12}`, `session.cost:0.02` →
       frame contains `help`, `12%`, `$0.02`, `no diagnostics`, model short. Second test: `pct:97` →
       the pct text is rendered in `theme.error` (assert the color escape by checking `lastFrame()`
       contains the error hex or use `chalk`-free check: render pct in a `<Text color>` and assert via
       a data-testid-free substring of the number; keep the color assertion to "pct>=95 path taken"
       by exposing a pure helper `pctColor(pct, theme)` and unit-testing THAT in the same file).
- [ ] 2. Run → FAIL. 3. Implement Footer + export `pctColor(pct: number, theme: Theme): string`
       (`pct>=95 → error`, `>=80 → warning`, else `fgMuted`). Format cost `$0.00`. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): Footer status bar"

## Task 24: Sidebar (Context + Modified Files real; Todo/LSP/MCP stubs)

Files: create `src/tui/components/Sidebar.tsx`; create `test/tui/sidebar.test.tsx`
Interfaces:
  Consumes: `useUi`, `useTheme`
  Produces: `Sidebar()`
Steps:
- [ ] 1. Test: snapshot `context:{tokens:10,usable:100,pct:10}`, `changedFiles:["a.ts","b.ts"]` →
       frame shows `Context`, `10%`, `a.ts`, `b.ts`, and stub labels `LSP` and `MCP`. Empty
       `changedFiles` → no `Modified Files` header.
- [ ] 2. Run → FAIL. 3. Implement panels; Modified Files hidden when empty; LSP/MCP/Todo render a
       single dim "— later" line. 4. pass; tsc clean. 5. Commit "feat(tui): Sidebar panels"

## Task 25: Home splash + Banner

Files: create `src/tui/components/Home.tsx`, `src/tui/components/Banner.tsx`; create
`test/tui/home.test.tsx`
Interfaces:
  Consumes: `useUi`, `useTheme`, `LOGO`
  Produces: `Home()`; `Banner({ text, kind }: { text: string; kind: ToastKind })`
Steps:
- [ ] 1. Test: `<Home/>` (empty session snapshot) renders the logo text, `Ask anything`, the
       `<agent> · <model>` line, and the hint `ctrl+p commands`. `<Banner text="no key" kind="warn"/>`
       renders `no key`.
- [ ] 2. Run → FAIL. 3. Implement Home centered with `LOGO`, an example prompt, model/agent line,
       and hint row `tab agents · ctrl+p commands · ? help`. Banner = a bordered themed row.
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): Home splash + Banner"

## Task 26: PromptEditor (buffer + cursor + autocomplete popover)

Files: create `src/tui/input/editor.tsx`; create `test/tui/editor.test.tsx`
Interfaces:
  Consumes: `TextBuffer` (Task 9), `completionsFor` (Task 10), `InputHistory` (Task 12),
    `useTheme`, `useUi`, Ink `useInput`/`useStdout`
  Produces: `PromptEditor({ items, onSubmit, onShell, active }: { items: PaletteItem[];
    onSubmit(text: string): void; onShell(cmd: string): void; active: boolean })`; exposes an
    `onPopoverChange?(open: boolean)` callback prop so the parent keymap knows popover state
Steps:
- [ ] 1. Test (ink-testing-library `stdin.write`): type `/re` → popover lists `rename/resume/review`
       (given `items`); press Tab → buffer completes to the first match; type text + Enter → `onSubmit`
       called with the text; type `!ls` + Enter → `onShell("ls")` called. Because `useInput` needs raw
       mode, wrap the render with the ink-testing-library stdin (it provides `isRawModeSupported`);
       if a keypress path is awkward to drive, unit-test the pure reducers (`applyKey(buffer, key)`)
       extracted into `editor-reducer.ts` and keep the component thin.
- [ ] 2. Run → FAIL. 3. Implement: hold a `TextBuffer` in a ref + a `version` state to force
       re-render; `useInput` routes editing keys into the buffer, Enter → submit/complete, `\`-suffix
       or shift+enter → newline; compute `completionsFor(buffer.value(), cursorIndex, items, files)`
       each render; render the input line with a cursor glyph + a popover list below (max 8) with the
       highlighted row in `theme.selectionBg`. Position the real terminal cursor with
       `useCursor().setCursorPosition({x,y})`, computing `x` with a display-width helper (`string-width`,
       an ink transitive dep, or import it) so wide/CJK/emoji glyphs don't misplace the cursor — naive
       char-count columns are wrong for wide glyphs. Extract `applyKey`/`cursorIndex` as pure helpers in
       `src/tui/input/editor-reducer.ts` for the unit tests. `files` = a lazy workspace file lister
       (reuse `util/glob.ts` if present; else `node:fs` readdir of cwd, cap 500).
- [ ] 4. Run → pass; tsc clean. 5. Commit "feat(tui): PromptEditor with autocomplete popover"

---

## Phase 4 — dialogs

## Task 27: SelectDialog base (filter + scroll + nav)

Files: create `src/tui/dialogs/Select.tsx`; create `test/tui/select.test.tsx`
Interfaces:
  Consumes: `useTheme`, Ink `useInput`; `fuzzysort`
  Produces: `interface SelectOption { value: string; label: string; hint?: string; group?: string }`;
    `SelectDialog({ title, options, onSelect, onCancel, footer? }: { title: string; options: SelectOption[];
      onSelect(value: string): void; onCancel(): void; footer?: string })`
Steps:
- [ ] 1. Test: render with 5 options; assert title + all labels; `stdin.write("[B")` moves the
       highlight down (assert the 2nd label now carries the selection marker/color); typing `re`
       filters to matching labels; Enter → `onSelect(value)` of the highlighted; Esc → `onCancel()`.
       Extract a pure `filterOptions(options, query): SelectOption[]` and unit-test it too (prefix
       before fuzzy, groups preserved).
- [ ] 2. Run → FAIL. 3. Implement a bordered box (`borders`), a one-line filter, a windowed list
       (show ~10, scroll with selection), highlight via `theme.selectionBg`/`selectionFg`, group
       headers when `option.group` present. Nav keys per spec §10.1 dialog row. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): SelectDialog base"

## Task 28: Palette

Files: create `src/tui/dialogs/Palette.tsx`; create `test/tui/palette.test.tsx`
Interfaces:
  Consumes: `SelectDialog` (Task 27), `buildPaletteItems` (Task 13), `useStore`, `CommandContext`
  Produces: `Palette({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: build items from a fake ctx; render `<Palette ctx={ctx}/>`; assert categories/titles
       appear; typing `new` filters to `New session`; Enter runs that item's `run` (spy) and closes
       the modal (`ctx.closeModal` spy called).
- [ ] 2. Run → FAIL. 3. Implement: map items → `SelectOption{ value:id, label:title, hint:keybinding,
       group:category }`; `onSelect` → find item, `await item.run(ctx)`, `ctx.closeModal()`;
       `onCancel` → `ctx.closeModal()`. 4. pass; tsc clean. 5. Commit "feat(tui): command palette"

## Task 29: Help (interactive two-pane)

Files: create `src/tui/dialogs/Help.tsx`; create `test/tui/help.test.tsx`
Interfaces:
  Consumes: `useTheme`, Ink `useInput`, the keymap table (Task 11 — export a `BINDINGS` array from
    `keymap.ts` for display), `buildPaletteItems`
  Produces: `Help({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. First extend `keymap.ts`: export `BINDINGS: { key: string; action: string; category: string }[]`
       (the display form of the §10.1 table) — add a test in `keymap.test.ts` asserting `BINDINGS`
       includes `{ key:"ctrl+p", action:"Command palette", category:"Global" }`.
- [ ] 2. Test `Help`: render; assert left categories `Shortcuts`, `Commands`, `Agents`, `Skills`,
       `Permissions`, `Getting started`; default pane shows a shortcut row (`ctrl+p`); `stdin.write("[B")`
       moves category and the right pane updates; typing filters across panes; Esc closes.
- [ ] 3. Run → FAIL. 4. Implement custom two-pane (not SelectDialog): a category list (left) + a
       scrollable detail (right) sourced from `BINDINGS` (Shortcuts), `buildPaletteItems` (Commands),
       `ctx.app.agents.primaries()` (Agents), `ctx.app.skills.all()` (Skills), and static copy for
       Permissions + Getting started. A `/`-filter narrows the visible rows across the active pane.
- [ ] 5. pass; tsc clean. 6. Commit "feat(tui): interactive Help guide"

## Task 30: WhichKey cheatsheet

Files: create `src/tui/dialogs/WhichKey.tsx`; create `test/tui/whichkey.test.tsx`
Interfaces:
  Consumes: `BINDINGS` (Task 29 addition), `useTheme`
  Produces: `WhichKey({ onCancel }: { onCancel(): void })`
Steps:
- [ ] 1. Test: renders a grid of `key → action` from `BINDINGS`; Esc → `onCancel`.
- [ ] 2. Run → FAIL. 3. Implement a compact multi-column grid. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): which-key cheatsheet"

## Task 31: Sessions dialog

Files: create `src/tui/dialogs/Sessions.tsx`; create `test/tui/sessions.test.tsx`
Interfaces:
  Consumes: `SelectDialog`, `useStore`, `app.store.list()`
  Produces: `Sessions({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: fake `app.store.list()` → 2 sessions; render; assert titles + agent + msg counts;
       Enter → `ctx.store.setSessionID(id)` (spy) then `ctx.closeModal()`.
- [ ] 2. Run → FAIL. 3. Implement via SelectDialog (options from list, label = `title  ·  agent  ·  N msgs`).
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): Sessions dialog"

## Task 32: Models dialog

Files: create `src/tui/dialogs/Models.tsx`; create `test/tui/models.test.tsx`
Interfaces:
  Consumes: `SelectDialog`, `app.catalog.list()`, `app.auth.resolveKey`, `engine.setModel`
  Produces: `Models({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: fake catalog with 2 providers × 2 models; render; assert grouped labels with ctx
       window + `$in/$out`; a provider with a resolvable key shows a `✓`; Enter → `engine.setModel(
       session.id, "provider/model")` (spy) + `ctx.store` recentModels updated via `ctx.setPrefs`.
- [ ] 2. Run → FAIL. 3. Implement: options from `catalog.list()`, `group = providerID`,
       `label = name  <ctx>  $in/$out`, `hint = ✓` when `auth.resolveKey(providerID)`. onSelect →
       `ctx.app.engine.setModel(...)`, push to `prefs.recentModels` (MRU, cap 8), close.
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): Models dialog"

## Task 33: Agents dialog

Files: create `src/tui/dialogs/Agents.tsx`; create `test/tui/agents.test.tsx`
Interfaces:
  Consumes: `SelectDialog`, `app.agents.primaries()`, `engine.setAgent`
  Produces: `Agents({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: fake primaries → render labels `name  ·  mode  ·  description`; Enter →
       `engine.setAgent(session.id, name)` (spy) + close.
- [ ] 2. Run → FAIL. 3. Implement via SelectDialog. 4. pass; tsc clean. 5. Commit "feat(tui): Agents dialog"

## Task 34: Themes dialog with live preview

Files: create `src/tui/dialogs/Themes.tsx`; create `test/tui/themes.test.tsx`
Interfaces:
  Consumes: `SelectDialog` (or custom), `THEMES`, `ctx.setPrefs`, `useTheme` (to preview)
  Produces: `Themes({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: render; assert all 7 theme labels; moving the highlight calls a preview callback that
       applies the theme (assert the surrounding provider’s accent changes on `[B`); Enter commits via
       `ctx.setPrefs({ theme })` + close; Esc reverts to the entry theme (assert `setPrefs` NOT called).
- [ ] 2. Run → FAIL. 3. Implement: on highlight change, call `ctx.setPrefs({ theme })` immediately for
       live preview BUT remember the entry theme; Enter keeps it; Esc restores entry theme via
       `ctx.setPrefs({ theme: entry })`. (Preview writes prefs; that is acceptable and reverts on Esc.)
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): Themes dialog with live preview"

## Task 35: Skills dialog

Files: create `src/tui/dialogs/Skills.tsx`; create `test/tui/skills.test.tsx`
Interfaces:
  Consumes: custom two-pane or SelectDialog, `app.skills.all()`
  Produces: `Skills({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: fake `skills.all()` → list names; selecting shows the `description`/`content` preview.
- [ ] 2. Run → FAIL. 3. Implement (SelectDialog list + a detail line, or two-pane). 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): Skills dialog"

## Task 36: Permission dialog

Files: create `src/tui/dialogs/Permission.tsx`; create `test/tui/permission.test.tsx`
Interfaces:
  Consumes: `useUi` (reads `state.permission`), `useStore` (`replyPermission`), `useTheme`
  Produces: `Permission()` — renders when `state.permission` is set
Steps:
- [ ] 1. Test: fake store snapshot with `permission:{ id:"p1", sessionID:"s1", permission:"bash",
       patterns:["git push"], title:"run git push", metadata:{} }` (include `sessionID` — it is
       required on `PermissionRequest`); render; assert `bash`, `git push`, `run git push`, and the
       `[y]es [a]lways [n]o` row; `stdin.write("y")` → `store.replyPermission("once")` (spy); `stdin.write("n")`
       then type feedback + Enter → `replyPermission("reject", feedback)`; `metadata.dangerous:true`
       renders a DANGEROUS banner.
- [ ] 2. Run → FAIL. 3. Implement per spec §12 Permission row. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): Permission dialog"

## Task 37: Confirm + Prompt dialogs

Files: create `src/tui/dialogs/Confirm.tsx`, `src/tui/dialogs/Prompt.tsx`; create
`test/tui/confirm-prompt.test.tsx`
Interfaces:
  Consumes: `useTheme`, Ink `useInput`
  Produces: `Confirm({ message, onYes, onNo }: {...})`; `Prompt({ message, initial?, mask?, onSubmit, onCancel }: {...})`
Steps:
- [ ] 1. Test: Confirm renders message + `y/n`; `y` → `onYes`; `n` → `onNo`. Prompt renders message;
       typing + Enter → `onSubmit(text)`; `mask:true` hides chars (assert the typed key is not echoed);
       Esc → `onCancel`.
- [ ] 2. Run → FAIL. 3. Implement (Prompt reuses `TextBuffer` single-line). 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): Confirm + Prompt dialogs"

## Task 38: Status dialog

Files: create `src/tui/dialogs/Status.tsx`; create `test/tui/status.test.tsx`
Interfaces:
  Consumes: `useUi`, `useTheme`, `app.tts?.status()`, `app.auth?.entries()`
  Produces: `Status({ ctx }: { ctx: CommandContext })`
Steps:
- [ ] 1. Test: render with a snapshot + fake `tts.status()="off (backend: spd available)"` and
       `auth.entries()` → assert session id/title, agent, model, `12%`, cost, the tts line, and a
       connectors line.
- [ ] 2. Run → FAIL. 3. Implement a read-only bordered panel; Esc closes. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): Status dialog"

## Task 39: ModalLayer router

Files: create `src/tui/dialogs/ModalLayer.tsx`; create `test/tui/modallayer.test.tsx`
Interfaces:
  Consumes: `useUi` (`state.modal`, `state.permission`), all dialog components, `CommandContext`
  Produces: `ModalLayer({ ctx }: { ctx: CommandContext })` — renders the active dialog absolutely-centered
Steps:
- [ ] 1. Test: snapshot `modal:{kind:"palette"}` → Palette renders; `modal:{kind:"themes"}` → Themes;
       `permission` set (regardless of `modal`) → Permission renders (permission takes precedence);
       `modal:null && permission:null` → renders nothing.
- [ ] 2. Run → FAIL. 3. Implement a `switch(state.permission ? "permission" : state.modal?.kind)`
       returning the dialog inside a `<Box position="absolute" width="100%" height="100%"
       justifyContent="center" alignItems="center">` wrapper with an opaque `backgroundColor`.
       **Per-kind prop map** (from `state.modal.props: ModalProps` + `ctx`): `permission` → `<Permission/>`
       (reads store itself, no props); `palette|help|status|skills` → `<X ctx={ctx}/>`;
       `sessions|models|agents|themes` → `<X ctx={ctx}/>`; `whichkey` → `<WhichKey onCancel={ctx.closeModal}/>`;
       `prompt` → `<Prompt message={props.message} initial={"initial" in props ? props.initial : ""}
       mask={props.kind==="login"} onSubmit={props.onSubmit} onCancel={ctx.closeModal}/>`;
       `confirm` → `<Confirm message={props.message} onYes={props.onYes} onNo={props.onNo}/>`. Narrow
       `props` by `props.kind` (the `ModalProps` discriminant) — no `any`.
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): ModalLayer router"

---

## Phase 5 — onboarding

## Task 40: detectNerdFont (best-effort)

Files: create `src/tui/onboarding/nerdfont.ts`; create `test/tui/nerdfont.test.ts`
Interfaces:
  Consumes: nothing (reads `process.env`)
  Produces: `detectNerdFont(env?: NodeJS.ProcessEnv): "likely" | "unlikely" | "unknown"`
Steps:
- [ ] 1. Test: env with `TERM_PROGRAM="WezTerm"` → `"likely"`; env with a `*NERD_FONT*` hint →
       `"likely"`; empty env → `"unknown"`; a known-poor terminal (`TERM="dumb"`) → `"unlikely"`.
- [ ] 2. Run → FAIL. 3. Implement the heuristic per spec §13 (inspect `TERM`, `TERM_PROGRAM`,
       `LC_TERMINAL`, any `NERD` env marker). Never throws. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): best-effort Nerd Font detection"

## Task 41: Wizard step components

Files: create `src/tui/onboarding/steps.tsx`; create `test/tui/onboarding-steps.test.tsx`
Interfaces:
  Consumes: `THEMES`, `ICONS`, `ENV_KEYS` (`src/auth/index.ts`), `detectNerdFont` (Task 40),
    `SelectDialog`/`Prompt` primitives, `useTheme`
  Produces: `ThemeStep`, `AccentStep`, `LayoutStep`, `GlyphStep`, `ConnectorStep` — each
    `({ value, onChange, onNext, onBack }: StepProps<T>)`; a shared `StepProps<T>` type
Steps:
- [ ] 1. Test each step renders its choices and calls `onChange` on navigation and `onNext` on Enter:
       ThemeStep lists 7 themes + live preview; GlyphStep shows a sample rendered both nerd/ascii + the
       `detectNerdFont` note when `"unlikely"`; ConnectorStep lists `Object.keys(ENV_KEYS)` and marks
       env-satisfied providers with `✓`.
- [ ] 2. Run → FAIL. 3. Implement the five step components. 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): onboarding step components"

## Task 42: OnboardingWizard orchestrates the 5 steps

Files: create `src/tui/onboarding/Wizard.tsx`; create `test/tui/onboarding-wizard.test.tsx`
Interfaces:
  Consumes: the step components (Task 41), `UiPrefs`/`savePrefs` (Task 6), `AuthStore` (via `ctx.app.auth`)
  Produces: `OnboardingWizard({ ctx, onDone }: { ctx: CommandContext; onDone(): void })`
Steps:
- [ ] 1. Test: render; walk theme→accent→layout→glyph→connector via Enter; on the connector step,
       choosing a provider + entering a key calls `ctx.app.auth.set(provider, key)` (spy); finishing
       calls `ctx.setPrefs({ onboarded:true, ... })` and `onDone()`. `ctrl+c` at any step → defaults +
       `onboarded:true` + `onDone()`.
- [ ] 2. Run → FAIL. 3. Implement a step index state machine collecting choices, persisting on finish.
- [ ] 4. pass; tsc clean. 5. Commit "feat(tui): onboarding wizard"

---

## Phase 6 — integration, fallback, entry swap, packaging

## Task 43: App root — layout, providers, keymap wiring, CommandContext, send

Files: create `src/tui/app.tsx`; create `test/tui/app.test.tsx`
Interfaces:
  Consumes: everything from Phases 1–5; Ink `render`/`useWindowSize`/`useInput`/`useApp`
  Produces: `App({ app }: { app: App })`; and the CommandContext factory used app-wide
Note on optional App members: `app.commands`, `app.catalog`, `app.auth`, `app.tts` are optional in
`src/app.ts`. Under strict TS every access must guard (`if (!app.catalog) { ctx.toast("catalog
unavailable","warn"); return; }` inside the relevant item `run`, or `app.tts?.`). Never assume
present; never use `!` non-null assertions to silence it.
Steps:
- [ ] 1. Test (ink-testing-library, no real alt-screen): render `<App app={fakeApp}/>` with an
       onboarded prefs file; assert the Home splash shows for an empty session; simulate `ctrl+p`
       (`stdin.write("")`) → the Palette modal appears; Esc closes it; type text + Enter →
       `fakeApp.engine.prompt` called. Add a focused ctrl+c test: idle with a non-empty buffer →
       ctrl+c clears the buffer (no exit); busy → ctrl+c calls `abort`; two ctrl+c within 1.5 s (call
       the exposed handler twice) → `host.quit`. Keep the render test smoke-level; per-widget behavior
       is already covered by earlier tasks.
- [ ] 2. Run → FAIL. 3. Implement per spec §7: build the `UiStore`, construct the `CommandContext`
       including the `host: CommandHost` object (Task 5) with real closures — `redraw()` calls the Ink
       instance's `clear()`+force re-render; `openEditor()` suspends Ink (`useApp().suspendTerminal` or
       unmount→spawn `$EDITOR`→remount) and loads the edited text into the PromptEditor; `attachFile()`
       seeds an `@` into the editor buffer; `exportTranscript()` writes markdown; `interrupt()` aborts
       the active turn; `quit()` unmounts then exits. `send` = set busy + `AbortController` +
       `engine.prompt(session.id, text, abort, override)` + tts on completion.
       - **`gateShell(cmd)`** on ctx = call `app.permissions.ask(session.id, { permission:"bash",
         pattern: cmd, title: cmd }, agent.permission)` and return whether the verdict allows (adapt to
         the real `permissions.ask` signature confirmed in `src/permission/index.ts`; mirror the old
         `Tui.gateShell`). Used by command expansion AND the shell escape.
       - **`onShell(cmd)`** passed to `<PromptEditor>`: `if (await ctx.gateShell(cmd)) { run bash -c cmd;
         append a synthetic user message via app.store.appendMessage }` (port the old `Tui.shellEscape`).
       - Compute `transcriptHeight = rows − headerRows − footerRows − editorRows − (connectorReady?0:bannerRows)`
         from `useWindowSize()`; pass to `<Transcript height={transcriptHeight}/>`.
       Wire the top-level `useInput` through `resolveKey` (gated `isActive={!state.modal}`).
       Render Header / Body (`<Home/>` when `history.length===0 && !live`, else `<Transcript/>`) /
       Sidebar / a `<Banner>` when `!state.connectorReady` (guides the user to set a key) / Footer /
       PromptEditor / ModalLayer. Gate onboarding as the top-level route (render `<OnboardingWizard/>`
       instead of the layout) when `!prefs.onboarded || state.reonboarding`. Route `KeyAction`s:
       `{kind:"command",id}` → find the matching `PaletteItem` in `buildPaletteItems(ctx)` and
       `await item.run(ctx)`. `{kind:"builtin",name}` handlers:
       - `modal.close` → `store.closeModal()`
       - `popover.dismiss` → editor clears its popover (via a ref/flag)
       - `interrupt` → `ctx.host.interrupt()`
       - `scroll.up` → `store.scrollBy(+halfPage)`; `scroll.down` → `store.scrollBy(−halfPage)`
         (`halfPage = Math.floor(transcriptHeight/2)`)
       - `ctrl-c` → state machine: busy → `ctx.host.interrupt()`; else buffer non-empty →
         `store.clearInput?.()`; else previous ctrl-c < 1.5 s ago → `ctx.host.quit()`; else record the
         timestamp + `store.toast("press ctrl+c again to quit")`
       - `quit` → `ctx.host.quit()`
       - `agent.cycle`/`agent.cycle.reverse` → `engine.setAgent(session.id, next/prev of
         agents.primaries())`
- [ ] 4. Run → pass; tsc clean. 5. Commit "feat(tui): App root + integration"

## Task 44: Non-TTY fallback REPL

Files: create `src/tui/fallback.ts`; create `test/tui/fallback.test.ts`
Interfaces:
  Consumes: `App`, `Bus`, `engine.prompt`, `permissions`
  Produces: `runFallbackRepl(app: App, io?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream }): Promise<void>`
Steps:
- [ ] 1. Test: feed a scripted input stream (`"hello\n/exit\n"`) and a capture writable; assert
       `engine.prompt` called with `"hello"`, and a `permission.asked` published mid-run triggers an
       interactive `y/a/n` prompt on the input (script `"y\n"`), calling `permissions.reply(id,"once")`.
       Use in-memory streams so no TTY is needed.
- [ ] 2. Run → FAIL. 3. Implement a `node:readline` loop (per spec §14): stream `part.delta` to
       output, `[tool]` markers, handle `/`,`!`,`@`, and prompt on `permission.asked`; auto-reject if
       input closed. 4. pass; tsc clean. 5. Commit "feat(tui): non-TTY fallback REPL"

## Task 45: runTui entry — TTY vs fallback vs onboarding

Files: create/replace `src/tui/index.ts` (remove the old `Tui` class body; keep the file); create
`test/tui/runtui.test.ts`
Interfaces:
  Consumes: `App`, `App root` (Task 43), `runFallbackRepl` (Task 44), Ink `render`
  Produces: `runTui(app: App): Promise<void>`
Steps:
- [ ] 1. Test: with a fake `app` and forced `isTTY:false` (pass an injectable `tty` flag or stub
       `process.stdout.isTTY`), `runTui` calls `runFallbackRepl` (spy) and not Ink. (TTY/Ink path is
       covered by Task 43’s smoke test.)
- [ ] 2. Run → FAIL. 3. Implement: if `process.stdout.isTTY && process.stdin.isTTY` →
       `render(<App app={app}/>, { alternateScreen: true, exitOnCtrlC: false })` then
       `await instance.waitUntilExit()`; else `await runFallbackRepl(app)`. Wrap render in an error
       boundary that unmounts before rethrow (never `process.exit` while mounted). 4. pass; tsc clean.
- [ ] 5. Commit "feat(tui): runTui entry"

## Task 46: Wire src/index.ts to runTui; delete legacy renderer

Files: modify `src/index.ts`; delete `src/tui/render.ts`, `src/tui/input.ts`; modify `src/tui/index.ts`
(ensure only `runTui` + helpers remain)
Interfaces:
  Consumes: `runTui` (Task 45)
  Produces: the default `coven` subcommand launches the Ink UI
Steps:
- [ ] 1. Test: extend an existing CLI test (or add `test/cli-default-branch.test.ts`) asserting that
       importing `src/index.ts` no longer references `render.ts`/`input.ts` (grep the built module) and
       that `runTui` is the default-branch entry. A lightweight assertion: `grep -q "runTui" src/index.ts`.
- [ ] 2. Replace the default-branch `new Tui(app).run()` with `await runTui(app)`; remove now-unused
       imports. Delete `src/tui/render.ts` and `src/tui/input.ts`.
- [ ] 3. Run: `~/.bun/bin/bun test` (full suite) — fix any test that imported the deleted files
       (the old TUI unit tests, if any, are replaced by Phase 3–5 tests; delete stale ones).
- [ ] 4. `./node_modules/.bin/tsc --noEmit` → clean. 5. Commit "feat(tui): launch Ink UI from CLI; remove legacy REPL"

## Task 47: Packaging + docs + version verification

Files: modify `package.json` (already `0.3.0`), `CHANGELOG.md`, `README.md`; create
`test/tui/build-smoke.test.ts` (optional) 
Interfaces:
  Consumes: the built `dist/index.js`
  Produces: a verified installable `0.3.0` artifact
Steps:
- [ ] 1. Run the full gate: `~/.bun/bin/bun test` (all green, incl. the existing 200 + new suites);
       `./node_modules/.bin/tsc --noEmit` (clean); `~/.bun/bin/bun run build`.
- [ ] 2. Verify the node artifact loads Ink from node_modules (externalized): in a clean temp dir,
       `npm pack` the package, `npm i` the tarball, and run `node <pkg>/dist/index.js --version` →
       prints `coven 0.3.0`; and a scripted pty launch (dev-only `scripts/pty-smoke.mjs` using
       `node-pty` if available, else manual) enters and cleanly exits the alt screen.
- [ ] 3. Update `CHANGELOG.md` (new `0.3.0` section: full-screen Ink TUI, palette, autocomplete,
       Help, 7 themes, onboarding, live model/agent switching) and `README.md` (new screenshots +
       feature bullets + the grown dependency list with justifications).
- [ ] 4. Commit "chore(release): TUI 2.0 — v0.3.0" (do NOT publish; publishing is a separate,
       user-authorized step per prior workflow).

---

## Notes for the executor
- Tasks 1–14 are the load-bearing interfaces; do them in order. Phases 3–5 tasks are independent of
  each other (only depend on Phases 1–2 + Task 15/27) and may be parallelized across builders.
- If a component test is hard to drive through `useInput` raw mode under ink-testing-library, extract
  the logic into a pure reducer/helper and unit-test that (the pattern used in Tasks 23 and 26); keep
  the component a thin shell.
- Never `process.exit()` while Ink is mounted (alt-screen restore must run). Route diagnostics to
  `util/log.ts`, never `console.*`, inside the mounted app.
