import { describe, expect, test, mock } from "bun:test";
import { Bus } from "../../src/bus/index.ts";
import { UiStore } from "../../src/tui/store.ts";
import type { App } from "../../src/app.ts";
import { EMPTY_USAGE, type Message, type Part, type SessionInfo } from "../../src/session/types.ts";
import type { PermissionRequest } from "../../src/permission/types.ts";

function makeSession(id: string, over: Partial<SessionInfo> = {}): SessionInfo {
  return { id, title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE }, ...over };
}

function makeMessage(id: string, sessionID: string, role: "user" | "assistant", parts: Part[] = []): Message {
  return { id, sessionID, role, agent: "builder", parts, time: 0 };
}

function makePerm(id: string, sessionID: string): PermissionRequest {
  return { id, sessionID, permission: "bash", patterns: ["rm -rf"], title: "run rm -rf?" };
}

function makeHarness(sessionID = "s1") {
  const bus = new Bus();
  const seed = makeSession(sessionID);
  const ctx = { value: { tokens: 0, usable: 100, pct: 0 } };
  const contextInfoSpy = mock((_id: string) => ctx.value);
  const pend: PermissionRequest[] = [];
  const replySpy = mock((_id: string, _reply: "once" | "always" | "reject", _feedback?: string): void => {});

  const app = {
    bus,
    loaded: { config: { model: "anthropic/claude" } },
    store: {
      get: (id: string) => (id === sessionID ? seed : undefined),
      messagesOf: () => [] as Message[],
    },
    engine: { contextInfo: contextInfoSpy },
    permissions: { pendingRequests: () => pend, reply: replySpy },
    auth: { resolveKey: () => undefined },
  } as unknown as App;

  const store = new UiStore(app, sessionID);
  return { store, bus, seed, ctx, contextInfoSpy, pend, replySpy };
}

const liveText = (m: Message | null): string =>
  (m?.parts ?? []).filter((p): p is Extract<Part, { type: "text" }> => p.type === "text").map((p) => p.text).join("");

