import { describe, expect, test, mock } from "bun:test";
import { buildPaletteItems, resolveSlash, runCommandSubtask, listConnectors } from "../../src/tui/commands.ts";
import type { CommandContext, PaletteItem } from "../../src/tui/types.ts";

describe("resolveSlash", () => {
  const items: PaletteItem[] = [
    { id: "theme.toggle", title: "Toggle", slash: "theme-toggle", category: "Theme", run() {} },
    { id: "cmd:review", title: "Review", slash: "review", category: "Custom", run() {} },
    { id: "session.new", title: "New", slash: "new", category: "Session", aliases: ["clear"], run() {} },
  ];
  test("matches a bare command", () => {
    expect(resolveSlash(items, "/theme-toggle")?.item.id).toBe("theme.toggle");
  });
  test("splits name and args", () => {
    const r = resolveSlash(items, "/review HEAD~1");
    expect(r?.item.id).toBe("cmd:review");
    expect(r?.args).toBe("HEAD~1");
  });
  test("matches an alias", () => {
    expect(resolveSlash(items, "/clear")?.item.id).toBe("session.new");
  });
  test("non-slash text and unknown commands return null", () => {
    expect(resolveSlash(items, "hello")).toBeNull();
    expect(resolveSlash(items, "/nope")).toBeNull();
  });
});
import type { App } from "../../src/app.ts";
import type { CommandDef } from "../../src/command/types.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "../../src/session/types.ts";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";

const initDef: CommandDef = {
  name: "init", description: "", template: "do $ARGUMENTS", source: "builtin", hints: ["$ARGUMENTS"],
};

function makeSession(id: string, over: Partial<SessionInfo> = {}): SessionInfo {
  return { id, title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE }, ...over };
}

function makeMessage(sessionID: string): Message {
  return {
    id: "msg1", sessionID, role: "assistant", agent: "builder",
    parts: [{ id: "p1", type: "text", text: "child done" }], time: 0,
  };
}

function makeCtx(defs: CommandDef[] = [initDef]) {
  const createSpy = mock((input: { agent: string; parentID?: string; title?: string }): SessionInfo =>
    makeSession("child1", { agent: input.agent, parentID: input.parentID, title: input.title }));
  const setModelSpy = mock((_id: string, _ref: string): SessionInfo => makeSession("child1"));
  const promptSpy = mock(async (sessionID: string): Promise<Message> => makeMessage(sessionID));
  const expandSpy = mock(async (def: CommandDef, rawArgs: string): Promise<string> =>
    def.template.replace("$ARGUMENTS", rawArgs));

  const setKeySpy = mock((_provider: string, _key: string): void => {});
  const app = {
    loaded: { root: "/tmp/coven-test" },
    store: { create: createSpy, get: () => undefined, update: () => {} },
    engine: { prompt: promptSpy, setModel: setModelSpy, compact: async () => ({ status: "nothing" }) },
    commands: { all: () => defs, expand: expandSpy, get: () => undefined },
    bus: { publish: () => {} },
    providers: { invalidate: () => {} },
    tts: { backend: "say", enabled: false },
    catalog: {
      providers: () => [
        { id: "anthropic", name: "Anthropic", env: ["ANTHROPIC_API_KEY"] },
        { id: "openai", name: "OpenAI", env: ["OPENAI_API_KEY"] },
        { id: "ollama", name: "Ollama", env: [] },
      ],
      list: () => [],
      get: () => ({}),
    },
    auth: {
      resolveKey: (id: string) => (id === "anthropic" ? { key: "sk-live", source: "env" as const } : undefined),
      set: setKeySpy,
      entries: () => [],
    },
  } as unknown as App;

  const sendSpy = mock(async (_text: string, _override?: { agent?: string; model?: string }): Promise<void> => {});
  const appendSyntheticSpy = mock((_m: Message): void => {});
  const toastSpy = mock((_t: string): void => {});
  const openModalSpy = mock((): void => {});
  const setSessionIDSpy = mock((_id: string): void => {});

  const ctx: CommandContext = {
    app,
    store: {
      setSessionID: setSessionIDSpy,
      appendSynthetic: appendSyntheticSpy,
      replyPermission: () => {},
      openModal: () => {},
      closeModal: () => {},
      toast: toastSpy,
      setReonboarding: () => {},
      scrollBy: () => {},
    },
    session: makeSession("parent1"),
    abort: new AbortController().signal,
    host: { redraw() {}, openEditor: async () => {}, attachFile() {}, exportTranscript: async () => {}, interrupt() {}, quit() {} },
    send: sendSpy,
    gateShell: async () => true,
    openModal: openModalSpy,
    closeModal: () => {},
    toast: () => {},
    prefs: { ...DEFAULT_PREFS },
    setPrefs: () => {},
  };

  return { ctx, createSpy, setModelSpy, promptSpy, expandSpy, sendSpy, appendSyntheticSpy, toastSpy, openModalSpy, setSessionIDSpy, setKeySpy };
}

