import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/session/store.ts";
import type { Message } from "../src/session/types.ts";

function freshStore(): { store: SessionStore; root: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "coven-store-root-"));
  const data = mkdtempSync(join(tmpdir(), "coven-store-data-"));
  return { store: new SessionStore(root, data), root, data };
}

function userMessage(sessionID: string, text: string): Message {
  return { id: `msg_${text}`, sessionID, role: "user", agent: "builder", parts: [{ id: "p", type: "text", text }], time: 1 };
}

describe("SessionStore", () => {
  test("persists and reloads a session's messages", () => {
    const a = freshStore();
    const session = a.store.create({ agent: "builder" });
    a.store.appendMessage(userMessage(session.id, "one"));
    a.store.appendMessage(userMessage(session.id, "two"));

    // A fresh store instance over the same data dir reloads from disk.
    const reopened = new SessionStore(a.root, a.data);
    expect(reopened.messagesOf(session.id).map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""))).toEqual(["one", "two"]);
  });

  test("a corrupt trailing line does NOT erase the whole session history", () => {
    const a = freshStore();
    const session = a.store.create({ agent: "builder" });
    a.store.appendMessage(userMessage(session.id, "keep-me"));

    // Simulate an interrupted write: append a truncated JSON line to the file.
    const walk = (dir: string): string | undefined => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = walk(p);
          if (found) return found;
        } else if (entry.name === "messages.jsonl") return p;
      }
      return undefined;
    };
    const messagesPath = walk(join(a.data, "projects"))!;
    appendFileSync(messagesPath, '{"id":"msg_broken","role":"user","parts":[{"type":"text","text":"trunc');

    const reopened = new SessionStore(a.root, a.data);
    const messages = reopened.messagesOf(session.id);
    // The intact message survives; the corrupt line is skipped, not fatal.
    expect(messages.map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""))).toEqual(["keep-me"]);

    // And a subsequent append does not destroy the recovered history.
    reopened.appendMessage(userMessage(session.id, "after-recovery"));
    const final = new SessionStore(a.root, a.data).messagesOf(session.id);
    expect(final.map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""))).toEqual(["keep-me", "after-recovery"]);
  });
});
