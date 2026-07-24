import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../../src/session/store.ts";
import type { Message } from "../../src/session/types.ts";
import { PermissionEngine } from "../../src/permission/index.ts";
import { Bus } from "../../src/bus/index.ts";

function freshStore(): { store: SessionStore; root: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "coven-w2-root-"));
  const data = mkdtempSync(join(tmpdir(), "coven-w2-data-"));
  return { store: new SessionStore(root, data), root, data };
}

function userMessage(sessionID: string, id: string, text: string): Message {
  return {
    id,
    sessionID,
    role: "user",
    agent: "builder",
    parts: [{ id: "p", type: "text", text }],
    time: 1,
  };
}

describe("SessionStore — Wave 2 metadata/archive", () => {
  test("setMetadata persists a metadata blob and reload preserves it", () => {
    const a = freshStore();
    const s = a.store.create({ agent: "builder" });
    a.store.setMetadata(s.id, { prNumber: 123, source: "github-action" });
    const reopened = new SessionStore(a.root, a.data);
    expect(reopened.get(s.id)?.metadata).toEqual({ prNumber: 123, source: "github-action" });
  });

  test("setArchived hides sessions from list() by default, opt-in shows them", () => {
    const a = freshStore();
    const kept = a.store.create({ agent: "builder", title: "kept" });
    const gone = a.store.create({ agent: "builder", title: "gone" });
    a.store.setArchived(gone.id, true);
    const visible = a.store.list().map((s) => s.title);
    expect(visible).toContain("kept");
    expect(visible).not.toContain("gone");
    const withArchived = a.store.list({ archived: true }).map((s) => s.title);
    expect(withArchived).toContain("gone");
  });
});

describe("SessionStore — Wave 2 search + fork", () => {
  test("list({ search }) filters by case-insensitive title substring", () => {
    const a = freshStore();
    a.store.create({ agent: "builder", title: "Fix login bug" });
    a.store.create({ agent: "builder", title: "Refactor auth" });
    a.store.create({ agent: "builder", title: "Weekly report" });
    const hits = a.store.list({ search: "AUTH" }).map((s) => s.title);
    expect(hits).toEqual(["Refactor auth"]);
  });

  test("fork() copies session info + all messages into a fresh id", () => {
    const a = freshStore();
    const s = a.store.create({ agent: "builder", title: "Original" });
    a.store.appendMessage(userMessage(s.id, "m1", "one"));
    a.store.appendMessage(userMessage(s.id, "m2", "two"));
    const forked = a.store.fork(s.id);
    expect(forked.id).not.toBe(s.id);
    expect(forked.title).toContain("Original");
    expect(forked.title).toMatch(/fork/i);
    const texts = a.store.messagesOf(forked.id).map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""));
    expect(texts).toEqual(["one", "two"]);
  });

  test("fork(sessionID, messageID) truncates messages after messageID", () => {
    const a = freshStore();
    const s = a.store.create({ agent: "builder" });
    a.store.appendMessage(userMessage(s.id, "m1", "one"));
    a.store.appendMessage(userMessage(s.id, "m2", "two"));
    a.store.appendMessage(userMessage(s.id, "m3", "three"));
    const forked = a.store.fork(s.id, "m2");
    const texts = a.store.messagesOf(forked.id).map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""));
    expect(texts).toEqual(["one", "two"]);
  });
});

describe("SessionStore — Wave 2 message paging", () => {
  test("messagePage returns the tail window at offset 0", () => {
    const a = freshStore();
    const s = a.store.create({ agent: "builder" });
    for (let i = 0; i < 20; i++) a.store.appendMessage(userMessage(s.id, `m${i}`, `msg-${i}`));
    const tail = a.store.messagePage(s.id, 0, 5);
    expect(tail.map((m) => m.id)).toEqual(["m15", "m16", "m17", "m18", "m19"]);
  });

  test("messagePage(offset, limit) walks backward without loading more than needed", () => {
    const a = freshStore();
    const s = a.store.create({ agent: "builder" });
    for (let i = 0; i < 20; i++) a.store.appendMessage(userMessage(s.id, `m${i}`, `msg-${i}`));
    const older = a.store.messagePage(s.id, 5, 5);
    expect(older.map((m) => m.id)).toEqual(["m10", "m11", "m12", "m13", "m14"]);
  });
});

describe("PermissionEngine — Wave 2 per-session rulesets", () => {
  test("session ruleset overrides the baseline for that session only", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, [{ permission: "bash", pattern: "*", action: "ask" }]);
    engine.setSessionRules("ses_A", [{ permission: "bash", pattern: "*", action: "allow" }]);
    // Session A: bash is allowed; ask() resolves without prompting.
    await engine.ask("ses_A", { permission: "bash", patterns: ["*"], title: "test" });
    // Session B: still needs the prompt (would hang without a replier).
    let asked = false;
    bus.subscribe((event) => {
      if (event.type === "permission.asked" && event.request.sessionID === "ses_B") {
        asked = true;
        engine.reply(event.request.id, "reject");
      }
    });
    await expect(engine.ask("ses_B", { permission: "bash", patterns: ["*"], title: "test" })).rejects.toThrow();
    expect(asked).toBe(true);
  });

  test("session rules can add restrictions on top of agent rules for that session only", async () => {
    const bus = new Bus();
    const engine = new PermissionEngine(bus, []);
    // Agent has a blanket allow.
    const agentRules = [{ permission: "bash", pattern: "*", action: "allow" as const }];
    // Session X locks bash down: allow ls, deny everything else.
    engine.setSessionRules("ses_X", [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "ls*", action: "allow" },
    ]);
    // Session X: "ls -la" is allowed (last-match-wins picks the ls* allow).
    await engine.ask("ses_X", { permission: "bash", patterns: ["ls -la"], title: "test" }, agentRules);
    // Session X: "rm foo" hits the session deny — throws even with agent-allow.
    await expect(engine.ask("ses_X", { permission: "bash", patterns: ["rm foo"], title: "test" }, agentRules)).rejects.toThrow();
    // Session Y: no session rules, agent allows — ok.
    await engine.ask("ses_Y", { permission: "bash", patterns: ["rm foo"], title: "test" }, agentRules);
  });
});