describe("buildPaletteItems", () => {
  test("includes core builtin ids and template items", () => {
    const { ctx } = makeCtx();
    const items = buildPaletteItems(ctx);
    for (const id of ["session.new", "command.palette", "theme.picker", "voice.toggle"]) {
      expect(items.find((i) => i.id === id), id).toBeTruthy();
    }
    expect(items.find((i) => i.id === "cmd:init")).toBeTruthy();
  });

  test("cmd:init expands then sends with no args and no override", async () => {
    const { ctx, expandSpy, sendSpy } = makeCtx();
    const item = buildPaletteItems(ctx).find((i) => i.id === "cmd:init");
    expect(item).toBeTruthy();
    await item!.run(ctx);
    expect(expandSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0];
    expect(call?.[0]).toBe("do "); // "$ARGUMENTS" replaced by empty string
    expect(call?.[1]).toBeUndefined();
  });

  test("subtask template routes through runCommandSubtask", async () => {
    const subtaskDef: CommandDef = {
      name: "review", description: "", template: "review $ARGUMENTS", source: "builtin",
      hints: ["$ARGUMENTS"], subtask: true, agent: "reviewer",
    };
    const { ctx, createSpy, appendSyntheticSpy } = makeCtx([subtaskDef]);
    const item = buildPaletteItems(ctx).find((i) => i.id === "cmd:review");
    expect(item).toBeTruthy();
    await item!.run(ctx);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0]?.[0]?.parentID).toBe("parent1");
    expect(appendSyntheticSpy).toHaveBeenCalledTimes(1);
    expect(appendSyntheticSpy.mock.calls[0]?.[0]?.sessionID).toBe("parent1");
  });
});

describe("listConnectors", () => {
  test("marks a keyless provider (ollama) as ready, a keyed provider by its env key, and an unconfigured one as not ready", () => {
    const { ctx } = makeCtx();
    const list = listConnectors(ctx);
    const ollama = list.find((c) => c.id === "ollama");
    const anthropic = list.find((c) => c.id === "anthropic");
    const openai = list.find((c) => c.id === "openai");

    expect(ollama).toMatchObject({ keyless: true, ready: true });
    expect(anthropic).toMatchObject({ keyless: false, ready: true, source: "env", envVar: "ANTHROPIC_API_KEY" });
    expect(openai).toMatchObject({ keyless: false, ready: false, envVar: "OPENAI_API_KEY" });
  });
});

describe("connector commands", () => {
  test("/login opens the connectors picker", () => {
    const { ctx, openModalSpy } = makeCtx();
    buildPaletteItems(ctx).find((i) => i.id === "auth.login")!.run(ctx);
    expect(openModalSpy).toHaveBeenCalledWith("connectors");
  });

  test("/connectors opens the connectors picker", () => {
    const { ctx, openModalSpy } = makeCtx();
    buildPaletteItems(ctx).find((i) => i.id === "connectors")!.run(ctx);
    expect(openModalSpy).toHaveBeenCalledWith("connectors");
  });

  test("/model <ref> sets that exact model ref on the session", async () => {
    const { ctx, setModelSpy, openModalSpy } = makeCtx();
    const item = buildPaletteItems(ctx).find((i) => i.id === "model.set");
    expect(item).toBeTruthy();
    await item!.run(ctx, "ollama/llama3.2");
    expect(setModelSpy).toHaveBeenCalledWith("parent1", "ollama/llama3.2");
    expect(openModalSpy).not.toHaveBeenCalled();
  });

  test("/model with no args opens the model picker", async () => {
    const { ctx, setModelSpy, openModalSpy } = makeCtx();
    await buildPaletteItems(ctx).find((i) => i.id === "model.set")!.run(ctx, "");
    expect(setModelSpy).not.toHaveBeenCalled();
    expect(openModalSpy).toHaveBeenCalledWith("models");
  });
});

describe("runCommandSubtask", () => {
  test("creates child, honours model via setModel, then appends synthetic result", async () => {
    const { ctx, createSpy, setModelSpy, promptSpy, appendSyntheticSpy } = makeCtx();
    await runCommandSubtask(ctx, { agent: "researcher", model: "openai/gpt-5.4", text: "hi", label: "/review" });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0]?.[0]).toEqual({ agent: "researcher", parentID: "parent1", title: "/review" });
    expect(setModelSpy).toHaveBeenCalledWith("child1", "openai/gpt-5.4");
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(promptSpy.mock.calls[0]?.[0]).toBe("child1");
    expect(appendSyntheticSpy).toHaveBeenCalledTimes(1);
    expect(appendSyntheticSpy.mock.calls[0]?.[0]?.sessionID).toBe("parent1");
  });

  test("omits setModel when no model given", async () => {
    const { ctx, setModelSpy, promptSpy } = makeCtx();
    await runCommandSubtask(ctx, { agent: "researcher", text: "hi", label: "/x" });
    expect(setModelSpy).not.toHaveBeenCalled();
    expect(promptSpy).toHaveBeenCalledTimes(1);
  });
});
