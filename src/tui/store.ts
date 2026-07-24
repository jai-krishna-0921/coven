/**
 * UiStore — the single bus subscriber inside the TUI.
 *
 * It reduces `BusEvent`s (plus pulled context/cost) into an immutable `UiState`
 * snapshot for `useSyncExternalStore`: `getSnapshot()` returns the SAME object
 * reference until a change, then a NEW one, so React detects updates by identity.
 *
 * Only events for the active `session.id` are folded in — a `subtask:true`
 * command runs in a child session, so its `message.*`/`part.*`/`tool.*` events
 * fail the active-session filter and are dropped by design (§6.3). Streaming
 * `part.delta` text is coalesced on a 25 ms timer to avoid per-token re-render
 * storms; `session.status idle` forces an immediate flush.
 */
import type { App } from "../app.ts";
import type { BusEvent } from "../bus/index.ts";
import type { PermissionRequest } from "../permission/types.ts";
import { EMPTY_USAGE, type Message, type Part, type SessionInfo } from "../session/types.ts";
import { DEFAULT_MODEL } from "../config/schema.ts";
import { todoState } from "../tool/todo.ts";
import type { ModalKind, ModalProps, ToastKind, UiState, UiStoreLike } from "./types.ts";

const FLUSH_MS = 25;
const TOAST_MS = 4000;

