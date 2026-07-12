/**
 * App root (§7): the composition point that turns an {@link App} engine into a
 * full-screen Ink UI. It owns three things the widgets can't:
 *
 *  1. Lifecycle — creates the initial session + {@link UiStore}, mounts the
 *     `ThemeProvider`/`UiProvider`, disposes on unmount.
 *  2. The {@link CommandContext} — the single object every dialog/command/editor
 *     mutates the engine through: `send`, `gateShell`, `openModal`, `setPrefs`,
 *     and the App-only {@link CommandHost} capabilities (redraw, editor, attach,
 *     export, interrupt, quit).
 *  3. Global input — a top-level `useInput` routed through {@link resolveKey}
 *     (gated off while a modal/permission owns the keyboard), including the
 *     ctrl-c state machine ({@link ctrlCAction}) and transcript scrolling.
 *
 * The onboarding wizard is a top-level route (not a modal): when prefs are not
 * `onboarded` (or on a `/onboarding` re-run) the whole layout is replaced by it.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, useApp, useInput, useWindowSize } from "ink";
import type { Key } from "ink";
import type { App } from "../app.ts";
import type { Message } from "../session/types.ts";
import { createId } from "../util/id.ts";
import { spawnCapture } from "../util/proc.ts";
import { scanBashCommand } from "../tool/bash-scan.ts";
import { ThemeProvider, UiProvider, useUi } from "./context.tsx";
import { UiStore } from "./store.ts";
import { loadPrefs, savePrefs, type UiPrefs } from "./prefs.ts";
import { resolveKey, type KeyObject } from "./keymap.ts";
import { buildPaletteItems } from "./commands.ts";
import type { CommandContext, CommandHost, KeyAction, ModalKind, ModalProps, ToastKind } from "./types.ts";
import { Header } from "./components/Header.tsx";
import { Footer } from "./components/Footer.tsx";
import { Home } from "./components/Home.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Banner } from "./components/Banner.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { ModalLayer } from "./dialogs/ModalLayer.tsx";
import { PromptEditor } from "./input/editor.tsx";
import { OnboardingWizard } from "./onboarding/Wizard.tsx";

const CTRL_C_GRACE_MS = 1500;
const SIDEBAR_MIN_COLS = 90;
const SIDEBAR_WIDTH = 32;
const HEADER_ROWS = 2; // wordmark + rule
const FOOTER_ROWS = 1;
const EDITOR_ROWS = 1;
const BANNER_ROWS = 3; // bordered notice
const SHELL_TIMEOUT_MS = 120_000;

const errMsg = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The ctrl-c state machine (pure, so it is unit-testable without the terminal):
 * a busy turn is interrupted; a non-empty buffer is cleared; two presses inside
 * {@link CTRL_C_GRACE_MS} quit; a first press on an idle empty buffer just warns.
 */
export function ctrlCAction(o: {
  busy: boolean;
  bufferEmpty: boolean;
  now: number;
  lastCtrlCAt: number;
}): "interrupt" | "clear" | "quit" | "warn" {
  if (o.busy) return "interrupt";
  if (!o.bufferEmpty) return "clear";
  if (o.now - o.lastCtrlCAt < CTRL_C_GRACE_MS) return "quit";
  return "warn";
}

/** Project Ink's rich `Key` onto the subset {@link resolveKey} reads. */
function toKeyObject(key: Key): KeyObject {
  return {
    ctrl: key.ctrl,
    shift: key.shift,
    meta: key.meta,
    return: key.return,
    escape: key.escape,
    upArrow: key.upArrow,
    downArrow: key.downArrow,
    leftArrow: key.leftArrow,
    rightArrow: key.rightArrow,
    pageUp: key.pageUp,
    pageDown: key.pageDown,
    tab: key.tab,
    backspace: key.backspace,
    delete: key.delete,
  };
}

