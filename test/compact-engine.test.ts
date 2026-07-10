import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../src/agent/index.ts";
import { Bus } from "../src/bus/index.ts";
import { PermissionEngine } from "../src/permission/index.ts";
import { PluginHost } from "../src/plugin/index.ts";
import type { LLMEvent, ProviderResolver, StreamInput } from "../src/provider/types.ts";
import { SessionEngine } from "../src/session/loop.ts";
import { SessionStore } from "../src/session/store.ts";
import { SkillRegistry } from "../src/skill/index.ts";
import { EMPTY_USAGE, type Message } from "../src/session/types.ts";

/** Provider whose summarization stream is scripted (or throws). */
class CompactProvider implements ProviderResolver {
  constructor(private mode: "summary" | "throw") {}
  resolve(modelRef: string) {
    const mode = this.mode;
    return {
      ref: { providerID: "fake", modelID: modelRef },
      adapter: {
        id: "fake",
        async *stream(_input: StreamInput): AsyncGenerator<LLMEvent, void, void> {
          if (mode === "throw") throw new Error("529 overloaded");
          yield { type: "text-start", id: "s" };
          yield { type: "text-delta", id: "s", text: "## Objective\n- ship coven" };
          yield { type: "text-end", id: "s" };
          yield { type: "finish", reason: "stop", usage: { ...EMPTY_USAGE } };
        },
      },
    };
  }
}

async function engineWith(mode: "summary" | "throw") {
  const dir = mkdtempSync(join(tmpdir(), "coven-compact-"));
  const dataDir = mkdtempSync(join(tmpdir(), "coven-compact-data-"));
  const bus = new Bus();
  const store = new SessionStore(dir, dataDir);
  const engine = new SessionEngine({
    config: { model: "fake/model", small_model: "fake/small" },
    root: dir,
    bus,
    store,
    providers: new CompactProvider(mode),
    agents: new AgentRegistry({}, dir),
    skills: await SkillRegistry.load({}, dir),
    plugins: await PluginHost.load({}, dir, bus),
    permissions: new PermissionEngine(bus, []),
  });
  return { engine, store };
}

function seed(store: SessionStore, sessionID: string, turns: number): void {
  for (let i = 0; i < turns; i++) {
    store.appendMessage(mkUser(sessionID, `question ${i}`));
    store.appendMessage(mkAssistant(sessionID, `answer ${i}`));
  }
}

let seq = 0;
function mkUser(sessionID: string, text: string): Message {
  return { id: `msg_u${seq++}`, sessionID, role: "user", agent: "builder", parts: [{ id: `p${seq}`, type: "text", text }], time: seq };
}
function mkAssistant(sessionID: string, text: string): Message {
  return { id: `msg_a${seq++}`, sessionID, role: "assistant", agent: "builder", parts: [{ id: `p${seq}`, type: "text", text }], time: seq };
}

describe("SessionEngine.compact", () => {
  test("success appends a trigger and a summary and reports compacted", async () => {
    const { engine, store } = await engineWith("summary");
    const session = store.create({ agent: "builder" });
    seed(store, session.id, 5);
    const before = store.messagesOf(session.id).length;

    const result = await engine.compact(session.id, { auto: false, abort: new AbortController().signal });
    expect(result.status).toBe("compacted");

    const messages = store.messagesOf(session.id);
    expect(messages.length).toBe(before + 2); // trigger + summary
    const summary = messages.at(-1)!;
    expect(summary.summary).toBe(true);
    expect(summary.finish).toBe("stop");
    expect(summary.parts.some((p) => p.type === "text" && p.text.includes("ship coven"))).toBe(true);
  });

  test("a failed summary appends NOTHING — no dangling trigger persists", async () => {
    const { engine, store } = await engineWith("throw");
    const session = store.create({ agent: "builder" });
    seed(store, session.id, 5);
    const before = store.messagesOf(session.id).length;

    const result = await engine.compact(session.id, { auto: false, abort: new AbortController().signal });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("529");

    // The store is unchanged: no "What did we do so far?" trigger left behind.
    const messages = store.messagesOf(session.id);
    expect(messages.length).toBe(before);
    expect(messages.some((m) => m.compaction)).toBe(false);
    expect(messages.some((m) => m.summary)).toBe(false);
  });

  test("nothing to compact on a short session", async () => {
    const { engine, store } = await engineWith("summary");
    const session = store.create({ agent: "builder" });
    store.appendMessage(mkUser(session.id, "just one question"));
    const result = await engine.compact(session.id, { auto: false, abort: new AbortController().signal });
    expect(result.status).toBe("nothing");
  });
});
