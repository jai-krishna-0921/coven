/**
 * Session persistence: ~/.local/share/coven/projects/<slug>/sessions/<id>/
 *   info.json       — SessionInfo
 *   messages.jsonl  — one Message per line, append-ordered
 * Messages are rewritten in full on update (files are small; simplicity wins).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { createId } from "../util/id.ts";
import { createLogger } from "../util/log.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "./types.ts";

const log = createLogger("store");

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

  /**
   * Remove a session from memory and best-effort delete its on-disk directory.
   * A read-only HOME (or a missing dir) is not an error — the session vanishes
   * from the in-memory cache either way; disk cleanup is opportunistic.
   */
  delete(sessionID: string): void {
    this.sessions.delete(sessionID);
    this.messages.delete(sessionID);
    try {
      rmSync(this.dirOf(sessionID), { recursive: true, force: true });
    } catch {
      /* best effort — persistence layer may already be disabled */
    }
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

  private persistDisabled = false;

  /**
   * Atomic (tmp + rename) best-effort write. A read-only HOME must not crash the
   * session — persistence disables itself on the first failure; the session
   * still runs, just in-memory.
   */
  private safeWrite(dir: string, file: string, content: string): void {
    if (this.persistDisabled) return;
    try {
      mkdirSync(dir, { recursive: true });
      const tmp = join(dir, `.${file}.${process.pid}.tmp`);
      writeFileSync(tmp, content);
      renameSync(tmp, join(dir, file));
    } catch (error) {
      this.persistDisabled = true;
      log.warn("session persistence disabled — running in memory only", { error: String(error) });
    }
  }

  private persistInfo(session: SessionInfo): void {
    this.safeWrite(this.dirOf(session.id), "info.json", JSON.stringify(session, null, 2));
  }

  private persistMessages(sessionID: string): void {
    const lines = (this.messages.get(sessionID) ?? []).map((m) => JSON.stringify(m)).join("\n");
    this.safeWrite(this.dirOf(sessionID), "messages.jsonl", lines + (lines ? "\n" : ""));
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