/** True when a key press is a plain visible character bound for the editor. */
function isPrintable(input: string, key: Key): boolean {
  return (
    input.length >= 1 &&
    !key.ctrl &&
    !key.meta &&
    !key.return &&
    !key.escape &&
    !key.tab &&
    !key.backspace &&
    !key.delete &&
    !key.upArrow &&
    !key.downArrow &&
    !key.leftArrow &&
    !key.rightArrow &&
    !key.pageUp &&
    !key.pageDown
  );
}

export function App({ app }: { app: App }) {
  const [prefs, setPrefsState] = useState<UiPrefs>(() => loadPrefs());

  const setPrefs = useCallback((patch: Partial<UiPrefs>): void => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        savePrefs(next);
      } catch {
        // Persisting prefs is best-effort; a read-only home must not crash the UI.
      }
      return next;
    });
  }, []);

  // The store + its session are created exactly once (ref-guarded, not per render).
  const storeRef = useRef<UiStore | null>(null);
  if (!storeRef.current) {
    const configured = app.loaded.config.default_agent ?? "builder";
    const agentName = app.agents.get(configured) ? configured : "builder";
    const session = app.store.create({ agent: agentName });
    storeRef.current = new UiStore(app, session.id);
  }
  const store = storeRef.current;

  useEffect(() => () => store.dispose(), [store]);

  return (
    <ThemeProvider prefs={prefs}>
      <UiProvider store={store}>
        <AppShell app={app} store={store} prefs={prefs} setPrefs={setPrefs} />
      </UiProvider>
    </ThemeProvider>
  );
}

