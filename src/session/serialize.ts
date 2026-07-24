/**
 * Session export / import — portable JSON representation of a session so it can
 * be shared with a teammate, archived, or moved between machines. The wire
 * shape is versioned so we can migrate old exports forward.
 *
 * Redaction has three levels:
 *   off        — verbatim (default)
 *   text       — user + assistant TEXT parts blanked; structure preserved
 *   aggressive — text + tool output + path-like tool-arg strings scrubbed
 */
import type { SessionStore } from "./store.ts";
import { EMPTY_USAGE, type Message, type Part, type SessionInfo } from "./types.ts";
import { createId } from "../util/id.ts";

export const SESSION_EXPORT_VERSION = 1 as const;

export type RedactLevel = "off" | "text" | "aggressive";

export interface SessionExport {
  version: typeof SESSION_EXPORT_VERSION;
  exportedAt: number;
  info: SessionInfo;
  messages: Message[];
}

export function exportSession(store: SessionStore, sessionID: string): SessionExport {
  const info = store.get(sessionID);
  if (!info) throw new Error(`no such session: ${sessionID}`);
  return {
    version: SESSION_EXPORT_VERSION,
    exportedAt: Date.now(),
    info: { ...info },
    messages: store.messagesOf(sessionID).map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p })) })),
  };
}

export function parseSessionExport(json: string): SessionExport {
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("session export: not an object");
  const rec = raw as Record<string, unknown>;
  if (rec.version !== SESSION_EXPORT_VERSION) throw new Error(`session export: unsupported version ${String(rec.version)}`);
  if (!rec.info || typeof rec.info !== "object") throw new Error("session export: missing info");
  if (!Array.isArray(rec.messages)) throw new Error("session export: messages must be an array");
  const info = rec.info as SessionInfo;
  if (!info.id || !info.agent) throw new Error("session export: info.id/agent required");
  return {
    version: SESSION_EXPORT_VERSION,
    exportedAt: typeof rec.exportedAt === "number" ? rec.exportedAt : Date.now(),
    info: { ...info, usage: info.usage ?? { ...EMPTY_USAGE } },
    messages: rec.messages as Message[],
  };
}

/**
 * Import into `store` under a FRESH session id. The source id is thrown away
 * (else the same session imported twice into the same store would collide).
 * Every message's sessionID is rewritten so messagesOf() still works.
 */
export function importSession(store: SessionStore, exp: SessionExport): string {
  const session = store.create({
    agent: exp.info.agent,
    title: exp.info.title,
  });
  if (exp.info.model) {
    session.model = exp.info.model;
    store.update(session);
  }
  if (exp.info.usage) {
    session.usage = { ...exp.info.usage };
    if (typeof exp.info.cost === "number") session.cost = exp.info.cost;
    store.update(session);
  }
  for (const msg of exp.messages) {
    store.appendMessage({ ...msg, sessionID: session.id });
  }
  return session.id;
}

const PATH_LIKE = /(?:[A-Za-z]:)?(?:\/|\\)[\w.\-/\\ ]+/g;

function redactText(text: string): string {
  return `[REDACTED: ${text.length} chars]`;
}

function redactArgs(args: unknown): unknown {
  if (typeof args === "string") return args.replace(PATH_LIKE, "[REDACTED-PATH]");
  if (Array.isArray(args)) return args.map(redactArgs);
  if (args && typeof args === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(args as Record<string, unknown>)) out[key] = redactArgs(val);
    return out;
  }
  return args;
}

function redactPart(part: Part, level: RedactLevel): Part {
  if (level === "off") return part;
  if (part.type === "text") return { ...part, text: redactText(part.text) };
  if (part.type === "reasoning") return { ...part, text: redactText(part.text) };
  if (part.type === "tool" && level === "aggressive") {
    return {
      ...part,
      args: redactArgs(part.args),
      output: part.output ? redactText(part.output) : part.output,
      error: part.error ? redactText(part.error) : part.error,
    };
  }
  return part;
}

export function redactExport(exp: SessionExport, level: RedactLevel): SessionExport {
  if (level === "off") return exp;
  return {
    ...exp,
    messages: exp.messages.map((m) => ({ ...m, parts: m.parts.map((p) => redactPart(p, level)) })),
  };
}
