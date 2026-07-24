/**
 * Session persistence: ~/.local/share/coven/projects/<slug>/sessions/<id>/
 *   info.json       — SessionInfo
 *   messages.jsonl  — one Message per line, append-ordered
 * Messages are rewritten in full on update (files are small; simplicity wins).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
   *
   * Kept for legacy callers; new code should use `deleteChecked` which reports
   * the disk-op outcome so a caller can drive the recovery flow.
   */
  delete(sessionID: string): void {
    this.deleteChecked(sessionID);
  }

  /**
   * Same as `delete` but returns whether the disk-op succeeded. In-memory
   * removal always happens; the disk error (if any) is surfaced so the caller
   * can present recovery options (retry / move to trash / metadata-only).
   */
  deleteChecked(sessionID: string): { ok: true } | { ok: false; error: string } {
    this.sessions.delete(sessionID);
    this.messages.delete(sessionID);
    return this.retryRm(sessionID);
  }

  /** Just the disk half — recovery flow calls this after a prior failed attempt. */
  retryRm(sessionID: string): { ok: true } | { ok: false; error: string } {
    const dir = this.dirOf(sessionID);
    if (!existsSync(dir)) return { ok: true };
    try {
      rmSync(dir, { recursive: true, force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  /**
   * Move the session directory into a sibling `trash/` folder timestamped so
   * multiple failed deletes don't collide. Returns the moved-to path so the
   * caller can print it. The in-memory entry has already been removed by
   * `deleteChecked`, so a follow-up `list()` will not surface the session.
   */
  moveToTrash(sessionID: string): { ok: true; path: string } | { ok: false; error: string } {
    const src = this.dirOf(sessionID);
    if (!existsSync(src)) return { ok: true, path: src };
    const trashRoot = join(this.baseDir, "..", "trash");
    const dest = join(trashRoot, `${Date.now()}-${sessionID}`);
    try {
      mkdirSync(trashRoot, { recursive: true });
      renameSync(src, dest);
      return { ok: true, path: dest };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  /**
   * Last-resort: unlink just info.json so `list()` no longer surfaces the
   * session. messages.jsonl stays on disk (an orphan that a user can archive
   * manually). Useful when even the `rmdir` fails (immutable flag, permission
   * quirk).
   */
  unlinkMetadataOnly(sessionID: string): { ok: true } | { ok: false; error: string } {
    const infoPath = join(this.dirOf(sessionID), "info.json");
    if (!existsSync(infoPath)) return { ok: true };
    try {
      unlinkSync(infoPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  list(opts: { search?: string; archived?: boolean } = {}): SessionInfo[] {
    if (existsSync(this.baseDir)) {
      for (const id of readdirSync(this.baseDir)) {
        if (!this.sessions.has(id)) this.loadSession(id);
      }
    }
    const term = opts.search?.trim().toLowerCase();
    return [...this.sessions.values()]
      // Subagent sessions are internal — list only top-level ones.
      .filter((s) => !s.parentID)
      .filter((s) => opts.archived === true ? true : !s.archived)
      .filter((s) => (term ? s.title.toLowerCase().includes(term) : true))
      .sort((a, b) => b.updated - a.updated);
  }

  /**
   * Attach a free-form metadata blob to a session. Overwrites any previous
   * value — callers wanting merge semantics should read + spread first.
   */
  setMetadata(sessionID: string, metadata: Record<string, unknown>): void {
    const session = this.get(sessionID);
    if (!session) return;
    session.metadata = metadata;
    this.update(session);
  }

  /**
   * Archive or unarchive a session. Archived sessions vanish from `list()` by
   * default; `list({archived: true})` shows them for browsing/restoration.
   */
  setArchived(sessionID: string, archived: boolean): void {
    const session = this.get(sessionID);
    if (!session) return;
    session.archived = archived;
    if (archived) session.archivedAt = Date.now();
    this.update(session);
  }

  /**
   * Clone a session into a fresh id, optionally truncating to messages up to
   * (and including) `upToMessageID`. Useful for "try this a different way"
   * without losing the original transcript. Fork counts are appended to the
   * title (`Original (fork #N)`) — matching OpenCode's naming — by inspecting
   * peers with the same base title.
   */
  fork(sourceID: string, upToMessageID?: string): SessionInfo {
    const source = this.get(sourceID);
    if (!source) throw new Error(`no such session: ${sourceID}`);
    const baseTitle = source.title.replace(/\s+\(fork #\d+\)$/, "");
    const forkNumber =
      this.list({ archived: true })
        .filter((s) => s.title === baseTitle || s.title.startsWith(`${baseTitle} (fork #`))
        .length; // includes original, so first fork is #1
    const forked = this.create({ agent: source.agent, title: `${baseTitle} (fork #${forkNumber})` });
    if (source.model) {
      forked.model = source.model;
      this.update(forked);
    }
    const messages = this.messagesOf(sourceID);
    const cutoff = upToMessageID ? messages.findIndex((m) => m.id === upToMessageID) : messages.length - 1;
    const keep = cutoff >= 0 ? messages.slice(0, cutoff + 1) : messages;
    for (const msg of keep) {
      this.appendMessage({ ...msg, sessionID: forked.id, parts: msg.parts.map((p) => ({ ...p })) });
    }
    return forked;
  }

  /**
   * Return a window of messages counted from the tail. `offset` is how many
   * messages to skip back from the newest end (0 = newest), `limit` is the
   * page size. Long sessions can page backward through history without loading
   * the whole array up front. The returned window is in chronological order.
   */
  messagePage(sessionID: string, offset: number, limit: number): Message[] {
    const all = this.messagesOf(sessionID);
    const end = Math.max(0, all.length - Math.max(0, offset));
    const start = Math.max(0, end - Math.max(0, limit));
    return all.slice(start, end);
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
