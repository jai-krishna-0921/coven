import type { SessionInfo, Message } from "../session/types.ts";
import type { App } from "../app.ts";
import type { PermissionRequest } from "../permission/types.ts";
import type { UiPrefs } from "./prefs.ts";
import type { McpServerStatus } from "../mcp/types.ts";
import type { LspServerStatus } from "../lsp/types.ts";
// NOTE: do NOT import ./store.ts here — it is produced in Task 14 and a forward module
// import would fail every intervening `tsc --noEmit` gate. CommandContext.store is typed
// structurally via UiStoreLike below; the concrete UiStore (Task 14) `implements UiStoreLike`.

export type ModalKind =
  | "palette" | "help" | "whichkey" | "sessions" | "models" | "agents"
  | "themes" | "skills" | "permission" | "status" | "confirm" | "prompt"
  | "connectors" | "timeline";
export type ToastKind = "info" | "success" | "warn" | "error";
export type PaletteCategory =
  | "System" | "Session" | "Model" | "Agent" | "Theme" | "View"
  | "Voice" | "Prompt" | "Skill" | "Auth" | "Custom";

export interface Completion {
  value: string; label: string; hint?: string;
  kind: "command" | "file"; matched?: number[];
}

// Typed modal props (consumed by ModalLayer in Task 39; opened via CommandContext.openModal).
export type ModalProps =
  | { kind: "rename"; message: string; initial: string; onSubmit(title: string): void }
  | { kind: "login"; message: string; onSubmit(key: string): void }
  | { kind: "confirm"; message: string; onYes(): void; onNo(): void };

// Structural view of UiStore (Task 14) so types.ts has no forward module dependency.
export interface UiStoreLike {
  setSessionID(id: string): void;
  appendSynthetic(message: Message): void;
  replyPermission(reply: "once" | "always" | "reject", feedback?: string): void;
  openModal(kind: ModalKind, props?: ModalProps): void;
  closeModal(): void;
  toast(text: string, kind?: ToastKind): void;
  setReonboarding(on: boolean): void;
  scrollBy(deltaRows: number): void;   // + = older/up, − = newer/down; clamps; 0 follows tail
  scrollToMessage(messageID: string): void; // anchor the transcript on a specific message; no-op if id not in history
  clearInput?(): void;                 // optional hook the editor registers for ctrl-c clear
}

export interface UiState {
  session: SessionInfo;
  history: Message[];
  live: Message | null;
  status: "idle" | "busy" | "error";
  compacting: boolean;
  context: { tokens: number; usable: number; pct: number };
  permission: PermissionRequest | null;
  modal: { kind: ModalKind; props?: ModalProps } | null;
  reonboarding: boolean;
  sidebarOverlay: boolean;
  scrollOffset: number;          // rows scrolled up from the tail; 0 = following the live tail
  toast: { text: string; kind: ToastKind } | null;
  changedFiles: string[];
  connectorReady: boolean;
  modelDisplay: string;          // the "provider/model" actually in effect (override → session → config → default)
  mcpServers: McpServerStatus[]; // sidebar MCP panel — live from bus mcp.status events
  lspServers: LspServerStatus[]; // sidebar LSP panel — live from bus lsp.status events
  lspDiagnostics: Record<string, number>; // uri → count, drives Footer diagnostics count
  todos: { content: string; status: "pending" | "in_progress" | "completed" }[]; // active session's todo list
}

export interface CommandHost {           // App-local actions the App injects (Task 43)
  redraw(): void;
  openEditor(): Promise<void>;
  attachFile(): void;
  exportTranscript(): Promise<void>;
  interrupt(): void;
  quit(): void;
}

export interface CommandContext {
  app: App;
  store: UiStoreLike;
  session: SessionInfo;
  abort: AbortSignal;
  host: CommandHost;
  send(text: string, override?: { agent?: string; model?: string }): Promise<void>;
  gateShell(command: string): Promise<boolean>;   // permission-gated shell for command expansion (App wires to app.permissions.ask)
  openModal(kind: ModalKind, props?: ModalProps): void;
  closeModal(): void;
  toast(text: string, kind?: ToastKind): void;
  prefs: UiPrefs;
  setPrefs(patch: Partial<UiPrefs>): void;
}

export interface PaletteItem {
  id: string; title: string; slash: string; category: PaletteCategory;
  keybinding?: string; aliases?: string[];
  run(ctx: CommandContext, args?: string): void | Promise<void>;
  enabled?(ctx: CommandContext): boolean;
}

export type KeyAction = { kind: "command"; id: string } | { kind: "builtin"; name: string };
export interface KeyContext { modalOpen: boolean; busy: boolean; popoverOpen: boolean; bufferEmpty: boolean; }