/** Narrow an unknown tool-args bag to its optional `filePath` (edit/write both use it). */
function filePathOf(args: unknown): string | undefined {
  if (args && typeof args === "object" && "filePath" in args) {
    const value = (args as { filePath?: unknown }).filePath;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export class UiStore implements UiStoreLike {
  private state: UiState;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  /** Streaming text buffered per partID until the throttle timer fires. */
  private readonly deltaBuffer = new Map<string, string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Serialized permission asks; the head is surfaced in `state.permission`. */
  private permQueue: PermissionRequest[] = [];

  constructor(
    private readonly app: App,
    private sessionID: string,
  ) {
    const session = app.store.get(sessionID) ?? UiStore.fallbackSession(sessionID);
    this.state = {
      session,
      history: [...app.store.messagesOf(sessionID)],
      live: null,
      status: "idle",
      compacting: false,
      context: app.engine.contextInfo(sessionID),
      permission: null,
      modal: null,
      reonboarding: false,
      sidebarOverlay: false,
      scrollOffset: 0,
      toast: null,
      changedFiles: [],
      connectorReady: this.connectorReady(session),
      modelDisplay: this.effectiveModel(session),
      // Seed from what's already connected at startup so the sidebar is live
      // on first render (mcp.status/lsp.status events fire before subscribe).
      mcpServers: app.mcp?.servers() ?? [],
      lspServers: app.lsp?.status() ?? [],
      lspDiagnostics: {},
      todos: todoState.get(sessionID) ?? [],
    };
    this.unsubscribe = app.bus.subscribe((event) => this.handle(event));
  }

  // ---- external-store surface ---------------------------------------------

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getSnapshot(): UiState {
    return this.state;
  }

  dispose(): void {
    this.unsubscribe();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.flushTimer = null;
    this.toastTimer = null;
    this.listeners.clear();
  }

  // ---- imperative UI actions (not bus-driven) -----------------------------

  openModal(kind: ModalKind, props?: ModalProps): void {
    this.set({ modal: props === undefined ? { kind } : { kind, props } });
  }

  closeModal(): void {
    this.set({ modal: null });
  }

  toast(text: string, kind: ToastKind = "info"): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.set({ toast: { text, kind } });
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.set({ toast: null });
    }, TOAST_MS);
    this.toastTimer.unref?.();
  }

  setReonboarding(on: boolean): void {
    this.set({ reonboarding: on });
  }

  appendSynthetic(message: Message): void {
    const history = [...this.state.history, message];
    this.set({ history, scrollOffset: this.clampScroll(history, this.state.live) });
  }

  replyPermission(reply: "once" | "always" | "reject", feedback?: string): void {
    const head = this.state.permission;
    if (!head) return;
    this.app.permissions.reply(head.id, reply, feedback);
    // Advance optimistically; the engine's `permission.replied` echo is idempotent.
    this.dequeuePermission(head.id);
  }

  setSessionID(id: string): void {
    this.sessionID = id;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.deltaBuffer.clear();
    this.permQueue = [];
    const session = this.app.store.get(id) ?? UiStore.fallbackSession(id);
    this.set({
      session,
      history: [...this.app.store.messagesOf(id)],
      live: null,
      status: "idle",
      context: this.app.engine.contextInfo(id),
      permission: null,
      changedFiles: [],
      scrollOffset: 0,
      connectorReady: this.connectorReady(session),
      modelDisplay: this.effectiveModel(session),
    });
  }

  scrollBy(deltaRows: number): void {
    const next = this.clampScroll(this.state.history, this.state.live, this.state.scrollOffset + deltaRows);
    if (next !== this.state.scrollOffset) this.set({ scrollOffset: next });
  }

  /**
   * Scroll the transcript so a specific message is anchored at the top of the
   * visible window. Used by /timeline to jump to a user message. Silently
   * no-ops when the id isn't in `state.history` (e.g. it's the current live
   * message, or the id is stale).
   */
  scrollToMessage(messageID: string): void {
    const idx = this.state.history.findIndex((m) => m.id === messageID);
    if (idx < 0) return;
    const desired = this.state.history.length - 1 - idx;
    const next = this.clampScroll(this.state.history, this.state.live, desired);
    if (next !== this.state.scrollOffset) this.set({ scrollOffset: next });
  }

  /** Coalesce buffered streaming text into `live` (also the test-drivable flush hook). */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.deltaBuffer.size === 0) return;
    const live = this.state.live;
    if (!live) {
      this.deltaBuffer.clear();
      return;
    }
    const parts = [...live.parts];
    for (const [partID, text] of this.deltaBuffer) {
      const idx = parts.findIndex((p) => p.id === partID);
      const existing = idx >= 0 ? parts[idx] : undefined;
      if (existing && (existing.type === "text" || existing.type === "reasoning")) {
        parts[idx] = { ...existing, text: existing.text + text };
      } else if (existing === undefined) {
        parts.push({ id: partID, type: "text", text });
      }
    }
    this.deltaBuffer.clear();
    const nextLive = { ...live, parts };
    this.set({ live: nextLive, scrollOffset: this.clampScroll(this.state.history, nextLive) });
  }

  // ---- bus → state reducer ------------------------------------------------

  private handle(event: BusEvent): void {
    switch (event.type) {
      case "session.created": {
        // A dispatched subagent runs in a child session; announce it in the parent.
        if (event.session.parentID === this.sessionID) this.toast(`▸ dispatched ${event.session.agent}`, "info");
        return;
      }
      case "session.updated": {
        if (event.session.id !== this.sessionID) return;
        const session = event.session;
        this.set({
          session,
          context: this.app.engine.contextInfo(this.sessionID),
          connectorReady: this.connectorReady(session),
          modelDisplay: this.effectiveModel(session),
        });
        return;
      }
      case "session.status": {
        if (event.sessionID !== this.sessionID) return;
        if (event.status !== "idle") {
          this.set({ status: event.status });
          return;
        }
        this.flush(); // fold any remaining buffered deltas into `live` before it settles
        const live = this.state.live;
        const history = live ? [...this.state.history, live] : this.state.history;
        const session = this.app.store.get(this.sessionID) ?? this.state.session;
        this.set({
          status: "idle",
          live: null,
          history,
          session,
          context: this.app.engine.contextInfo(this.sessionID),
          connectorReady: this.connectorReady(session),
          modelDisplay: this.effectiveModel(session),
          scrollOffset: this.clampScroll(history, null),
        });
        return;
      }
      case "message.created": {
        if (event.message.sessionID !== this.sessionID) return;
        if (event.message.role === "user") {
          const history = [...this.state.history, event.message];
          this.set({ history, scrollOffset: this.clampScroll(history, this.state.live) });
        } else {
          this.flush(); // finalize the previous step's assistant message
          const prev = this.state.live;
          const history = prev ? [...this.state.history, prev] : this.state.history;
          this.set({ live: event.message, history, scrollOffset: this.clampScroll(history, event.message) });
        }
        return;
      }
      case "message.updated":
        // Final full message is rebuilt from part.* events; nothing to fold here.
        return;
      case "part.delta": {
        if (event.sessionID !== this.sessionID) return;
        if (!this.state.live || event.messageID !== this.state.live.id) return;
        this.deltaBuffer.set(event.partID, (this.deltaBuffer.get(event.partID) ?? "") + event.delta);
        this.scheduleFlush();
        return;
      }
      case "part.updated": {
        if (event.sessionID !== this.sessionID) return;
        const part = event.part;
        const patch: Partial<UiState> = {};
        if (part.type === "tool" && (part.tool === "edit" || part.tool === "write")) {
          const filePath = filePathOf(part.args);
          if (filePath && !this.state.changedFiles.includes(filePath)) {
            patch.changedFiles = [...this.state.changedFiles, filePath];
          }
        }
        if (this.state.live && event.messageID === this.state.live.id) {
          this.deltaBuffer.delete(part.id); // the full part supersedes any buffered deltas for it
          const parts = [...this.state.live.parts];
          const idx = parts.findIndex((p) => p.id === part.id);
          if (idx >= 0) parts[idx] = part;
          else parts.push(part);
          patch.live = { ...this.state.live, parts };
        }
        if (patch.live) patch.scrollOffset = this.clampScroll(this.state.history, patch.live);
        if (Object.keys(patch).length > 0) this.set(patch);
        return;
      }
      case "tool.started": {
        if (event.sessionID !== this.sessionID || !this.state.live) return;
        if (this.state.live.parts.some((p) => p.type === "tool" && p.callID === event.callID)) return;
        const placeholder: Part = { id: event.callID, type: "tool", callID: event.callID, tool: event.tool, args: {}, status: "running" };
        const nextLive = { ...this.state.live, parts: [...this.state.live.parts, placeholder] };
        this.set({ live: nextLive, scrollOffset: this.clampScroll(this.state.history, nextLive) });
        return;
      }
      case "tool.finished": {
        if (event.sessionID !== this.sessionID || !this.state.live) return;
        const idx = this.state.live.parts.findIndex((p) => p.type === "tool" && p.callID === event.callID);
        if (idx < 0) return;
        const parts = [...this.state.live.parts];
        const existing = parts[idx];
        if (existing && existing.type === "tool") parts[idx] = { ...existing, status: event.status };
        // The todo tool writes to a module-level Map; refresh the sidebar Todo
        // panel whenever it finishes.
        const patch: Partial<UiState> = { live: { ...this.state.live, parts } };
        if (event.tool === "todo") patch.todos = [...(todoState.get(this.sessionID) ?? [])];
        this.set(patch);
        return;
      }
      case "session.compacting": {
        if (event.sessionID !== this.sessionID) return;
        this.set({ compacting: true });
        this.toast("compacting context…", "info");
        return;
      }
      case "session.compacted": {
        if (event.sessionID !== this.sessionID) return;
        this.set({ compacting: false, context: this.app.engine.contextInfo(this.sessionID) });
        this.toast("context compacted", "success");
        return;
      }
      case "permission.asked": {
        if (event.request.sessionID !== this.sessionID) return;
        this.permQueue.push(event.request);
        this.surfacePermission();
        return;
      }
      case "permission.replied": {
        this.dequeuePermission(event.requestID);
        return;
      }
      case "mcp.status": {
        // Replace or append the server row by name — the host emits every
        // transition (connecting → ready / error), and the sidebar should
        // always show the latest per server.
        const others = this.state.mcpServers.filter((s) => s.name !== event.status.name);
        this.set({ mcpServers: [...others, event.status] });
        return;
      }
      case "lsp.status": {
        const others = this.state.lspServers.filter((s) => s.language !== event.status.language);
        this.set({ lspServers: [...others, event.status] });
        return;
      }
      case "lsp.diagnostics": {
        const next = { ...this.state.lspDiagnostics, [event.uri]: event.count };
        // Drop zero-diagnostic entries so the total stays accurate.
        if (event.count === 0) delete next[event.uri];
        this.set({ lspDiagnostics: next });
        return;
      }
      default:
        return;
    }
  }

  // ---- internals ----------------------------------------------------------

  private set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const cb of this.listeners) cb();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_MS);
    this.flushTimer.unref?.();
  }

  /** Surface the queue head, dropping any request the engine has already settled (ghost guard). */
  private surfacePermission(): void {
    const live = new Set(this.app.permissions.pendingRequests().map((r) => r.id));
    this.permQueue = this.permQueue.filter((r) => live.has(r.id));
    const head = this.permQueue[0] ?? null;
    if (head !== this.state.permission) this.set({ permission: head });
  }

  private dequeuePermission(requestID: string): void {
    this.permQueue = this.permQueue.filter((r) => r.id !== requestID);
    this.surfacePermission();
  }

  private connectorReady(session: SessionInfo): boolean {
    const modelRef = session.model ?? this.app.loaded?.config?.model;
    const provider = modelRef?.split("/")[0];
    if (!provider) return false;
    return this.app.auth?.resolveKey(provider) !== undefined;
  }

  /** The "provider/model" actually in effect: per-session override → config → built-in default. */
  private effectiveModel(session: SessionInfo): string {
    return session.model ?? this.app.loaded?.config?.model ?? DEFAULT_MODEL;
  }

  private maxOffset(history: Message[], live: Message | null): number {
    return Math.max(0, history.length + (live ? 1 : 0) - 1);
  }

  private clampScroll(history: Message[], live: Message | null, current = this.state.scrollOffset): number {
    return Math.min(Math.max(0, current), this.maxOffset(history, live));
  }

  private static fallbackSession(id: string): SessionInfo {
    return { id, title: "New session", agent: "builder", created: Date.now(), updated: Date.now(), usage: { ...EMPTY_USAGE } };
  }
}