function AppShell({
  app,
  store,
  prefs,
  setPrefs,
}: {
  app: App;
  store: UiStore;
  prefs: UiPrefs;
  setPrefs(patch: Partial<UiPrefs>): void;
}) {
  const state = useUi();
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();
  const [editorEpoch, setEditorEpoch] = useState(0);

  const abortRef = useRef(new AbortController());
  const lastCtrlCRef = useRef(0);
  const bufferEmptyRef = useRef(true);
  const popoverOpenRef = useRef(false);

  const onPopoverChange = useCallback((open: boolean): void => {
    popoverOpenRef.current = open;
  }, []);

  // The editor reports its real emptiness (incl. backspace-to-empty), so empty-buffer
  // keybindings (? help, tab agent-cycle, ctrl+d quit) re-arm precisely.
  const clearFnRef = useRef<(() => void) | null>(null);
  const onEmptyChange = useCallback((empty: boolean): void => {
    bufferEmptyRef.current = empty;
  }, []);
  const registerClear = useCallback((fn: () => void): void => {
    clearFnRef.current = fn;
  }, []);

  const onboarding = !prefs.onboarded || state.reonboarding;
  const bannerRows = state.connectorReady ? 0 : BANNER_ROWS;
  const transcriptHeight = Math.max(3, rows - HEADER_ROWS - FOOTER_ROWS - EDITOR_ROWS - bannerRows);
  const halfPage = Math.max(1, Math.floor(transcriptHeight / 2));
  const isHome = state.history.length === 0 && !state.live;
  const inputActive = state.modal === null && state.permission === null;
  const showSidebar = prefs.sidebar && columns >= SIDEBAR_MIN_COLS;

  const clearInput = (): void => {
    bufferEmptyRef.current = true;
    if (clearFnRef.current) clearFnRef.current();
    else setEditorEpoch((epoch) => epoch + 1); // fallback if the editor hasn't registered yet
  };

  const send = async (text: string, override?: { agent?: string; model?: string }): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const sessionID = store.getSnapshot().session.id;
    try {
      const final = await app.engine.prompt(sessionID, text, controller.signal, override);
      if (app.tts?.enabled) {
        const spoken = final.parts
          .filter((part) => part.type === "text" && !part.synthetic)
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n");
        if (spoken) app.tts.speak(spoken);
      }
    } catch (error) {
      if (!controller.signal.aborted) store.toast(errMsg(error), "error");
    }
  };

  const gateShell = async (command: string): Promise<boolean> => {
    const scan = scanBashCommand(command);
    const snapshot = store.getSnapshot();
    const agentRules = app.agents.get(snapshot.session.agent)?.permission ?? [];
    try {
      await app.permissions.ask(
        snapshot.session.id,
        {
          permission: "bash",
          patterns: scan.dangerous ? [`dangerous: ${command.slice(0, 80)}`] : scan.patterns,
          title: `command wants to run: ${command.slice(0, 100)}`,
          metadata: { command, dangerous: scan.dangerous },
        },
        agentRules,
      );
      return true;
    } catch {
      return false;
    }
  };

  /** `!cmd` shell escape: permission-gated run, then record the output for the model. */
  const runShell = async (command: string): Promise<void> => {
    if (!command) return;
    if (!(await gateShell(command))) {
      store.toast("shell command denied", "warn");
      return;
    }
    const result = await spawnCapture(["bash", "-c", command], { cwd: app.loaded.root, timeoutMs: SHELL_TIMEOUT_MS });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const snapshot = store.getSnapshot();
    const message: Message = {
      id: createId("msg"),
      sessionID: snapshot.session.id,
      role: "user",
      agent: snapshot.session.agent,
      parts: [
        {
          id: createId("prt"),
          type: "text",
          text: `I ran \`${command}\` myself:\n\`\`\`\n${output.slice(0, 8_000) || "(no output)"}\n\`\`\`${
            result.exitCode !== 0 ? `\n(exit code ${result.exitCode})` : ""
          }`,
          synthetic: true,
        },
      ],
      time: Date.now(),
    };
    app.store.appendMessage(message); // persist so the next turn's context includes it
    store.appendSynthetic(message); // and show it in the transcript now
  };

  const exportTranscript = async (): Promise<void> => {
    const snapshot = store.getSnapshot();
    const lines: string[] = [`# Coven session — ${snapshot.session.title}\n`];
    for (const message of app.store.messagesOf(snapshot.session.id)) {
      lines.push(`## ${message.role === "user" ? "**You**" : `**Coven (${message.agent})**`}\n`);
      for (const part of message.parts) {
        if (part.type === "text") lines.push(part.text + "\n");
        else if (part.type === "tool") lines.push(`> \`${part.tool}\` ${part.title ?? ""} — ${part.status}\n`);
      }
    }
    const file = join(app.loaded.root, `coven-${snapshot.session.id.slice(-8)}.md`);
    try {
      writeFileSync(file, lines.join("\n"));
      store.toast(`exported → ${file}`, "success");
    } catch (error) {
      store.toast(errMsg(error), "error");
    }
  };

  const host: CommandHost = {
    redraw: () => setEditorEpoch((epoch) => epoch + 1),
    // Ink 7 exposes no terminal-suspend hook, so a full external-editor round-trip
    // would require unmount/remount (losing UI state); guide the user instead.
    openEditor: async () => {
      store.toast("open $EDITOR: unavailable in this build — paste multi-line with shift+enter", "warn");
    },
    attachFile: () => store.toast("type @path to attach a file to your prompt", "info"),
    exportTranscript,
    interrupt: () => {
      abortRef.current.abort();
      store.toast("interrupted", "warn");
    },
    quit: () => exit(),
  };

  const ctx: CommandContext = {
    app,
    store,
    session: state.session,
    get abort() {
      return abortRef.current.signal;
    },
    host,
    send,
    gateShell,
    openModal: (kind: ModalKind, props?: ModalProps) => store.openModal(kind, props),
    closeModal: () => store.closeModal(),
    toast: (text: string, kind?: ToastKind) => store.toast(text, kind),
    prefs,
    setPrefs,
  };

  const items = buildPaletteItems(ctx);

  const cycleAgent = (direction: number): void => {
    const primaries = app.agents.primaries();
    if (primaries.length === 0) return;
    const currentIndex = primaries.findIndex((agent) => agent.name === state.session.agent);
    const base = currentIndex < 0 ? 0 : currentIndex;
    const next = primaries[(base + direction + primaries.length) % primaries.length];
    if (!next) return;
    try {
      app.engine.setAgent(state.session.id, next.name);
    } catch (error) {
      store.toast(errMsg(error), "warn");
    }
  };

  const handleCtrlC = (): void => {
    const decision = ctrlCAction({
      busy: state.status === "busy",
      bufferEmpty: bufferEmptyRef.current,
      now: Date.now(),
      lastCtrlCAt: lastCtrlCRef.current,
    });
    switch (decision) {
      case "interrupt":
        host.interrupt();
        break;
      case "clear":
        clearInput();
        break;
      case "quit":
        host.quit();
        break;
      case "warn":
        lastCtrlCRef.current = Date.now();
        store.toast("press ctrl+c again to quit");
        break;
    }
  };

  const runAction = (action: KeyAction, input: string, key: Key): void => {
    if (action.kind === "command") {
      // A `?`/single-char binding also lands in the editor's buffer; drop it.
      if (isPrintable(input, key)) setEditorEpoch((epoch) => epoch + 1);
      const item = items.find((candidate) => candidate.id === action.id);
      if (item) void Promise.resolve(item.run(ctx)).catch((error) => store.toast(errMsg(error), "error"));
      return;
    }
    switch (action.name) {
      case "modal.close":
        store.closeModal();
        break;
      case "popover.dismiss":
        break; // the editor dismisses its own popover on esc
      case "interrupt":
        host.interrupt();
        break;
      case "scroll.up":
        store.scrollBy(halfPage);
        break;
      case "scroll.down":
        store.scrollBy(-halfPage);
        break;
      case "ctrl-c":
        handleCtrlC();
        break;
      case "quit":
        host.quit();
        break;
      case "agent.cycle":
        cycleAgent(1);
        break;
      case "agent.cycle.reverse":
        cycleAgent(-1);
        break;
      default:
        break;
    }
  };

  useInput(
    (input, key) => {
      const action = resolveKey(input, toKeyObject(key), {
        modalOpen: state.modal !== null,
        busy: state.status === "busy",
        popoverOpen: popoverOpenRef.current,
        bufferEmpty: bufferEmptyRef.current,
      });
      if (!action) {
        if (isPrintable(input, key)) bufferEmptyRef.current = false;
        return;
      }
      runAction(action, input, key);
    },
    { isActive: inputActive && !onboarding },
  );

  if (onboarding) {
    return <OnboardingWizard ctx={ctx} onDone={() => store.setReonboarding(false)} />;
  }

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header />
      <Box flexGrow={1} flexDirection="row">
        <Box flexGrow={1} flexDirection="column">
          {isHome ? <Home /> : <Transcript height={transcriptHeight} />}
        </Box>
        {showSidebar ? (
          <Box width={SIDEBAR_WIDTH} flexShrink={0}>
            <Sidebar />
          </Box>
        ) : null}
      </Box>
      {state.connectorReady ? null : (
        <Banner
          text="No API key for the active model — press ctrl+p → Login, or run: coven auth login"
          kind="warn"
        />
      )}
      {state.toast ? <Banner text={state.toast.text} kind={state.toast.kind} /> : null}
      <Footer />
      <PromptEditor
        key={editorEpoch}
        items={items}
        active={inputActive}
        onPopoverChange={onPopoverChange}
        onEmptyChange={onEmptyChange}
        registerClear={registerClear}
        onSubmit={(text) => {
          bufferEmptyRef.current = true;
          void send(text);
        }}
        onShell={(command) => {
          bufferEmptyRef.current = true;
          void runShell(command);
        }}
      />
      <ModalLayer ctx={ctx} />
    </Box>
  );
}