describe("UiStore", () => {
  test("message.created (user) appends to history", () => {
    const { store, bus } = makeHarness();
    const user = makeMessage("u1", "s1", "user", [{ id: "p1", type: "text", text: "hi" }]);
    bus.publish({ type: "message.created", message: user });
    const s = store.getSnapshot();
    expect(s.history).toHaveLength(1);
    expect(s.history[0]?.id).toBe("u1");
  });

  test("message.created (assistant) sets live; part.delta appends after flush", () => {
    const { store, bus } = makeHarness();
    const assistant = makeMessage("a1", "s1", "assistant");
    bus.publish({ type: "message.created", message: assistant });
    expect(store.getSnapshot().live?.id).toBe("a1");
    bus.publish({ type: "part.delta", sessionID: "s1", messageID: "a1", partID: "pd1", delta: "hello" });
    // buffered — not yet reflected until the throttle flush:
    store.flush();
    expect(liveText(store.getSnapshot().live)).toBe("hello");
    // a second delta coalesces onto the same streaming part:
    bus.publish({ type: "part.delta", sessionID: "s1", messageID: "a1", partID: "pd1", delta: " world" });
    store.flush();
    expect(liveText(store.getSnapshot().live)).toBe("hello world");
  });

  test("session.status idle flushes live into history and pulls context", () => {
    const { store, bus, ctx, contextInfoSpy } = makeHarness();
    bus.publish({ type: "message.created", message: makeMessage("a1", "s1", "assistant") });
    bus.publish({ type: "part.delta", sessionID: "s1", messageID: "a1", partID: "pd1", delta: "done" });
    const callsBefore = contextInfoSpy.mock.calls.length;
    ctx.value = { tokens: 10, usable: 100, pct: 10 };
    bus.publish({ type: "session.status", sessionID: "s1", status: "idle" });
    const s = store.getSnapshot();
    expect(s.live).toBeNull();
    expect(s.status).toBe("idle");
    expect(s.history.at(-1)?.id).toBe("a1");
    expect(liveText(s.history.at(-1) ?? null)).toBe("done"); // buffered delta flushed before the move
    expect(s.context).toEqual({ tokens: 10, usable: 100, pct: 10 });
    expect(contextInfoSpy.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  test("part.updated for edit/write tool records changedFiles (deduped)", () => {
    const { store, bus } = makeHarness();
    bus.publish({ type: "message.created", message: makeMessage("a1", "s1", "assistant") });
    const toolPart: Part = { id: "tp1", type: "tool", callID: "c1", tool: "write", args: { filePath: "a.ts" }, status: "running" };
    bus.publish({ type: "part.updated", sessionID: "s1", messageID: "a1", part: toolPart });
    expect(store.getSnapshot().changedFiles).toEqual(["a.ts"]);
    // identical event again → still deduped:
    bus.publish({ type: "part.updated", sessionID: "s1", messageID: "a1", part: toolPart });
    expect(store.getSnapshot().changedFiles).toEqual(["a.ts"]);
    // a non-edit/write tool does not contribute:
    const readPart: Part = { id: "tp2", type: "tool", callID: "c2", tool: "read", args: { filePath: "b.ts" }, status: "running" };
    bus.publish({ type: "part.updated", sessionID: "s1", messageID: "a1", part: readPart });
    expect(store.getSnapshot().changedFiles).toEqual(["a.ts"]);
  });

  test("permission queue serializes and replyPermission advances the head", () => {
    const { store, bus, pend, replySpy } = makeHarness();
    const r1 = makePerm("perm1", "s1");
    const r2 = makePerm("perm2", "s1");
    pend.push(r1);
    bus.publish({ type: "permission.asked", request: r1 });
    expect(store.getSnapshot().permission?.id).toBe("perm1");
    pend.push(r2);
    bus.publish({ type: "permission.asked", request: r2 });
    expect(store.getSnapshot().permission?.id).toBe("perm1"); // queued behind the head
    store.replyPermission("once");
    expect(replySpy).toHaveBeenCalledWith("perm1", "once", undefined);
    expect(store.getSnapshot().permission?.id).toBe("perm2");
  });

  test("ghost-guard drops a settled request before surfacing it", () => {
    const { store, bus, pend } = makeHarness();
    const r1 = makePerm("perm1", "s1");
    const r2 = makePerm("perm2", "s1");
    // r1 was settled by a wave-mate and is no longer pending; only r2 remains:
    pend.push(r2);
    bus.publish({ type: "permission.asked", request: r1 });
    bus.publish({ type: "permission.asked", request: r2 });
    expect(store.getSnapshot().permission?.id).toBe("perm2");
  });

  test("events for a different session (subtask child) are ignored", () => {
    const { store, bus } = makeHarness();
    bus.publish({ type: "message.created", message: makeMessage("x1", "other", "user", [{ id: "p", type: "text", text: "x" }]) });
    bus.publish({ type: "part.delta", sessionID: "other", messageID: "x1", partID: "p", delta: "y" });
    bus.publish({ type: "permission.asked", request: makePerm("permX", "other") });
    const s = store.getSnapshot();
    expect(s.history).toHaveLength(0);
    expect(s.permission).toBeNull();
  });

  test("subscribe fires on change; dispose unsubscribes", () => {
    const { store, bus } = makeHarness();
    const cb = mock((): void => {});
    const unsub = store.subscribe(cb);
    bus.publish({ type: "message.created", message: makeMessage("u1", "s1", "user") });
    expect(cb.mock.calls.length).toBeGreaterThan(0);
    const after = cb.mock.calls.length;
    unsub();
    bus.publish({ type: "message.created", message: makeMessage("u2", "s1", "user") });
    expect(cb.mock.calls.length).toBe(after);
    // dispose removes the bus subscription: further events do not mutate state.
    store.dispose();
    const before = store.getSnapshot();
    bus.publish({ type: "message.created", message: makeMessage("u3", "s1", "user") });
    expect(store.getSnapshot()).toBe(before);
  });

  test("getSnapshot returns a stable reference until a change", () => {
    const { store, bus } = makeHarness();
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a); // no change → same reference
    bus.publish({ type: "message.created", message: makeMessage("u1", "s1", "user") });
    const b = store.getSnapshot();
    expect(b).not.toBe(a); // changed → new reference
  });

  test("session.updated replaces session and toast auto-registers", () => {
    const { store, bus } = makeHarness();
    const next = makeSession("s1", { title: "Renamed", model: "openai/o" });
    bus.publish({ type: "session.updated", session: next });
    expect(store.getSnapshot().session.title).toBe("Renamed");
    expect(store.getSnapshot().session.model).toBe("openai/o");
  });

  test("scrollBy clamps to [0, maxOffset] and follows the tail at 0", () => {
    const { store, bus } = makeHarness();
    for (const id of ["u1", "u2", "u3"]) {
      bus.publish({ type: "message.created", message: makeMessage(id, "s1", "user") });
    }
    expect(store.getSnapshot().scrollOffset).toBe(0); // auto-follow tail on new content
    store.scrollBy(-5);
    expect(store.getSnapshot().scrollOffset).toBe(0); // clamped at the bottom
    store.scrollBy(100);
    expect(store.getSnapshot().scrollOffset).toBe(2); // clamped to maxOffset (3 msgs → 2)
  });

  test("imperative modal / reonboarding / appendSynthetic actions mutate state", () => {
    const { store } = makeHarness();
    store.openModal("models");
    expect(store.getSnapshot().modal?.kind).toBe("models");
    store.closeModal();
    expect(store.getSnapshot().modal).toBeNull();
    store.setReonboarding(true);
    expect(store.getSnapshot().reonboarding).toBe(true);
    store.appendSynthetic(makeMessage("syn1", "s1", "assistant", [{ id: "p", type: "text", text: "child" }]));
    expect(store.getSnapshot().history.at(-1)?.id).toBe("syn1");
  });
});
