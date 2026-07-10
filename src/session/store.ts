/**
 * Session persistence: ~/.local/share/coven/projects/<slug>/sessions/<id>/
 *   info.json       — SessionInfo
 *   messages.jsonl  — one Message per line, append-ordered
 * Messages are rewritten in full on update (files are small; simplicity wins).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { createId } from "../util/id.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "./types.ts";

function projectSlug(root: string): string {
  const base = root.split("/").filter(Boolean).pop() ?? "root";
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

export class SessionStore {
  private baseDir: string;
  private messages = new Map<string, Message[]>();
  private sessions = new Map<string, SessionInfo>();

  constructor(root: string, dataDir?: string) {
    this.baseDir = join(dataDir ?? join(homedir(), ".local", "share", "coven"), "projects", projectSlug(root), "sessions");
  }

  create(input: { agent: string; parentID?: string; title?: string }): SessionInfo {
    const session: SessionInfo = {
      id: createId("ses"),
      title: input.title ?? "New session",
      agent: input.agent,
      parentID: input.parentID,
      created: Date.now(),
      updated: Date.now(),
      usage: { ...EMPTY_USAGE },
    };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    this.persistInfo(session);
    return session;
  }

  get(sessionID: string): SessionInfo | undefined {
    if (!this.sessions.has(sessionID)) this.loadSession(sessionID);
    return this.sessions.get(sessionID);
  }

  update(session: SessionInfo): void {
    session.updated = Date.now();
    this.sessions.set(session.id, session);
    this.persistInfo(session);
  }

  list(): SessionInfo[] {
    if (existsSync(this.baseDir)) {
      for (const id of readdirSync(this.baseDir)) {
        if (!this.sessions.has(id)) this.loadSession(id);
      }
    }
    // Subagent sessions are internal — list only top-level ones.
    return [...this.sessions.values()].filter((s) => !s.parentID).sort((a, b) => b.updated - a.updated);
  }

  messagesOf(sessionID: string): Message[] {
    if (!this.messages.has(sessionID)) this.loadSession(sessionID);
    return this.messages.get(sessionID) ?? [];
  }

  appendMessage(message: Message): void {
    const list = this.messagesOf(message.sessionID);
    list.push(message);
    this.persistMessages(message.sessionID);
  }

  updateMessage(message: Message): void {
    const list = this.messagesOf(message.sessionID);
    const index = list.findIndex((m) => m.id === message.id);
    if (index >= 0) list[index] = message;
    else list.push(message);
    this.persistMessages(message.sessionID);
  }

  /** Re-persist a session's messages after in-place part mutations (e.g. pruning). */
  persist(sessionID: string): void {
    this.persistMessages(sessionID);
  }

  private dirOf(sessionID: string): string {
    return join(this.baseDir, sessionID);
  }

  private persistInfo(session: SessionInfo): void {
    const dir = this.dirOf(session.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "info.json"), JSON.stringify(session, null, 2));
  }

  private persistMessages(sessionID: string): void {
    const dir = this.dirOf(sessionID);
    mkdirSync(dir, { recursive: true });
    const lines = (this.messages.get(sessionID) ?? []).map((m) => JSON.stringify(m)).join("\n");
    writeFileSync(join(dir, "messages.jsonl"), lines + (lines ? "\n" : ""));
  }

  private loadSession(sessionID: string): void {
    const dir = this.dirOf(sessionID);
    const infoPath = join(dir, "info.json");
    if (!existsSync(infoPath)) return;
    let info: SessionInfo;
    try {
      info = JSON.parse(readFileSync(infoPath, "utf8")) as SessionInfo;
    } catch {
      return; // Unreadable info.json — treat the session as absent.
    }
    this.sessions.set(sessionID, info);

    // Parse messages line-by-line and KEEP the valid ones. A single truncated
    // trailing line (interrupted write) must not erase the whole history — if
    // we returned [] here, the next append would rewrite the file and destroy it.
    const messages: Message[] = [];
    const messagesPath = join(dir, "messages.jsonl");
    if (existsSync(messagesPath)) {
      const lines = readFileSync(messagesPath, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          messages.push(JSON.parse(line) as Message);
        } catch {
          // Skip one corrupt line rather than discard every message.
        }
      }
    }
    this.messages.set(sessionID, messages);
  }
}
