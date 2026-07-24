import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../../src/session/store.ts";
import {
  exportSession,
  importSession,
  parseSessionExport,
  redactExport,
  SESSION_EXPORT_VERSION,
} from "../../src/session/serialize.ts";
import type { Message } from "../../src/session/types.ts";

function freshStore(): { store: SessionStore; root: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "coven-serialize-root-"));
  const data = mkdtempSync(join(tmpdir(), "coven-serialize-data-"));
  return { store: new SessionStore(root, data), root, data };
}

function userMessage(sessionID: string, text: string): Message {
  return {
    id: `msg_${text}`,
    sessionID,
    role: "user",
    agent: "builder",
    parts: [{ id: "p", type: "text", text }],
    time: 1,
  };
}

function toolMessage(sessionID: string, output: string): Message {
  return {
    id: `msg_tool_${output}`,
    sessionID,
    role: "assistant",
    agent: "builder",
    parts: [
      {
        id: "tp",
        type: "tool",
        callID: "call1",
        tool: "read",
        args: { path: "/etc/passwd" },
        status: "completed",
        output,
      },
    ],
    time: 2,
  };
}

describe("exportSession", () => {
  test("round-trips info + messages through parse/import into a fresh store", () => {
    const src = freshStore();
    const s = src.store.create({ agent: "builder", title: "First" });
    src.store.appendMessage(userMessage(s.id, "hello"));
    src.store.appendMessage(userMessage(s.id, "world"));

    const json = JSON.stringify(exportSession(src.store, s.id));
    const parsed = parseSessionExport(json);

    const dest = freshStore();
    const newId = importSession(dest.store, parsed);
    expect(newId).toBeTruthy();

    const restored = dest.store.get(newId);
    expect(restored?.title).toBe("First");
    expect(restored?.agent).toBe("builder");

    const texts = dest.store
      .messagesOf(newId)
      .map((m) => (m.parts[0]?.type === "text" ? m.parts[0].text : ""));
    expect(texts).toEqual(["hello", "world"]);
  });

  test("import assigns a fresh session id (never reuses source id)", () => {
    const src = freshStore();
    const s = src.store.create({ agent: "builder" });
    src.store.appendMessage(userMessage(s.id, "one"));
    const exp = exportSession(src.store, s.id);

    const dest = freshStore();
    const newId = importSession(dest.store, exp);
    expect(newId).not.toBe(s.id);
    // But session id INSIDE messages is rewritten to the new id (else messagesOf breaks).
    const msgs = dest.store.messagesOf(newId);
    expect(msgs.every((m) => m.sessionID === newId)).toBe(true);
  });

  test("export includes a version header and stamp", () => {
    const src = freshStore();
    const s = src.store.create({ agent: "builder" });
    const exp = exportSession(src.store, s.id);
    expect(exp.version).toBe(SESSION_EXPORT_VERSION);
    expect(typeof exp.exportedAt).toBe("number");
  });

  test("parseSessionExport rejects a payload without required shape", () => {
    expect(() => parseSessionExport("null")).toThrow();
    expect(() => parseSessionExport("{}")).toThrow();
    expect(() => parseSessionExport('{"info":{}}')).toThrow();
  });
});

describe("redactExport", () => {
  test("level 'text' scrubs user text parts but keeps structure", () => {
    const src = freshStore();
    const s = src.store.create({ agent: "builder", title: "T" });
    src.store.appendMessage(userMessage(s.id, "secret-user-text"));
    const exp = exportSession(src.store, s.id);

    const redacted = redactExport(exp, "text");
    const text = redacted.messages[0]!.parts[0];
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.text).not.toContain("secret-user-text");
      expect(text.text).toMatch(/\[REDACTED/i);
    }
  });

  test("level 'aggressive' scrubs tool output AND args paths", () => {
    const src = freshStore();
    const s = src.store.create({ agent: "builder" });
    src.store.appendMessage(toolMessage(s.id, "root:x:0:0:root:/root:/bin/bash"));
    const exp = exportSession(src.store, s.id);

    const redacted = redactExport(exp, "aggressive");
    const part = redacted.messages[0]!.parts[0];
    expect(part?.type).toBe("tool");
    if (part?.type === "tool") {
      expect(part.output ?? "").not.toContain("root:x:0:0");
      expect(JSON.stringify(part.args)).not.toContain("/etc/passwd");
    }
  });

  test("level 'off' leaves the export untouched", () => {
    const src = freshStore();
    const s = src.store.create({ agent: "builder" });
    src.store.appendMessage(userMessage(s.id, "keep-me"));
    const exp = exportSession(src.store, s.id);

    const same = redactExport(exp, "off");
    const p = same.messages[0]!.parts[0];
    if (p?.type === "text") expect(p.text).toBe("keep-me");
  });
});
